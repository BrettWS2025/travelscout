/**
 * Attestation expiry, reminders and quick-update token (deals platform Chunk 20).
 *
 * - Minute job: auto-pause live manual deals past attestation_expires_at;
 *   send one reminder (email+SMS stub) when within reminder hours.
 * - Signed single-use quick-update tokens (operator-scoped).
 * - GET/POST /quick-update/:token (no login) and dashboard POST .../attest.
 *
 * Spec: docs/deals-spec.md §4.3, §4.5, §5.6.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { getPlatformConfig } from "./config";
import {
  createDealAttestation,
  type DealAttestation,
} from "./deal-audit";
import type { DealDraftStore } from "./deal-draft";
import type { Deal } from "./deal";
import {
  createValidateForPublishFromStore,
  type PublishValidationOutcome,
} from "./deal-publish-validation";
import {
  computeSeatsDisplayed,
  type DealSession,
} from "./deal-session";
import {
  applyAutoPause,
  clearAutoPause,
  DealNotFoundError,
  DealStatusError,
  InvalidDealTransitionError,
  logDealEvent,
  transitionDeal,
  type DealActor,
  type DealStatusStore,
} from "./deal-status";
import { updateDealSeats } from "./deal-actions";
import {
  isManualDealType,
  type AttestationMethod,
} from "./enums";
import { getBookingDefaults } from "./operators";

// ---------------------------------------------------------------------------
// Constants / errors
// ---------------------------------------------------------------------------

const SYSTEM_ACTOR: DealActor = { type: "system" };
const MIN_TOKEN_TTL_HOURS = 2;
const TOKEN_BYTES = 32;

export class DealAttestationError extends Error {
  readonly status: number;
  readonly checks?: PublishValidationOutcome["checks"];
  readonly validation?: PublishValidationOutcome;

  constructor(
    message: string,
    status = 400,
    extras?: {
      checks?: PublishValidationOutcome["checks"];
      validation?: PublishValidationOutcome;
    }
  ) {
    super(message);
    this.name = "DealAttestationError";
    this.status = status;
    this.checks = extras?.checks;
    this.validation = extras?.validation;
  }
}

// ---------------------------------------------------------------------------
// Token + reminder records
// ---------------------------------------------------------------------------

export type QuickUpdateTokenChannel = "email" | "sms";

export type QuickUpdateTokenRecord = {
  id: string;
  operatorId: string;
  /** SHA-256 hex of the raw token string (never store the raw token). */
  tokenHash: string;
  /** Determines DealAttestation.method (email_link | sms_link). */
  channel: QuickUpdateTokenChannel;
  /** Deal ids included when the token was issued (informational). */
  dealIds: string[];
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
};

export type AttestationReminderRecord = {
  id: string;
  dealId: string;
  /** Dedupe key: the attestation_expires_at this reminder covers. */
  attestationExpiresAt: string;
  sentAt: string;
  tokenId: string;
  channels: ("email" | "sms")[];
};

export type QuickUpdateDealAction = "still_available" | "sold_out";

export type QuickUpdateDealSubmission = {
  dealId: string;
  action: QuickUpdateDealAction;
  seatsBySession?: Record<string, number>;
};

// ---------------------------------------------------------------------------
// Store helpers (maps live on DealDraftStore)
// ---------------------------------------------------------------------------

export type DealAttestationStoreMaps = {
  quickUpdateTokens: Map<string, QuickUpdateTokenRecord>;
  attestationReminders: Map<string, AttestationReminderRecord>;
};

/** Ensure draft store has attestation job maps (idempotent). */
export function ensureAttestationMaps(
  store: DealDraftStore
): DealAttestationStoreMaps {
  const s = store as DealDraftStore & Partial<DealAttestationStoreMaps>;
  if (!s.quickUpdateTokens) s.quickUpdateTokens = new Map();
  if (!s.attestationReminders) s.attestationReminders = new Map();
  return {
    quickUpdateTokens: s.quickUpdateTokens,
    attestationReminders: s.attestationReminders,
  };
}

