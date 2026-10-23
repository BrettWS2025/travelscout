/**
 * Deal event logger and status transition function (deals platform Chunk 11).
 *
 * Status, pause_reason, pause_detail, slug, and link_status are system-owned:
 * clients never set them. Status/pause changes go through transitionDeal /
 * applyAutoPause / clearAutoPause (which write a DealEvent). Slug is generated
 * from title; link_* are set only by Test link / link checker / publish probe.
 *
 * Database (security S2): `marketplace.operator_deals` BEFORE UPDATE trigger
 * rejects client changes to status / pause_reason / pause_detail /
 * discount_verification unless the session is service_role (or postgres /
 * supabase_admin). Persist status transitions with a service-role client or
 * SECURITY DEFINER writer. See migration
 * `20261024000001_lock_system_owned_deal_columns.sql`.
 *
 * Spec: docs/deals-spec.md §4.2–4.3.
 */

import type { Deal, DealFieldInput } from "./deal";
import {
  appendDealEvent,
  createDealAuditStore,
  type DealAuditStore,
  type DealEvent,
  type DealEventDetail,
  type DealEventType,
} from "./deal-audit";
import type { ActorType, DealStatus, PauseReason } from "./enums";
import { isAutoResumeReason, isDealStatus, isPauseReason } from "./enums";

// ---------------------------------------------------------------------------
// Allowed transitions (Chunk 11)
// ---------------------------------------------------------------------------

/** Explicit edges. "any except archived → ended" and expired edges are added below. */
const BASE_ALLOWED: ReadonlyArray<readonly [DealStatus, DealStatus]> = [
  ["draft", "pending_review"],
  ["draft", "scheduled"],
  ["draft", "live"],
  ["pending_review", "scheduled"],
  ["pending_review", "live"],
  ["pending_review", "draft"],
  ["scheduled", "live"],
  ["scheduled", "paused"],
  ["scheduled", "auto_paused"], // integration disconnect / sync failure (Chunks 27–29)
  ["live", "paused"],
  ["paused", "live"],
  ["paused", "scheduled"], // operator resume when no session within MAX_LEAD_HOURS (Chunk 19)
  ["live", "auto_paused"],
  ["auto_paused", "live"],
  ["auto_paused", "scheduled"], // operator resume when no session within MAX_LEAD_HOURS (Chunk 19)
  ["live", "sold_out"],
  ["sold_out", "live"],
  ["live", "expired"],
  ["sold_out", "expired"],
  ["auto_paused", "expired"],
  ["paused", "expired"],
  ["scheduled", "expired"],
  ["expired", "archived"],
  ["ended", "archived"],
];

const ALL_EXCEPT_ARCHIVED: readonly DealStatus[] = [
  "draft",
  "pending_review",
  "scheduled",
  "live",
  "paused",
  "auto_paused",
  "sold_out",
  "expired",
  "ended",
];

function buildAllowedSet(): Set<string> {
  const set = new Set<string>();
  for (const [from, to] of BASE_ALLOWED) {
    set.add(`${from}->${to}`);
  }
  for (const from of ALL_EXCEPT_ARCHIVED) {
    // already-ended → ended is a no-op edge; omit self-transition
    if (from === "ended") continue;
    set.add(`${from}->ended`);
  }
  return set;
}

export const ALLOWED_DEAL_TRANSITIONS = buildAllowedSet();

export function isAllowedDealTransition(
  from: DealStatus,
  to: DealStatus
): boolean {
  return ALLOWED_DEAL_TRANSITIONS.has(`${from}->${to}`);
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class InvalidDealTransitionError extends Error {
  readonly fromStatus: DealStatus;
  readonly toStatus: DealStatus;

  constructor(fromStatus: DealStatus, toStatus: DealStatus) {
    super(`Invalid deal status transition: ${fromStatus} → ${toStatus}`);
    this.name = "InvalidDealTransitionError";
    this.fromStatus = fromStatus;
    this.toStatus = toStatus;
  }
}

export class DealNotFoundError extends Error {
  readonly dealId: string;

  constructor(dealId: string) {
    super(`Deal not found: ${dealId}`);
    this.name = "DealNotFoundError";
    this.dealId = dealId;
  }
}

export class DealStatusError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DealStatusError";
  }
}

