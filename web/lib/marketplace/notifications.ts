/**
 * Notifications (deals platform Chunk 39).
 *
 * - Preference grid: GET|PATCH /operators/:id/notifications/me
 * - notify(operatorId, eventType, payload): fans out to email / SMS / in-app
 *   per member prefs; dedupes by optional incidentKey
 * - In-app inbox: list + mark-read
 * - Daily performance summary job (operator morning local time)
 *
 * Channel providers default to console stubs (Resend/SMS not wired for
 * marketplace events yet). Inject via setNotificationChannelProviders.
 */

/**
 * IMPORTANT: keep this module free of server-only imports (auth, permissions,
 * next/headers, supabase/server) and free of value/type imports from
 * deal-draft. booking-link / deal-publish-validation are pulled into client
 * components via the deal editor; pulling deal-draft → permissions → auth
 * breaks the Next.js client build (`next/headers` in a client graph).
 */
import {
  listTeamMembers,
  type OperatorStore,
  type TeamMember,
} from "./operators";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  MANDATORY_NOTIFICATION_EVENTS,
  NOTIFICATION_EVENT_TYPES,
  buildDefaultNotificationPreferences,
  isNotificationEventType,
  validateNotificationPreferenceFields,
  type NotificationChannels,
  type NotificationEventType,
  type NotificationPreference,
} from "./settings";
import { getZonedParts, localDateKey, zonedLocalToUtcIso } from "./timezone";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class NotificationError extends Error {
  readonly status: number;
  readonly errors?: Array<{ field: string; message: string }>;

  constructor(
    message: string,
    status = 400,
    errors?: Array<{ field: string; message: string }>
  ) {
    super(message);
    this.name = "NotificationError";
    this.status = status;
    this.errors = errors;
  }
}

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type InAppNotification = {
  id: string;
  userId: string;
  operatorId: string;
  eventType: NotificationEventType;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
};

export type NotificationDelivery = {
  id: string;
  operatorId: string;
  userId: string;
  eventType: NotificationEventType;
  channel: "email" | "sms" | "in_app";
  incidentKey: string | null;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  at: string;
};

export type NotificationIncident = {
  incidentKey: string;
  operatorId: string;
  eventType: NotificationEventType;
  notifiedAt: string;
};

/** Tracks which local calendar day a daily summary was sent for an operator. */
export type DailySummarySent = {
  operatorId: string;
  /** YYYY-MM-DD in operator timezone */
  localDate: string;
  sentAt: string;
};

export type NotifyPayload = Record<string, unknown> & {
  title?: string;
  body?: string;
};

export type NotifyOptions = {
  now?: string;
  /** When set, skip if this incident was already notified. */
  incidentKey?: string | null;
  title?: string;
  body?: string;
};

export type NotifyResult = {
  skipped: boolean;
  reason?: "incident_deduped" | "no_recipients" | "operator_missing";
  deliveries: NotificationDelivery[];
  inAppCreated: InAppNotification[];
};

export type NotificationChannelProviders = {
  sendEmail: (msg: {
    to: string;
    subject: string;
    body: string;
    payload: Record<string, unknown>;
  }) => void | Promise<void>;
  sendSms: (msg: {
    to: string;
    body: string;
    payload: Record<string, unknown>;
  }) => void | Promise<void>;
};

// ---------------------------------------------------------------------------
// Labels / copy
// ---------------------------------------------------------------------------

export const NOTIFICATION_EVENT_LABELS: Record<NotificationEventType, string> = {
  integration_sync_failing: "Integration sync failing",
  deal_auto_paused: "Deal auto-paused",
  attestation_due: "Attestation due",
  booking_link_broken: "Booking link broken",
  deal_review_update: "Deal review update",
  deal_lifecycle: "Deal lifecycle",
  auto_rule_created_deals: "Auto-rule created deals",
  daily_performance_summary: "Daily performance summary",
  compliance_expiring: "Compliance expiring",
};

export const NOTIFICATION_EVENT_DESCRIPTIONS: Record<
  NotificationEventType,
  string