function asStatusStore(store: DealDraftStore): DealStatusStore {
  return { deals: store.deals, audit: store.audit };
}

function sessionsForDeal(
  store: DealDraftStore,
  dealId: string
): DealSession[] {
  return [...store.sessions.values()]
    .filter((s) => s.dealId === dealId)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}

function seatsBySessionSnapshot(
  store: DealDraftStore,
  dealId: string
): Record<string, number> {
  const seats: Record<string, number> = {};
  for (const session of sessionsForDeal(store, dealId)) {
    seats[session.id] =
      session.manualSeatsAvailable ?? session.seatsDisplayed ?? 0;
  }
  return seats;
}

function attestationExpiryIso(nowIso: string): string {
  const { MANUAL_ATTESTATION_HOURS } = getPlatformConfig();
  const ms = Date.parse(nowIso) + MANUAL_ATTESTATION_HOURS * 60 * 60 * 1000;
  return new Date(ms).toISOString();
}

function attestationExpiredDetail(): string {
  const { MANUAL_ATTESTATION_HOURS } = getPlatformConfig();
  return `Seats not reconfirmed in ${MANUAL_ATTESTATION_HOURS} hours`;
}

function reminderHoursForOperator(
  store: DealDraftStore,
  operatorId: string
): number {
  const defaults = getBookingDefaults(store.operators, operatorId);
  if (
    defaults &&
    Number.isFinite(defaults.defaultAttestationReminderHours) &&
    defaults.defaultAttestationReminderHours >= 0
  ) {
    return defaults.defaultAttestationReminderHours;
  }
  return getPlatformConfig().ATTESTATION_REMINDER_HOURS;
}

function channelToMethod(channel: QuickUpdateTokenChannel): AttestationMethod {
  return channel === "sms" ? "sms_link" : "email_link";
}

function isQuickUpdateEligible(deal: Deal): boolean {
  if (!isManualDealType(deal.dealType)) return false;
  if (deal.status === "live") return true;
  return (
    deal.status === "auto_paused" && deal.pauseReason === "attestation_expired"
  );
}

function listQuickUpdateDeals(
  store: DealDraftStore,
  operatorId: string
): Deal[] {
  return [...store.deals.values()]
    .filter((d) => d.operatorId === operatorId && isQuickUpdateEligible(d))
    .sort((a, b) => a.id.localeCompare(b.id));
}

// ---------------------------------------------------------------------------
// Signing / hashing
// ---------------------------------------------------------------------------

/** Resolve HMAC secret for quick-update tokens (tests may inject via env). */
export function resolveQuickUpdateTokenSecret(
  env: NodeJS.ProcessEnv = process.env
): string {
  const raw =
    env.QUICK_UPDATE_TOKEN_SECRET?.trim() ||
    env.SECRETS_ENCRYPTION_KEY?.trim();
  if (raw) return raw;
  // Dev/test fallback — production must set QUICK_UPDATE_TOKEN_SECRET.
  return "dev-quick-update-token-secret";
}

export function hashQuickUpdateToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

function signTokenPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("base64url");
}

/**
 * Build a signed opaque token: `{id}.{nonce}.{sig}` (base64url parts).
 * Only the SHA-256 hash of the full string is stored.
 */
export function mintQuickUpdateRawToken(
  tokenId: string,
  options?: { secret?: string; nonce?: string }
): string {
  const secret = options?.secret ?? resolveQuickUpdateTokenSecret();
  const nonce = options?.nonce ?? randomBytes(TOKEN_BYTES).toString("base64url");
  const idPart = Buffer.from(tokenId, "utf8").toString("base64url");
  const payload = `${idPart}.${nonce}`;
  const sig = signTokenPayload(payload, secret);
  return `${payload}.${sig}`;
}