export class AutoPauseClearError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AutoPauseClearError";
  }
}

export class PublishValidationFailedError extends Error {
  readonly result: PublishValidationResult;

  constructor(result: PublishValidationResult) {
    super("Publish validation failed; cannot resume to live");
    this.name = "PublishValidationFailedError";
    this.result = result;
  }
}

// ---------------------------------------------------------------------------
// Publish validation hook (Chunk 16 fills this in)
// ---------------------------------------------------------------------------

export type PublishValidationCheck = {
  key: string;
  label: string;
  passed: boolean;
  message?: string;
  editorStep?: string;
};

export type PublishValidationResult = {
  ok: boolean;
  checks: PublishValidationCheck[];
};

/**
 * No-op validator (always ok). Prefer `validateForPublish` /
 * `createValidateForPublishFromStore` from deal-publish-validation.ts.
 * Kept for unit tests that inject their own ValidateForPublishFn.
 */
export function stubValidateForPublish(
  _deal: Deal
): PublishValidationResult {
  return { ok: true, checks: [] };
}

export type ValidateForPublishFn = (
  deal: Deal
) => PublishValidationResult | Promise<PublishValidationResult>;

// ---------------------------------------------------------------------------
// Actors & options
// ---------------------------------------------------------------------------

export type DealActor = {
  type: ActorType;
  id?: string | null;
};

export type TransitionDealOptions = {
  actor: DealActor;
  /** Required when entering auto_paused; ignored for paused (always operator). */
  reason?: PauseReason | null;
  detail?: string | null;
  /** Extra fields merged into the DealEvent detail (from/to/reason always set). */
  eventDetail?: DealEventDetail;
  now?: string;
  eventId?: string;
};

// ---------------------------------------------------------------------------
// In-memory store (unit tests; API chunks will persist via Supabase)
// ---------------------------------------------------------------------------

export type DealStatusStore = {
  deals: Map<string, Deal>;
  audit: DealAuditStore;
};

export function createDealStatusStore(
  deals?: Iterable<Deal>
): DealStatusStore {
  const map = new Map<string, Deal>();
  if (deals) {
    for (const d of deals) map.set(d.id, d);
  }
  return { deals: map, audit: createDealAuditStore() };
}

export function seedDeal(store: DealStatusStore, deal: Deal): Deal {
  store.deals.set(deal.id, deal);
  return deal;
}