> = {
  integration_sync_failing:
    "When a connected booking system stops syncing and deals may be hidden.",
  deal_auto_paused: "When the platform auto-pauses a deal (capacity, price, etc.).",
  attestation_due: "Reminders to reconfirm seats on manual deals.",
  booking_link_broken: "When a booking URL fails reachability checks twice.",
  deal_review_update: "When a deal is submitted, approved, or rejected for review.",
  deal_lifecycle: "When a deal goes live, sells out, or expires.",
  auto_rule_created_deals: "When an auto-deal rule creates new draft or live deals.",
  daily_performance_summary: "A morning email with yesterday’s deal performance.",
  compliance_expiring: "When required compliance documents are nearing expiry.",
};

const MANDATORY_SET = new Set<string>(MANDATORY_NOTIFICATION_EVENTS);

export function isMandatoryNotificationEvent(
  eventType: NotificationEventType
): boolean {
  return MANDATORY_SET.has(eventType);
}

export function channelsEnabled(pref: NotificationChannels): boolean {
  return pref.email || pref.sms || pref.inApp;
}

// ---------------------------------------------------------------------------
// Store helpers
// ---------------------------------------------------------------------------

/**
 * Structural store shape used by notify/prefs (compatible with DealDraftStore
 * without importing it — keeps this module out of the server-only import graph).
 */
export type NotificationDealStore = {
  operators: OperatorStore;
  deals: Map<string, { operatorId: string }>;
  notificationPreferences?: Map<string, NotificationPreference>;
  inAppNotifications?: Map<string, InAppNotification>;
  notificationIncidents?: Map<string, NotificationIncident>;
  notificationDeliveries?: Map<string, NotificationDelivery>;
  dailySummarySent?: Map<string, DailySummarySent>;
};

export type NotificationStoreMaps = {
  preferences: Map<string, NotificationPreference>;
  inApp: Map<string, InAppNotification>;
  incidents: Map<string, NotificationIncident>;
  deliveries: Map<string, NotificationDelivery>;
  dailySummarySent: Map<string, DailySummarySent>;
};

function ensureMaps(store: NotificationDealStore): NotificationStoreMaps {
  if (!store.notificationPreferences) {
    store.notificationPreferences = new Map();
  }
  if (!store.inAppNotifications) {
    store.inAppNotifications = new Map();
  }
  if (!store.notificationIncidents) {
    store.notificationIncidents = new Map();
  }
  if (!store.notificationDeliveries) {
    store.notificationDeliveries = new Map();
  }
  if (!store.dailySummarySent) {
    store.dailySummarySent = new Map();
  }
  return {
    preferences: store.notificationPreferences,
    inApp: store.inAppNotifications,
    incidents: store.notificationIncidents,
    deliveries: store.notificationDeliveries,
    dailySummarySent: store.dailySummarySent,
  };
}

/** Seed preference rows into the draft store (dev HTTP / tests). */
export function seedNotificationPreferences(
  store: NotificationDealStore,
  prefs: NotificationPreference[]
): void {
  const maps = ensureMaps(store);
  for (const p of prefs) {
    maps.preferences.set(p.id, p);
  }
}

function prefKey(userId: string, operatorId: string, eventType: string): string {
  return `${userId}:${operatorId}:${eventType}`;
}

function findPref(
  maps: NotificationStoreMaps,
  userId: string,
  operatorId: string,
  eventType: NotificationEventType
): NotificationPreference | undefined {
  for (const p of maps.preferences.values()) {
    if (
      p.userId === userId &&
      p.operatorId === operatorId &&
      p.eventType === eventType
    ) {
      return p;
    }
  }
  return undefined;
}

/**
 * Ensure default preference rows exist for an accepted member.
 * Idempotent — only inserts missing event types.
 */