export function verifyQuickUpdateRawToken(
  rawToken: string,
  options?: { secret?: string }
): { tokenId: string } | null {
  const secret = options?.secret ?? resolveQuickUpdateTokenSecret();
  const parts = rawToken.split(".");
  if (parts.length !== 3) return null;
  const [idPart, nonce, sig] = parts;
  if (!idPart || !nonce || !sig) return null;
  const payload = `${idPart}.${nonce}`;
  const expected = signTokenPayload(payload, secret);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  let tokenId: string;
  try {
    tokenId = Buffer.from(idPart, "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!tokenId) return null;
  return { tokenId };
}

function computeTokenExpiresAt(
  deals: Deal[],
  nowIso: string
): string {
  const nowMs = Date.parse(nowIso);
  const minMs = nowMs + MIN_TOKEN_TTL_HOURS * 60 * 60 * 1000;
  let latestMs = minMs;
  for (const deal of deals) {
    if (deal.attestationExpiresAt == null) continue;
    const ms = Date.parse(deal.attestationExpiresAt);
    if (Number.isFinite(ms) && ms > latestMs) latestMs = ms;
  }
  return new Date(Math.max(latestMs, minMs)).toISOString();
}

// ---------------------------------------------------------------------------
// Issue / lookup tokens
// ---------------------------------------------------------------------------

export type IssueQuickUpdateTokenOptions = {
  channel?: QuickUpdateTokenChannel;
  now?: string;
  secret?: string;
  /** Override included deals (defaults to eligible manual deals for operator). */
  dealIds?: string[];
  id?: string;
};

export type IssuedQuickUpdateToken = {
  record: QuickUpdateTokenRecord;
  /** Raw token for the URL — show once, never store. */
  rawToken: string;
};

/**
 * Create a signed single-use quick-update token scoped to an operator.
 * Expires at the latest attestation_expires_at of included deals (min 2 h).
 */
export function issueQuickUpdateToken(
  store: DealDraftStore,
  operatorId: string,
  options?: IssueQuickUpdateTokenOptions
): IssuedQuickUpdateToken {
  const maps = ensureAttestationMaps(store);
  const now = options?.now ?? new Date().toISOString();
  const channel = options?.channel ?? "email";

  let deals: Deal[];
  if (options?.dealIds !== undefined) {
    // Explicit list (including empty → min 2h TTL, no deals).
    deals = [];
    for (const id of options.dealIds) {
      const d = store.deals.get(id);
      if (!d || d.operatorId !== operatorId) {
        throw new DealAttestationError(`Deal not found for operator: ${id}`, 404);
      }
      deals.push(d);
    }
  } else {
    deals = listQuickUpdateDeals(store, operatorId);
  }

  const id = options?.id ?? crypto.randomUUID();
  const rawToken = mintQuickUpdateRawToken(id, { secret: options?.secret });
  const record: QuickUpdateTokenRecord = {
    id,
    operatorId,
    tokenHash: hashQuickUpdateToken(rawToken),
    channel,
    dealIds: deals.map((d) => d.id),
    expiresAt: computeTokenExpiresAt(deals, now),
    usedAt: null,
    createdAt: now,
  };
  maps.quickUpdateTokens.set(id, record);
  return { record, rawToken };
}

export type ResolvedQuickUpdateToken = {
  record: QuickUpdateTokenRecord;
  rawToken: string;
};

/**
 * Resolve a raw token string → record. Throws on invalid / expired / used.
 */
export function resolveQuickUpdateToken(
  store: DealDraftStore,
  rawToken: string,
  options?: { now?: string; secret?: string; allowUsed?: boolean }
): ResolvedQuickUpdateToken {
  const maps = ensureAttestationMaps(store);
  const verified = verifyQuickUpdateRawToken(rawToken, {
    secret: options?.secret,
  });
  if (!verified) {
    throw new DealAttestationError("Invalid or malformed quick-update token", 401);
  }

  const record = maps.quickUpdateTokens.get(verified.tokenId);
  if (!record) {
    throw new DealAttestationError("Quick-update token not found", 404);
  }

  const expectedHash = hashQuickUpdateToken(rawToken);
  try {
    const a = Buffer.from(record.tokenHash, "hex");
    const b = Buffer.from(expectedHash, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new DealAttestationError("Invalid quick-update token", 401);
    }
  } catch (err) {
    if (err instanceof DealAttestationError) throw err;
    throw new DealAttestationError("Invalid quick-update token", 401);
  }

  const now = options?.now ?? new Date().toISOString();
  if (record.usedAt != null && !options?.allowUsed) {
    throw new DealAttestationError("Quick-update token has already been used", 410);
  }
  if (Date.parse(record.expiresAt) <= Date.parse(now)) {
    throw new DealAttestationError("Quick-update token has expired", 410);
  }

  return { record, rawToken };
}

function markTokenUsed(
  maps: DealAttestationStoreMaps,
  tokenId: string,
  now: string
): QuickUpdateTokenRecord {
  const existing = maps.quickUpdateTokens.get(tokenId);
  if (!existing) {
    throw new DealAttestationError("Quick-update token not found", 404);
  }
  const updated: QuickUpdateTokenRecord = {
    ...existing,
    usedAt: now,
  };
  maps.quickUpdateTokens.set(tokenId, updated);
  return updated;
}

// ---------------------------------------------------------------------------
// Notification stub (Chunk 39 replaces with notify())
// ---------------------------------------------------------------------------

export type AttestationReminderNotifyPayload = {
  operatorId: string;
  dealIds: string[];
  quickUpdatePath: string;
  quickUpdateToken: string;
  expiresAt: string;
  channels: ("email" | "sms")[];
  at: string;
};

export type SendAttestationReminderFn = (
  payload: AttestationReminderNotifyPayload
) => void | Promise<void>;

let sendReminderHook: SendAttestationReminderFn = () => {
  // no-op until notifications are wired (Chunk 39)
};

export function setSendAttestationReminder(
  fn: SendAttestationReminderFn | null
): void {
  sendReminderHook = fn ?? (() => undefined);
}

export async function sendAttestationReminder(
  payload: AttestationReminderNotifyPayload
): Promise<void> {
  await sendReminderHook(payload);
}

export function buildQuickUpdatePath(rawToken: string): string {
  return `/quick-update/${encodeURIComponent(rawToken)}`;
}

// ---------------------------------------------------------------------------
// Apply attestation (shared by dashboard + quick-update)
// ---------------------------------------------------------------------------

function applySeatsMap(
  store: DealDraftStore,
  deal: Deal,
  seatsMap: Record<string, number>,
  actor: DealActor,
  now: string
): void {
  if (Object.keys(seatsMap).length === 0) return;
  updateDealSeats(store, deal.id, {
    actor,
    seats: seatsMap,
    now,
  });
}

function zeroAllManualSeats(
  store: DealDraftStore,
  dealId: string,
  actor: DealActor,
  now: string
): void {
  const seats: Record<string, number> = {};
  for (const s of sessionsForDeal(store, dealId)) {
    seats[s.id] = 0;
  }
  if (Object.keys(seats).length === 0) {
    throw new DealAttestationError("Deal has no sessions", 400);
  }
  updateDealSeats(store, dealId, { actor, seats, now });
}

async function createAttestationAndMaybeResume(
  store: DealDraftStore,
  dealId: string,
  options: {
    method: AttestationMethod;
    seatsBySession: Record<string, number>;
    actor: DealActor;
    now: string;
    attestedBy?: string | null;
  }
): Promise<{ deal: Deal; attestation: DealAttestation }> {
  const existing = store.deals.get(dealId);
  if (!existing) throw new DealNotFoundError(dealId);

  const attestation = createDealAttestation(
    store.audit,
    {
      dealId,
      method: options.method,
      seatsBySession: options.seatsBySession,
      attestedBy: options.attestedBy ?? options.actor.id ?? null,
      attestedAt: options.now,
    },
    { now: options.now }
  );

  let deal: Deal = {
    ...existing,
    lastAttestedAt: options.now,
    attestationExpiresAt: attestationExpiryIso(options.now),
    updatedAt: options.now,
  };
  store.deals.set(dealId, deal);

  logDealEvent(
    store.audit,
    dealId,
    "attested",
    options.actor,
    {
      method: options.method,
      attestation_id: attestation.id,
      expires_at: deal.attestationExpiresAt,
    },
    { now: options.now }
  );

  if (
    deal.status === "auto_paused" &&
    deal.pauseReason === "attestation_expired"
  ) {
    try {
      deal = await clearAutoPause(
        asStatusStore(store),
        dealId,
        "attestation_expired",
        {
          actor: options.actor,
          now: options.now,
          validateForPublish: createValidateForPublishFromStore(store, {
            now: options.now,
            attested: true,
          }),
        }
      );
    } catch (err) {
      if (
        err instanceof InvalidDealTransitionError ||
        err instanceof DealStatusError
      ) {
        throw new DealAttestationError(err.message, 409);
      }
      throw err;
    }
  }

  return { deal, attestation };
}

// ---------------------------------------------------------------------------
// Dashboard reattest
// ---------------------------------------------------------------------------

export type AttestDealOptions = {
  actor: DealActor;
  seatsBySession?: Record<string, number>;
  now?: string;
};

export type AttestDealResult = {
  deal: Deal;
  attestation: DealAttestation;
  sessions: DealSession[];
};

/**
 * Dashboard reattest: POST /operator-deals/:id/attest { seats_by_session }.
 * Updates seats when provided, creates DealAttestation (dashboard), resets
 * expiry, and clearAutoPause(attestation_expired) when applicable.
 */
export async function attestDeal(
  store: DealDraftStore,
  dealId: string,
  options: AttestDealOptions
): Promise<AttestDealResult> {
  const existing = store.deals.get(dealId);
  if (!existing) throw new DealNotFoundError(dealId);
  if (!isManualDealType(existing.dealType)) {
    throw new DealAttestationError(
      "Attestation is only available for manual deals",
      400
    );
  }

  const now = options.now ?? new Date().toISOString();
  const seatsMap = options.seatsBySession;

  if (seatsMap && Object.keys(seatsMap).length > 0) {
    applySeatsMap(store, existing, seatsMap, options.actor, now);
  }

  const seatsBySession =
    seatsMap && Object.keys(seatsMap).length > 0
      ? seatsMap
      : seatsBySessionSnapshot(store, dealId);

  const { deal, attestation } = await createAttestationAndMaybeResume(
    store,
    dealId,
    {
      method: "dashboard",
      seatsBySession,
      actor: options.actor,
      now,
      attestedBy: options.actor.id ?? null,
    }
  );

  return {
    deal,
    attestation,
    sessions: sessionsForDeal(store, dealId),
  };
}

// ---------------------------------------------------------------------------
// Quick-update GET / POST
// ---------------------------------------------------------------------------

export type QuickUpdateDealView = {
  id: string;
  title: string | null;
  status: Deal["status"];
  pause_reason: Deal["pauseReason"];
  attestation_expires_at: string | null;
  sessions: Array<{
    id: string;
    start_at: string;
    end_at: string | null;
    manual_seats_available: number | null;
    seats_displayed: number | null;
    status: DealSession["status"];
  }>;
};

export type GetQuickUpdateResult = {
  operator_id: string;
  token_expires_at: string;
  deals: QuickUpdateDealView[];
};

export function getQuickUpdateByToken(
  store: DealDraftStore,
  rawToken: string,
  options?: { now?: string; secret?: string }
): GetQuickUpdateResult {
  const { record } = resolveQuickUpdateToken(store, rawToken, options);
  const deals = listQuickUpdateDeals(store, record.operatorId).map((d) => ({
    id: d.id,
    title: d.title,
    status: d.status,
    pause_reason: d.pauseReason,
    attestation_expires_at: d.attestationExpiresAt,
    sessions: sessionsForDeal(store, d.id).map((s) => ({
      id: s.id,
      start_at: s.startAt,
      end_at: s.endAt,
      manual_seats_available: s.manualSeatsAvailable,
      seats_displayed: s.seatsDisplayed,
      status: s.status,
    })),
  }));

  return {
    operator_id: record.operatorId,
    token_expires_at: record.expiresAt,
    deals,
  };
}

export type SubmitQuickUpdateOptions = {
  now?: string;
  secret?: string;
  actor?: DealActor;
};

export type SubmitQuickUpdateDealResult = {
  deal_id: string;
  ok: boolean;
  error?: string;
  deal?: Deal;
  attestation?: DealAttestation | null;
};

export type SubmitQuickUpdateResult = {
  token: QuickUpdateTokenRecord;
  results: SubmitQuickUpdateDealResult[];
};

function parseSeatsBySession(
  raw: unknown,
  fieldLabel: string
): Record<string, number> {
  if (raw == null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new DealAttestationError(
      `${fieldLabel} must be an object map of session_id → seats`,
      400
    );
  }
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const n =
      typeof value === "number"
        ? value
        : typeof value === "string" && value.trim() !== ""
          ? Number(value)
          : NaN;
    if (!Number.isInteger(n) || n < 0 || n > 999) {
      throw new DealAttestationError(
        `Invalid seats for session ${key}: must be an integer 0–999`,
        400
      );
    }
    out[key] = n;
  }
  return out;
}

/**
 * Normalize POST body deals array (snake_case or camelCase).
 */
export function parseQuickUpdateSubmissions(
  body: Record<string, unknown>
): QuickUpdateDealSubmission[] {
  const raw = body.deals;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new DealAttestationError(
      "Body must include a non-empty deals array",
      400
    );
  }

  const out: QuickUpdateDealSubmission[] = [];
  for (const item of raw) {
    if (item == null || typeof item !== "object" || Array.isArray(item)) {
      throw new DealAttestationError("Each deals entry must be an object", 400);
    }
    const row = item as Record<string, unknown>;
    const dealId = row.deal_id ?? row.dealId;
    if (typeof dealId !== "string" || !dealId) {
      throw new DealAttestationError("Each deals entry needs deal_id", 400);
    }
    const action = row.action;
    if (action !== "still_available" && action !== "sold_out") {
      throw new DealAttestationError(
        `Invalid action for ${dealId}: must be still_available or sold_out`,
        400
      );
    }
    const seatsRaw = row.seats_by_session ?? row.seatsBySession;
    const seatsBySession = parseSeatsBySession(
      seatsRaw,
      "seats_by_session"
    );
    out.push({ dealId, action, seatsBySession });
  }
  return out;
}