/** Minimal draft deal for tests / seeds. */
export function makeDealFixture(
  overrides: Partial<Deal> & Pick<Deal, "id" | "operatorId">
): Deal {
  const now = overrides.createdAt ?? new Date().toISOString();
  return {
    dealType: "manual_session",
    sourceProvider: "manual",
    integrationId: null,
    externalProductId: null,
    dealRuleId: null,
    status: "draft",
    pauseReason: null,
    pauseDetail: null,
    title: null,
    slug: `deal-${overrides.id.slice(0, 8)}`,
    summary: null,
    description: null,
    category: null,
    tags: [],
    highlights: [],
    inclusions: [],
    exclusions: [],
    whatToBring: [],
    durationMinutes: null,
    durationLabel: null,
    locationName: null,
    address: null,
    latitude: null,
    longitude: null,
    region: null,
    meetingPointNotes: null,
    pickupAvailable: false,
    pickupNotes: null,
    minAge: null,
    ageNotes: null,
    fitnessLevel: null,
    wheelchairAccessible: null,
    accessibilityNotes: null,
    languages: [],
    weatherDependent: null,
    weatherNotes: null,
    cancellationPolicyType: null,
    cancellationPolicyText: null,
    importantInfo: null,
    overriddenFields: [],
    currency: "NZD",
    discountMechanism: null,
    promoCode: null,
    promoCodeConfirmedByOperator: false,
    discountVerification: null,
    discountInputMode: "deal_price",
    steppedDiscountEnabled: false,
    capacityMode: "manual_count",
    seatCap: null,
    minBookingQty: null,
    maxBookingQty: null,
    bookingDestinationType: null,
    bookingUrl: null,
    bookingPhone: null,
    bookingEmail: null,
    bookingInstructions: null,
    appendTrackingParams: true,
    linkStatus: "unchecked",
    linkLastCheckedAt: null,
    linkConsecutiveFailures: 0,
    publishAt: null,
    salesCutoffMinutes: null,
    lastAttestedAt: null,
    attestationExpiresAt: null,
    publishedAt: null,
    endedAt: null,
    firstPublishedAt: null,
    createdBy: null,
    updatedBy: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Event type mapping
// ---------------------------------------------------------------------------

export function eventTypeForTransition(
  from: DealStatus,
  to: DealStatus
): DealEventType {
  if (to === "pending_review") return "submitted_for_review";
  if (to === "draft" && from === "pending_review") return "rejected";
  if (to === "paused") return "paused";
  if (to === "auto_paused") return "auto_paused";
  if (to === "sold_out") return "sold_out";
  if (to === "expired") return "expired";
  if (to === "ended") return "ended";
  if (to === "archived") return "archived";
  // Operator resume (Chunk 19): paused / auto_paused → live or scheduled.
  if (
    (to === "live" || to === "scheduled") &&
    (from === "paused" || from === "sold_out")
  ) {
    return "resumed";
  }
  if (to === "live" && from === "auto_paused") return "auto_resumed";
  if (to === "scheduled" && from === "auto_paused") return "resumed";
  if (to === "scheduled") return "scheduled";
  if (to === "live") return "published";
  // Fallback — should not be reached for allowed edges
  return "updated";
}

// ---------------------------------------------------------------------------
// logDealEvent
// ---------------------------------------------------------------------------

/**
 * Append a DealEvent. Thin wrapper over appendDealEvent with actor shape.
 */
export function logDealEvent(
  store: DealAuditStore,
  dealId: string,
  eventType: DealEventType,
  actor: DealActor,
  detail?: DealEventDetail,
  options?: { id?: string; now?: string }
): DealEvent {
  return appendDealEvent(
    store,
    {
      dealId,
      eventType,
      actorType: actor.type,
      actorId: actor.id ?? null,
      detail: detail ?? {},
    },
    options
  );
}

// ---------------------------------------------------------------------------
// transitionDeal
// ---------------------------------------------------------------------------

/**
 * The only way Deal.status / pause_* change.
 * Updates the deal and writes a DealEvent in one logical transaction.
 */
export function transitionDeal(
  store: DealStatusStore,
  dealId: string,
  toStatus: DealStatus,
  options: TransitionDealOptions
): Deal {
  if (!isDealStatus(toStatus)) {
    throw new InvalidDealTransitionError("draft", toStatus as DealStatus);
  }

  const existing = store.deals.get(dealId);
  if (!existing) throw new DealNotFoundError(dealId);

  const fromStatus = existing.status;
  if (!isAllowedDealTransition(fromStatus, toStatus)) {
    throw new InvalidDealTransitionError(fromStatus, toStatus);
  }

  const now = options.now ?? new Date().toISOString();
  let pauseReason: PauseReason | null = existing.pauseReason;
  let pauseDetail: string | null = existing.pauseDetail;

  if (toStatus === "paused") {
    // Operator pause (default) or admin pause (Chunk 17; no auto-resume).
    if (
      options.reason != null &&
      options.reason !== "operator" &&
      options.reason !== "admin"
    ) {
      throw new DealStatusError(
        "paused only accepts pause reason operator or admin"
      );
    }
    pauseReason = options.reason === "admin" ? "admin" : "operator";
    pauseDetail = options.detail ?? null;
  } else if (toStatus === "auto_paused") {
    if (!options.reason || !isPauseReason(options.reason)) {
      throw new DealStatusError("auto_paused requires a valid pause reason");
    }
    pauseReason = options.reason;
    pauseDetail = options.detail ?? null;
  } else if (toStatus === "draft" && fromStatus === "pending_review") {
    // Admin reject (Chunk 17): hold reviewer notes in pause_detail.
    pauseReason = null;
    pauseDetail = options.detail ?? null;
  } else if (
    fromStatus === "paused" ||
    fromStatus === "auto_paused"
  ) {
    // Leaving paused / auto_paused clears pause fields
    pauseReason = null;
    pauseDetail = null;
  } else if (
    fromStatus === "draft" &&
    (toStatus === "pending_review" ||
      toStatus === "scheduled" ||
      toStatus === "live")
  ) {
    // Clear leftover reject notes when publishing again from draft.
    pauseReason = null;
    pauseDetail = null;
  }

  let publishedAt = existing.publishedAt;
  let firstPublishedAt = existing.firstPublishedAt;
  if (
    (toStatus === "live" || toStatus === "scheduled") &&
    firstPublishedAt == null
  ) {
    firstPublishedAt = now;
    publishedAt = publishedAt ?? now;
  }

  let endedAt = existing.endedAt;
  if (toStatus === "ended") {
    endedAt = now;
  }

  const updated: Deal = {
    ...existing,
    status: toStatus,
    pauseReason,
    pauseDetail,
    publishedAt,
    firstPublishedAt,
    endedAt,
    updatedAt: now,
  };

  // Write deal + event together (in-memory "transaction")
  store.deals.set(dealId, updated);

  const eventDetail: DealEventDetail = {
    ...(options.eventDetail ?? {}),
    from_status: fromStatus,
    to_status: toStatus,
    ...(pauseReason || options.reason
      ? { reason: pauseReason ?? options.reason ?? undefined }
      : {}),
    ...(options.detail != null && options.detail !== ""
      ? { pause_detail: options.detail }
      : {}),
  };

  logDealEvent(
    store.audit,
    dealId,
    eventTypeForTransition(fromStatus, toStatus),
    options.actor,
    eventDetail,
    { id: options.eventId, now }
  );

  return updated;
}

// ---------------------------------------------------------------------------
// applyAutoPause / clearAutoPause
// ---------------------------------------------------------------------------

/**
 * Move a live or scheduled deal to auto_paused with the given reason.
 * Idempotent when already auto_paused for the same reason (updates detail only).
 */
export function applyAutoPause(
  store: DealStatusStore,
  dealId: string,
  reason: PauseReason,
  detail?: string | null,
  options?: { actor?: DealActor; now?: string }
): Deal {
  if (!isPauseReason(reason)) {
    throw new DealStatusError("invalid pause reason");
  }

  const existing = store.deals.get(dealId);
  if (!existing) throw new DealNotFoundError(dealId);

  const actor = options?.actor ?? { type: "system" as const };
  const now = options?.now ?? new Date().toISOString();

  if (
    existing.status === "auto_paused" &&
    existing.pauseReason === reason
  ) {
    if (detail !== undefined && detail !== existing.pauseDetail) {
      const updated: Deal = {
        ...existing,
        pauseDetail: detail ?? null,
        updatedAt: now,
      };
      store.deals.set(dealId, updated);
      logDealEvent(
        store.audit,
        dealId,
        "auto_paused",
        actor,
        {
          from_status: "auto_paused",
          to_status: "auto_paused",
          reason,
          pause_detail: detail ?? null,
          refreshed: true,
        },
        { now }
      );
      return updated;
    }
    return existing;
  }

  return transitionDeal(store, dealId, "auto_paused", {
    actor,
    reason,
    detail: detail ?? null,
    now,
  });
}

/**
 * Resume from auto_paused when the clearing reason matches and is in
 * AUTO_RESUME_REASONS. Re-runs publish validation before going live.
 */
export async function clearAutoPause(
  store: DealStatusStore,
  dealId: string,
  reason: PauseReason,
  options?: {
    actor?: DealActor;
    now?: string;
    validateForPublish?: ValidateForPublishFn;
  }
): Promise<Deal> {
  const existing = store.deals.get(dealId);
  if (!existing) throw new DealNotFoundError(dealId);

  if (existing.status !== "auto_paused") {
    throw new AutoPauseClearError(
      `deal is ${existing.status}, not auto_paused`
    );
  }
  if (existing.pauseReason !== reason) {
    throw new AutoPauseClearError(
      `deal is auto_paused for ${existing.pauseReason ?? "null"}, not ${reason}`
    );
  }
  if (!isAutoResumeReason(reason)) {
    throw new AutoPauseClearError(
      `pause reason ${reason} is not auto-resumable`
    );
  }

  const validate =
    options?.validateForPublish ?? stubValidateForPublish;
  const validation = await validate(existing);
  if (!validation.ok) {
    throw new PublishValidationFailedError(validation);
  }

  return transitionDeal(store, dealId, "live", {
    actor: options?.actor ?? { type: "system" },
    now: options?.now,
  });
}

// ---------------------------------------------------------------------------
// Client-facing updates: status / pause_* are read-only
// ---------------------------------------------------------------------------

/**
 * Fields clients must never set on create/update/PATCH (security S15).
 * status / pause_* — transition helpers only.
 * slug — generated from title (ensureUniqueDealSlug).
 * linkStatus — Test link / link checker / publish probe only.
 */
export const SYSTEM_OWNED_DEAL_FIELDS = [
  "status",
  "pauseReason",
  "pauseDetail",
  "slug",
  "linkStatus",
] as const;

export type SystemOwnedDealField = (typeof SYSTEM_OWNED_DEAL_FIELDS)[number];

/**
 * Snake_case columns locked by DB trigger on `marketplace.operator_deals`
 * (security S2). Must stay in sync with
 * `enforce_operator_deal_system_columns` in
 * `supabase/migrations/20261024000001_lock_system_owned_deal_columns.sql`.
 * Legacy `marketplace.deals` locks `status` only.
 * App-layer also strips `slug` / `link_status` (S15); those are not in this
 * DB trigger list.
 */
export const DB_LOCKED_OPERATOR_DEAL_COLUMNS = [
  "status",
  "pause_reason",
  "pause_detail",
  "discount_verification",
] as const;

export type DbLockedOperatorDealColumn =
  (typeof DB_LOCKED_OPERATOR_DEAL_COLUMNS)[number];

/**
 * Strip system-owned fields from a client payload.
 * Ignored (not rejected with 400) so accidental client sends cannot change them.
 */
export function stripSystemOwnedDealFields(
  input: DealFieldInput
): DealFieldInput {
  const {
    status: _status,
    pauseReason: _pauseReason,
    pauseDetail: _pauseDetail,
    slug: _slug,
    linkStatus: _linkStatus,
    ...rest
  } = input;
  return rest;
}

/**
 * Apply a client field patch onto a deal, ignoring system-owned fields.
 * Overlapping camelCase keys from DealFieldInput are merged; system-owned
 * columns are always preserved from the existing deal.
 */
export function applyClientDealFieldPatch(
  deal: Deal,
  input: DealFieldInput,
  options?: { now?: string }
): Deal {
  const safe = stripSystemOwnedDealFields(input);
  const now = options?.now ?? new Date().toISOString();
  const patch: Partial<Deal> = {};

  for (const [key, value] of Object.entries(safe) as Array<
    [keyof DealFieldInput, DealFieldInput[keyof DealFieldInput]]
  >) {
    if (value === undefined) continue;
    // DealFieldInput keys match Deal for client-writable fields
    (patch as Record<string, unknown>)[key] = value;
  }

  return {
    ...deal,
    ...patch,
    status: deal.status,
    pauseReason: deal.pauseReason,
    pauseDetail: deal.pauseDetail,
    slug: deal.slug,
    linkStatus: deal.linkStatus,
    updatedAt: now,
  };
}