export function ensureDefaultPreferencesForMember(
  store: NotificationDealStore,
  userId: string,
  operatorId: string,
  options?: { now?: string }
): NotificationPreference[] {
  const maps = ensureMaps(store);
  const now = options?.now ?? new Date().toISOString();
  const existing = [...maps.preferences.values()].filter(
    (p) => p.userId === userId && p.operatorId === operatorId
  );
  const have = new Set(existing.map((p) => p.eventType));
  const created: NotificationPreference[] = [];
  for (const eventType of NOTIFICATION_EVENT_TYPES) {
    if (have.has(eventType)) continue;
    const channels = DEFAULT_NOTIFICATION_PREFERENCES[eventType];
    const row: NotificationPreference = {
      id: crypto.randomUUID(),
      userId,
      operatorId,
      eventType,
      email: channels.email,
      sms: channels.sms,
      inApp: channels.inApp,
      createdAt: now,
      updatedAt: now,
    };
    maps.preferences.set(row.id, row);
    created.push(row);
  }
  return [...existing, ...created];
}

function acceptedMembersWithUser(
  store: NotificationDealStore,
  operatorId: string
): TeamMember[] {
  return listTeamMembers(store.operators, operatorId).filter(
    (m) => m.inviteStatus === "accepted" && m.userId != null
  );
}

// ---------------------------------------------------------------------------
// Serializers
// ---------------------------------------------------------------------------

export function serializeNotificationPreference(
  pref: NotificationPreference
): Record<string, unknown> {
  return {
    id: pref.id,
    user_id: pref.userId,
    operator_id: pref.operatorId,
    event_type: pref.eventType,
    email: pref.email,
    sms: pref.sms,
    in_app: pref.inApp,
    mandatory: isMandatoryNotificationEvent(pref.eventType),
    label: NOTIFICATION_EVENT_LABELS[pref.eventType],
    description: NOTIFICATION_EVENT_DESCRIPTIONS[pref.eventType],
    created_at: pref.createdAt,
    updated_at: pref.updatedAt,
  };
}