/**
 * POST /quick-update/:token — apply still_available / sold_out per deal,
 * then mark the token used (single-use per submission).
 */
export async function submitQuickUpdate(
  store: DealDraftStore,
  rawToken: string,
  submissions: QuickUpdateDealSubmission[],
  options?: SubmitQuickUpdateOptions
): Promise<SubmitQuickUpdateResult> {
  const maps = ensureAttestationMaps(store);
  const now = options?.now ?? new Date().toISOString();
  const { record } = resolveQuickUpdateToken(store, rawToken, {
    now,
    secret: options?.secret,
  });

  const actor: DealActor = options?.actor ?? { type: "system" };
  const method = channelToMethod(record.channel);
  const results: SubmitQuickUpdateDealResult[] = [];

  for (const sub of submissions) {
    try {
      const deal = store.deals.get(sub.dealId);
      if (!deal) {
        results.push({
          deal_id: sub.dealId,
          ok: false,
          error: "Deal not found",
        });
        continue;
      }
      if (deal.operatorId !== record.operatorId) {
        results.push({
          deal_id: sub.dealId,
          ok: false,
          error: "Deal does not belong to this operator",
        });
        continue;
      }
      if (!isManualDealType(deal.dealType)) {
        results.push({
          deal_id: sub.dealId,
          ok: false,
          error: "Only manual deals can be updated via quick-update",
        });
        continue;
      }
      if (!isQuickUpdateEligible(deal)) {
        results.push({
          deal_id: sub.dealId,
          ok: false,
          error: `Deal is not eligible for quick-update (status ${deal.status})`,
        });
        continue;
      }

      if (sub.action === "sold_out") {
        zeroAllManualSeats(store, sub.dealId, actor, now);
        // Optional: still create an attestation snapshot of zeros so expiry resets
        // only when still_available — sold_out leaves status via seats transition.
        let next = store.deals.get(sub.dealId)!;
        const remaining = sessionsForDeal(store, sub.dealId).filter(
          (s) => s.status === "live" || s.status === "sold_out"
        );
        const allZero =
          remaining.length > 0 &&
          remaining.every((s) => (s.seatsDisplayed ?? 0) === 0);
        if (next.status === "live" && allZero) {
          try {
            next = transitionDeal(asStatusStore(store), sub.dealId, "sold_out", {
              actor,
              now,
            });
          } catch (err) {
            if (!(err instanceof InvalidDealTransitionError)) throw err;
            next = store.deals.get(sub.dealId)!;
          }
        } else if (
          next.status === "auto_paused" &&
          next.pauseReason === "attestation_expired" &&
          allZero
        ) {
          // Leave auto_paused; seats are zero. Operator can end later.
        }
        results.push({
          deal_id: sub.dealId,
          ok: true,
          deal: next,
          attestation: null,
        });
        continue;
      }

      // still_available
      const seatsMap =
        sub.seatsBySession && Object.keys(sub.seatsBySession).length > 0
          ? sub.seatsBySession
          : seatsBySessionSnapshot(store, sub.dealId);

      if (Object.keys(seatsMap).length > 0) {
        applySeatsMap(store, deal, seatsMap, actor, now);
      }

      // Recompute displayed in case seats came from snapshot only
      for (const [sessionId, seats] of Object.entries(seatsMap)) {
        const session = store.sessions.get(sessionId);
        if (!session || session.dealId !== sub.dealId) continue;
        const seatsDisplayed = computeSeatsDisplayed(
          {
            providerSeatsAvailable: null,
            manualSeatsAvailable: seats,
            seatCap: session.seatCap,
          },
          store.deals.get(sub.dealId)!
        );
        if (
          session.manualSeatsAvailable !== seats ||
          session.seatsDisplayed !== seatsDisplayed
        ) {
          store.sessions.set(sessionId, {
            ...session,
            manualSeatsAvailable: seats,
            seatsDisplayed,
            updatedAt: now,
          });
        }
      }

      const { deal: updated, attestation } =
        await createAttestationAndMaybeResume(store, sub.dealId, {
          method,
          seatsBySession: seatsMap,
          actor,
          now,
        });

      results.push({
        deal_id: sub.dealId,
        ok: true,
        deal: updated,
        attestation,
      });
    } catch (err) {
      const message =
        err instanceof DealAttestationError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unknown error";
      results.push({ deal_id: sub.dealId, ok: false, error: message });
    }
  }

  const used = markTokenUsed(maps, record.id, now);
  return { token: used, results };
}