export function serializeInAppNotification(
  row: InAppNotification
): Record<string, unknown> {
  return {
    id: row.id,
    user_id: row.userId,
    operator_id: row.operatorId,
    event_type: row.eventType,
    title: row.title,
    body: row.body,
    payload: row.payload,
    read_at: row.readAt,
    created_at: row.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Preference GET / PATCH
// ---------------------------------------------------------------------------
// Permission checks live in the API routes via requirePermission
// (settings.notifications.own) — do not import permissions here.

export function getMyNotificationPreferences(
  store: NotificationDealStore,
  operatorId: string,
  userId: string,
  options?: { now?: string }
): NotificationPreference[] {
  if (!store.operators.operators.has(operatorId)) {
    throw new NotificationError("Operator not found", 404);
  }
  const prefs = ensureDefaultPreferencesForMember(store, userId, operatorId, {
    now: options?.now,
  });
  return NOTIFICATION_EVENT_TYPES.map(
    (eventType) => prefs.find((p) => p.eventType === eventType)!
  );
}

export type PatchNotificationPreferenceInput = {
  event_type?: unknown;
  eventType?: unknown;
  email?: unknown;
  sms?: unknown;
  in_app?: unknown;
  inApp?: unknown;
};

/**
 * Patch one event's channels for the current user.
 * Rejects turning off the last channel on a mandatory event.
 */
export function patchMyNotificationPreference(
  store: NotificationDealStore,
  operatorId: string,
  userId: string,
  body: PatchNotificationPreferenceInput,
  options?: { now?: string }
): NotificationPreference {
  if (!store.operators.operators.has(operatorId)) {
    throw new NotificationError("Operator not found", 404);
  }

  const eventRaw = body.event_type ?? body.eventType;
  if (!isNotificationEventType(eventRaw)) {
    throw new NotificationError("Invalid or missing event_type", 400, [
      {
        field: "event_type",
        message: `must be one of: ${NOTIFICATION_EVENT_TYPES.join(", ")}`,
      },
    ]);
  }
  const eventType = eventRaw;

  const emailIn =
    body.email !== undefined
      ? body.email
      : undefined;
  const smsIn = body.sms !== undefined ? body.sms : undefined;
  const inAppIn =
    body.in_app !== undefined
      ? body.in_app
      : body.inApp !== undefined
        ? body.inApp
        : undefined;

  const fieldErrors = validateNotificationPreferenceFields({
    eventType,
    email: emailIn,
    sms: smsIn,
    inApp: inAppIn,
  });
  if (fieldErrors.length) {
    throw new NotificationError("Invalid notification preference", 400, fieldErrors);
  }

  ensureDefaultPreferencesForMember(store, userId, operatorId, {
    now: options?.now,
  });
  const maps = ensureMaps(store);
  const existing = findPref(maps, userId, operatorId, eventType);
  if (!existing) {
    throw new NotificationError("Preference row missing", 500);
  }

  const nextEmail =
    typeof emailIn === "boolean" ? emailIn : existing.email;
  const nextSms = typeof smsIn === "boolean" ? smsIn : existing.sms;
  const nextInApp =
    typeof inAppIn === "boolean" ? inAppIn : existing.inApp;

  if (
    isMandatoryNotificationEvent(eventType) &&
    !nextEmail &&
    !nextSms &&
    !nextInApp
  ) {
    throw new NotificationError(
      `At least one channel must stay on for ${eventType}`,
      400,
      [
        {
          field: "channels",
          message:
            "Mandatory notification events require at least one of email, sms, or in_app",
        },
      ]
    );
  }

  const now = options?.now ?? new Date().toISOString();
  const updated: NotificationPreference = {
    ...existing,
    email: nextEmail,
    sms: nextSms,
    inApp: nextInApp,
    updatedAt: now,
  };
  maps.preferences.set(updated.id, updated);
  return updated;
}

/**
 * Bulk patch: body.preferences = [{ event_type, email?, sms?, in_app? }, ...]
 */
export function patchMyNotificationPreferencesBulk(
  store: NotificationDealStore,
  operatorId: string,
  userId: string,
  items: PatchNotificationPreferenceInput[],
  options?: { now?: string }
): NotificationPreference[] {
  if (!Array.isArray(items) || items.length === 0) {
    throw new NotificationError(
      "Body must include a non-empty preferences array",
      400
    );
  }
  const updated: NotificationPreference[] = [];
  for (const item of items) {
    updated.push(
      patchMyNotificationPreference(store, operatorId, userId, item, options)
    );
  }
  return getMyNotificationPreferences(store, operatorId, userId, options);
}

// ---------------------------------------------------------------------------
// Channel providers (stubs)
// ---------------------------------------------------------------------------

const defaultProviders: NotificationChannelProviders = {
  async sendEmail(msg) {
    if (process.env.NODE_ENV === "test") return;
    // eslint-disable-next-line no-console
    console.info("[notify:email]", msg.to, msg.subject);
  },
  async sendSms(msg) {
    if (process.env.NODE_ENV === "test") return;
    // eslint-disable-next-line no-console
    console.info("[notify:sms]", msg.to, msg.body.slice(0, 120));
  },
};

let channelProviders: NotificationChannelProviders = { ...defaultProviders };

export function setNotificationChannelProviders(
  providers: Partial<NotificationChannelProviders> | null
): void {
  if (!providers) {
    channelProviders = { ...defaultProviders };
    return;
  }
  channelProviders = { ...channelProviders, ...providers };
}

export function getNotificationChannelProviders(): NotificationChannelProviders {
  return channelProviders;
}

/** Resolve contact endpoints for a team member (email required; SMS optional). */
export type MemberContactResolver = (member: TeamMember) => {
  email: string | null;
  phone: string | null;
};

const defaultContactResolver: MemberContactResolver = (member) => ({
  email: member.invitedEmail?.trim() || null,
  phone: null,
});

let contactResolver: MemberContactResolver = defaultContactResolver;

export function setMemberContactResolver(
  resolver: MemberContactResolver | null
): void {
  contactResolver = resolver ?? defaultContactResolver;
}

// ---------------------------------------------------------------------------
// Title / body defaults from payload
// ---------------------------------------------------------------------------

function defaultTitle(
  eventType: NotificationEventType,
  payload: NotifyPayload
): string {
  if (typeof payload.title === "string" && payload.title.trim()) {
    return payload.title.trim();
  }
  return NOTIFICATION_EVENT_LABELS[eventType];
}

function defaultBody(
  eventType: NotificationEventType,
  payload: NotifyPayload
): string {
  if (typeof payload.body === "string" && payload.body.trim()) {
    return payload.body.trim();
  }
  if (typeof payload.detail === "string" && payload.detail.trim()) {
    return payload.detail.trim();
  }
  if (typeof payload.message === "string" && payload.message.trim()) {
    return payload.message.trim();
  }
  switch (eventType) {
    case "integration_sync_failing":
      return "A booking integration has not synced successfully. Some deals may be hidden.";
    case "deal_auto_paused":
      return "A deal was automatically paused.";
    case "attestation_due":
      return "Manual deals need seat reconfirmation soon.";
    case "booking_link_broken":
      return "A deal booking link failed reachability checks.";
    case "deal_review_update":
      return "A deal review status changed.";
    case "deal_lifecycle":
      return "A deal status changed.";
    case "auto_rule_created_deals":
      return "An auto-deal rule created new deals.";
    case "daily_performance_summary":
      return "Your daily deal performance summary is ready.";
    case "compliance_expiring":
      return "A compliance document is expiring soon.";
    default:
      return NOTIFICATION_EVENT_LABELS[eventType];
  }
}

// ---------------------------------------------------------------------------
// notify()
// ---------------------------------------------------------------------------

/**
 * Fan out a notification to accepted operator members per their preferences.
 * Dedupes when incidentKey was already recorded for this operator+event.
 */
export async function notify(
  store: NotificationDealStore,
  operatorId: string,
  eventType: NotificationEventType,
  payload: NotifyPayload = {},
  options?: NotifyOptions
): Promise<NotifyResult> {
  // Soft-skip for jobs when the operator row is absent (common in unit fixtures).
  if (!store.operators.operators.has(operatorId)) {
    return {
      skipped: true,
      reason: "operator_missing",
      deliveries: [],
      inAppCreated: [],
    };
  }
  if (!isNotificationEventType(eventType)) {
    throw new NotificationError(`Unknown event type: ${String(eventType)}`, 400);
  }

  const maps = ensureMaps(store);
  const now = options?.now ?? new Date().toISOString();
  const incidentKey = options?.incidentKey ?? null;

  if (incidentKey) {
    const existing = maps.incidents.get(incidentKey);
    if (existing) {
      return {
        skipped: true,
        reason: "incident_deduped",
        deliveries: [],
        inAppCreated: [],
      };
    }
  }

  const title = options?.title ?? defaultTitle(eventType, payload);
  const body = options?.body ?? defaultBody(eventType, payload);
  const safePayload: Record<string, unknown> = { ...payload };

  const members = acceptedMembersWithUser(store, operatorId);
  const deliveries: NotificationDelivery[] = [];
  const inAppCreated: InAppNotification[] = [];

  for (const member of members) {
    const userId = member.userId!;
    ensureDefaultPreferencesForMember(store, userId, operatorId, { now });
    const pref = findPref(maps, userId, operatorId, eventType);
    if (!pref) continue;

    const contact = contactResolver(member);

    if (pref.email && contact.email) {
      await channelProviders.sendEmail({
        to: contact.email,
        subject: title,
        body,
        payload: safePayload,
      });
      const d: NotificationDelivery = {
        id: crypto.randomUUID(),
        operatorId,
        userId,
        eventType,
        channel: "email",
        incidentKey,
        title,
        body,
        payload: safePayload,
        at: now,
      };
      maps.deliveries.set(d.id, d);
      deliveries.push(d);
    }

    if (pref.sms && contact.phone) {
      await channelProviders.sendSms({
        to: contact.phone,
        body: `${title}: ${body}`.slice(0, 320),
        payload: safePayload,
      });
      const d: NotificationDelivery = {
        id: crypto.randomUUID(),
        operatorId,
        userId,
        eventType,
        channel: "sms",
        incidentKey,
        title,
        body,
        payload: safePayload,
        at: now,
      };
      maps.deliveries.set(d.id, d);
      deliveries.push(d);
    } else if (pref.sms && !contact.phone) {
      // SMS preferred but no phone on file — still record intent for tests
      // when email/sms stubs are used without phone: skip delivery row.
    }

    if (pref.inApp) {
      const row: InAppNotification = {
        id: crypto.randomUUID(),
        userId,
        operatorId,
        eventType,
        title,
        body,
        payload: safePayload,
        readAt: null,
        createdAt: now,
      };
      maps.inApp.set(row.id, row);
      inAppCreated.push(row);

      const d: NotificationDelivery = {
        id: crypto.randomUUID(),
        operatorId,
        userId,
        eventType,
        channel: "in_app",
        incidentKey,
        title,
        body,
        payload: safePayload,
        at: now,
      };
      maps.deliveries.set(d.id, d);
      deliveries.push(d);
    }
  }

  if (incidentKey && (deliveries.length > 0 || members.length > 0)) {
    // Record incident even if no channel fired (e.g. all prefs off for
    // non-mandatory) so we don't retry-spam the same incident.
    maps.incidents.set(incidentKey, {
      incidentKey,
      operatorId,
      eventType,
      notifiedAt: now,
    });
  }

  if (deliveries.length === 0) {
    return {
      skipped: true,
      reason: "no_recipients",
      deliveries,
      inAppCreated,
    };
  }

  return { skipped: false, deliveries, inAppCreated };
}

/** Test helper: clear incident so notify can fire again. */
export function clearNotificationIncident(
  store: NotificationDealStore,
  incidentKey: string
): void {
  ensureMaps(store).incidents.delete(incidentKey);
}

export function listNotificationDeliveries(
  store: NotificationDealStore,
  filter?: {
    operatorId?: string;
    eventType?: NotificationEventType;
    userId?: string;
    channel?: "email" | "sms" | "in_app";
  }
): NotificationDelivery[] {
  const maps = ensureMaps(store);
  return [...maps.deliveries.values()]
    .filter((d) => {
      if (filter?.operatorId && d.operatorId !== filter.operatorId) return false;
      if (filter?.eventType && d.eventType !== filter.eventType) return false;
      if (filter?.userId && d.userId !== filter.userId) return false;
      if (filter?.channel && d.channel !== filter.channel) return false;
      return true;
    })
    .sort((a, b) => a.at.localeCompare(b.at));
}

// ---------------------------------------------------------------------------
// In-app list / mark-read
// ---------------------------------------------------------------------------

export function listMyInAppNotifications(
  store: NotificationDealStore,
  operatorId: string,
  userId: string,
  options?: { unreadOnly?: boolean; limit?: number }
): InAppNotification[] {
  const maps = ensureMaps(store);
  const limit = options?.limit ?? 50;
  return [...maps.inApp.values()]
    .filter((n) => {
      if (n.operatorId !== operatorId || n.userId !== userId) return false;
      if (options?.unreadOnly && n.readAt != null) return false;
      return true;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export function markInAppNotificationRead(
  store: NotificationDealStore,
  operatorId: string,
  userId: string,
  notificationId: string,
  options?: { now?: string }
): InAppNotification {
  const maps = ensureMaps(store);
  const row = maps.inApp.get(notificationId);
  if (!row || row.operatorId !== operatorId || row.userId !== userId) {
    throw new NotificationError("Notification not found", 404);
  }
  if (row.readAt) return row;
  const now = options?.now ?? new Date().toISOString();
  const updated: InAppNotification = { ...row, readAt: now };
  maps.inApp.set(notificationId, updated);
  return updated;
}

export function markAllInAppNotificationsRead(
  store: NotificationDealStore,
  operatorId: string,
  userId: string,
  options?: { now?: string }
): number {
  const maps = ensureMaps(store);
  const now = options?.now ?? new Date().toISOString();
  let count = 0;
  for (const [id, row] of maps.inApp) {
    if (row.operatorId !== operatorId || row.userId !== userId) continue;
    if (row.readAt != null) continue;
    maps.inApp.set(id, { ...row, readAt: now });
    count += 1;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Wire helpers for earlier chunk stubs
// ---------------------------------------------------------------------------

export async function notifyIntegrationSyncFailing(
  store: NotificationDealStore,
  payload: {
    operatorId: string;
    integrationId: string;
    provider: string;
    detail: string;
    pausedDealIds: string[];
    at: string;
  }
): Promise<NotifyResult> {
  return notify(
    store,
    payload.operatorId,
    "integration_sync_failing",
    {
      integration_id: payload.integrationId,
      provider: payload.provider,
      detail: payload.detail,
      paused_deal_ids: payload.pausedDealIds,
      body: payload.detail,
    },
    {
      now: payload.at,
      incidentKey: `integration_sync_failing:${payload.integrationId}:${payload.detail}`,
      title: `${payload.provider} sync failing`,
      body: payload.detail,
    }
  );
}

export async function notifyDealAutoPaused(
  store: NotificationDealStore,
  payload: {
    operatorId: string;
    dealId: string;
    reason: string;
    detail: string;
    at: string;
  }
): Promise<NotifyResult> {
  return notify(
    store,
    payload.operatorId,
    "deal_auto_paused",
    {
      deal_id: payload.dealId,
      reason: payload.reason,
      detail: payload.detail,
    },
    {
      now: payload.at,
      incidentKey: `deal_auto_paused:${payload.dealId}:${payload.reason}:${payload.at}`,
      title: "Deal auto-paused",
      body: payload.detail || `Paused: ${payload.reason}`,
    }
  );
}

export async function notifyAttestationDue(
  store: NotificationDealStore,
  payload: {
    operatorId: string;
    dealIds: string[];
    quickUpdatePath: string;
    quickUpdateToken: string;
    expiresAt: string;
    at: string;
  }
): Promise<NotifyResult> {
  const n = payload.dealIds.length;
  return notify(
    store,
    payload.operatorId,
    "attestation_due",
    {
      deal_ids: payload.dealIds,
      quick_update_path: payload.quickUpdatePath,
      expires_at: payload.expiresAt,
    },
    {
      now: payload.at,
      // One reminder per attestation window is tracked in attestation_reminders;
      // still dedupe by path+expiry for notify-level safety.
      incidentKey: `attestation_due:${payload.operatorId}:${payload.expiresAt}:${payload.dealIds.slice().sort().join(",")}`,
      title: n === 1 ? "Reconfirm deal seats" : `Reconfirm ${n} deals`,
      body: `Seats need reconfirming before they expire. Open ${payload.quickUpdatePath}`,
    }
  );
}

export async function notifyBookingLinkBroken(
  store: NotificationDealStore,
  payload: {
    operatorId: string;
    dealId: string;
    detail: string;
    at: string;
  }
): Promise<NotifyResult> {
  return notify(
    store,
    payload.operatorId,
    "booking_link_broken",
    {
      deal_id: payload.dealId,
      detail: payload.detail,
    },
    {
      now: payload.at,
      incidentKey: `booking_link_broken:${payload.dealId}`,
      title: "Booking link broken",
      body: payload.detail,
    }
  );
}

export async function notifyDealReviewUpdate(
  store: NotificationDealStore,
  payload: {
    operatorId: string;
    dealId: string;
    dealTitle: string | null;
    action: "submitted" | "approved" | "rejected";
    submittedBy?: string | null;
    notes?: string | null;
    at: string;
  }
): Promise<NotifyResult> {
  const title =
    payload.action === "submitted"
      ? "Deal submitted for review"
      : payload.action === "approved"
        ? "Deal approved"
        : "Deal rejected";
  const name = payload.dealTitle?.trim() || "Untitled deal";
  const body =
    payload.action === "rejected" && payload.notes
      ? `${name}: ${payload.notes}`
      : `${name} was ${payload.action === "submitted" ? "submitted for review" : payload.action}.`;

  return notify(
    store,
    payload.operatorId,
    "deal_review_update",
    {
      deal_id: payload.dealId,
      deal_title: payload.dealTitle,
      action: payload.action,
      submitted_by: payload.submittedBy ?? null,
      notes: payload.notes ?? null,
    },
    {
      now: payload.at,
      incidentKey: `deal_review_update:${payload.dealId}:${payload.action}:${payload.at}`,
      title,
      body,
    }
  );
}

export async function notifyDealLifecycle(
  store: NotificationDealStore,
  payload: {
    operatorId: string;
    dealId: string;
    dealTitle: string | null;
    status: "live" | "sold_out" | "expired";
    at: string;
  }
): Promise<NotifyResult> {
  const name = payload.dealTitle?.trim() || "Untitled deal";
  const label =
    payload.status === "live"
      ? "is now live"
      : payload.status === "sold_out"
        ? "sold out"
        : "expired";
  return notify(
    store,
    payload.operatorId,
    "deal_lifecycle",
    {
      deal_id: payload.dealId,
      deal_title: payload.dealTitle,
      status: payload.status,
    },
    {
      now: payload.at,
      incidentKey: `deal_lifecycle:${payload.dealId}:${payload.status}:${payload.at}`,
      title: `Deal ${payload.status.replace("_", " ")}`,
      body: `${name} ${label}.`,
    }
  );
}

// ---------------------------------------------------------------------------
// Daily performance summary job
// ---------------------------------------------------------------------------

/** Local hour (0–23) considered "morning" for daily summary. */
export const DAILY_SUMMARY_LOCAL_HOUR = 8;

export type DailyPerformanceSummaryJobResult = {
  sentOperatorIds: string[];
  skippedOperatorIds: string[];
};

function yesterdayLocalDateKey(nowIso: string, timeZone: string): string {
  const parts = getZonedParts(nowIso, timeZone);
  // Build noon today local → subtract 24h → local date of yesterday
  const todayNoonUtc = zonedLocalToUtcIso(
    `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`,
    "12:00:00",
    timeZone
  );
  const yMs = Date.parse(todayNoonUtc) - 24 * 60 * 60 * 1000;
  return localDateKey(new Date(yMs).toISOString(), timeZone);
}

/**
 * Once per operator local morning: email daily_performance_summary.
 * Metrics body is a lightweight placeholder until Chunk 45 rollups.
 */
export async function runDailyPerformanceSummaryJob(
  store: NotificationDealStore,
  options?: { now?: string; localHour?: number }
): Promise<DailyPerformanceSummaryJobResult> {
  const maps = ensureMaps(store);
  const now = options?.now ?? new Date().toISOString();
  const localHour = options?.localHour ?? DAILY_SUMMARY_LOCAL_HOUR;
  const sentOperatorIds: string[] = [];
  const skippedOperatorIds: string[] = [];

  for (const operator of store.operators.operators.values()) {
    const tz = operator.timezone || "Pacific/Auckland";
    const parts = getZonedParts(now, tz);
    if (parts.hour !== localHour) {
      skippedOperatorIds.push(operator.id);
      continue;
    }

    const todayLocal = localDateKey(now, tz);
    const already = maps.dailySummarySent.get(operator.id);
    if (already?.localDate === todayLocal) {
      skippedOperatorIds.push(operator.id);
      continue;
    }

    const summaryDate = yesterdayLocalDateKey(now, tz);
    const dealCount = [...store.deals.values()].filter(
      (d) => d.operatorId === operator.id
    ).length;

    const result = await notify(
      store,
      operator.id,
      "daily_performance_summary",
      {
        summary_date: summaryDate,
        deal_count: dealCount,
      },
      {
        now,
        incidentKey: `daily_performance_summary:${operator.id}:${todayLocal}`,
        title: `Daily performance — ${summaryDate}`,
        body: `Yesterday (${summaryDate}): ${dealCount} deal(s) on file. Detailed stats arrive in a later release.`,
      }
    );

    if (!result.skipped || result.reason === "no_recipients") {
      maps.dailySummarySent.set(operator.id, {
        operatorId: operator.id,
        localDate: todayLocal,
        sentAt: now,
      });
    }

    if (!result.skipped) {
      sentOperatorIds.push(operator.id);
    } else {
      skippedOperatorIds.push(operator.id);
    }
  }

  return { sentOperatorIds, skippedOperatorIds };
}

// Re-export defaults builder for join flows (Chunk 40)
export { buildDefaultNotificationPreferences, prefKey };