// ---------------------------------------------------------------------------
// Minute job: expiry auto-pause + reminders
// ---------------------------------------------------------------------------

export type AttestationJobOptions = {
  now?: string;
  secret?: string;
  /** Base path prefix for quick-update links (default /quick-update/). */
  quickUpdatePathPrefix?: string;
};

export type AttestationJobResult = {
  autoPausedDealIds: string[];
  remindersSent: Array<{
    operatorId: string;
    dealIds: string[];
    tokenId: string;
  }>;
};

function reminderAlreadySent(
  maps: DealAttestationStoreMaps,
  dealId: string,
  attestationExpiresAt: string
): boolean {
  for (const row of maps.attestationReminders.values()) {
    if (
      row.dealId === dealId &&
      row.attestationExpiresAt === attestationExpiresAt
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Every-minute job: auto-pause expired live manual attestations; send
 * reminder once when within default_attestation_reminder_hours.
 */
export async function runAttestationJob(
  store: DealDraftStore,
  options?: AttestationJobOptions
): Promise<AttestationJobResult> {
  const maps = ensureAttestationMaps(store);
  const now = options?.now ?? new Date().toISOString();
  const nowMs = Date.parse(now);
  const autoPausedDealIds: string[] = [];
  const remindersSent: AttestationJobResult["remindersSent"] = [];

  // 1) Auto-pause live manual deals past attestation_expires_at
  for (const deal of store.deals.values()) {
    if (!isManualDealType(deal.dealType)) continue;
    if (deal.status !== "live") continue;
    if (deal.attestationExpiresAt == null) continue;
    const expiresMs = Date.parse(deal.attestationExpiresAt);
    if (!Number.isFinite(expiresMs) || expiresMs > nowMs) continue;

    try {
      applyAutoPause(
        asStatusStore(store),
        deal.id,
        "attestation_expired",
        attestationExpiredDetail(),
        { actor: SYSTEM_ACTOR, now }
      );
      autoPausedDealIds.push(deal.id);
    } catch (err) {
      if (err instanceof InvalidDealTransitionError) continue;
      throw err;
    }
  }

  // 2) Reminders: group by operator so one token covers all due deals
  type Due = { deal: Deal; expiresAt: string };
  const dueByOperator = new Map<string, Due[]>();

  for (const deal of store.deals.values()) {
    if (!isManualDealType(deal.dealType)) continue;
    if (deal.status !== "live") continue;
    if (deal.attestationExpiresAt == null) continue;

    const expiresAt = deal.attestationExpiresAt;
    const expiresMs = Date.parse(expiresAt);
    if (!Number.isFinite(expiresMs)) continue;
    if (expiresMs <= nowMs) continue; // already handled by auto-pause

    const reminderHours = reminderHoursForOperator(store, deal.operatorId);
    const windowMs = reminderHours * 60 * 60 * 1000;
    if (expiresMs - nowMs > windowMs) continue;
    if (reminderAlreadySent(maps, deal.id, expiresAt)) continue;

    const list = dueByOperator.get(deal.operatorId) ?? [];
    list.push({ deal, expiresAt });
    dueByOperator.set(deal.operatorId, list);
  }

  for (const [operatorId, dues] of dueByOperator) {
    const dealIds = dues.map((d) => d.deal.id);
    const issued = issueQuickUpdateToken(store, operatorId, {
      channel: "email",
      now,
      secret: options?.secret,
      dealIds,
    });

    const channels: ("email" | "sms")[] = ["email", "sms"];
    await sendAttestationReminder({
      operatorId,
      dealIds,
      quickUpdatePath: buildQuickUpdatePath(issued.rawToken),
      quickUpdateToken: issued.rawToken,
      expiresAt: issued.record.expiresAt,
      channels,
      at: now,
    });

    for (const due of dues) {
      const row: AttestationReminderRecord = {
        id: crypto.randomUUID(),
        dealId: due.deal.id,
        attestationExpiresAt: due.expiresAt,
        sentAt: now,
        tokenId: issued.record.id,
        channels,
      };
      maps.attestationReminders.set(row.id, row);
    }

    remindersSent.push({
      operatorId,
      dealIds,
      tokenId: issued.record.id,
    });
  }

  return { autoPausedDealIds, remindersSent };
}
