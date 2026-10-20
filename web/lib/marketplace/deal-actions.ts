/**
 * Operator deal actions (deals platform Chunk 19).
 *
 * Pause / resume / end / archive, manual seats + mark sold out, and bulk actions.
 * All status changes go through transitionDeal. Resume re-runs validateForPublish.
 *
 * Spec: docs/deals-spec.md §4.2, §5.1.
 */

import { createDealAttestation, type DealAttestation } from "./deal-audit";
import type { DealDraftStore } from "./deal-draft";
import type { Deal } from "./deal";
import {
  validateDealInStore,
  type PublishValidationOutcome,
} from "./deal-publish-validation";
import { DealPublishError } from "./deal-publish";
import {
  computeSeatsDisplayed,
  type DealSession,
} from "./deal-session";
import {
  DealNotFoundError,
  DealStatusError,
  InvalidDealTransitionError,
  logDealEvent,
  transitionDeal,
  type DealActor,
  type DealStatusStore,
} from "./deal-status";
import { getPlatformConfig } from "./config";
import {
  isManualDealType,
  type DealStatus,
} from "./enums";

// ---------------------------------------------------------------------------
// Errors — reuse DealPublishError shape for 422 validation responses
// ---------------------------------------------------------------------------

export class DealActionsError extends Error {
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
    this.name = "DealActionsError";
    this.status = status;
    this.checks = extras?.checks;
    this.validation = extras?.validation;
  }
}

function asStatusStore(store: DealDraftStore): DealStatusStore {
  return { deals: store.deals, audit: store.audit };
}

function requireDeal(store: DealDraftStore, dealId: string): Deal {
  const deal = store.deals.get(dealId);
  if (!deal) throw new DealNotFoundError(dealId);
  return deal;
}

function sessionsForDeal(
  store: DealDraftStore,
  dealId: string
): DealSession[] {
  return [...store.sessions.values()].filter((s) => s.dealId === dealId);
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

function wrapTransitionError(err: unknown): never {
  if (
    err instanceof InvalidDealTransitionError ||
    err instanceof DealStatusError
  ) {
    throw new DealActionsError(err.message, 409);
  }
  throw err;
}

function isAttestationExpired(deal: Deal, nowIso: string): boolean {
  if (!isManualDealType(deal.dealType)) return false;
  if (deal.attestationExpiresAt == null) return true;
  const expiresMs = Date.parse(deal.attestationExpiresAt);
  if (!Number.isFinite(expiresMs)) return true;
  return expiresMs <= Date.parse(nowIso);
}

/** Resolve resume target: live if a sellable session is within lead hours, else scheduled. */
function resumeTargetStatus(
  validation: PublishValidationOutcome
): "live" | "scheduled" {
  return validation.hasSessionWithinLeadHours === true ? "live" : "scheduled";
}

const PAUSE_FROM: ReadonlySet<DealStatus> = new Set(["live", "scheduled"]);
const RESUME_FROM: ReadonlySet<DealStatus> = new Set([
  "paused",
  "auto_paused",
]);
const ARCHIVE_FROM: ReadonlySet<DealStatus> = new Set(["expired", "ended"]);

// ---------------------------------------------------------------------------
// Pause
// ---------------------------------------------------------------------------

export type PauseDealOptions = {
  actor: DealActor;
  detail?: string | null;
  now?: string;
};

/**
 * Operator pause → paused (reason=operator). From live or scheduled.
 */
export function pauseDeal(
  store: DealDraftStore,
  dealId: string,
  options: PauseDealOptions
): Deal {
  const existing = requireDeal(store, dealId);
  if (!PAUSE_FROM.has(existing.status)) {
    throw new DealActionsError(
      `Pause requires live or scheduled (currently ${existing.status})`,
      409
    );
  }

  try {
    return transitionDeal(asStatusStore(store), dealId, "paused", {
      actor: options.actor,
      reason: "operator",
      detail: options.detail ?? null,
      now: options.now,
    });
  } catch (err) {
    wrapTransitionError(err);
  }
}

// ---------------------------------------------------------------------------
// Resume
// ---------------------------------------------------------------------------

export type ResumeDealOptions = {
  actor: DealActor;
  /** Required true for manual deals when attestation has expired. */
  attest?: boolean;
  now?: string;
};

export type ResumeDealResult = {
  deal: Deal;
  validation: PublishValidationOutcome;
  target_status: "live" | "scheduled";
  attestation: DealAttestation | null;
};

/**
 * Operator resume from paused or auto_paused.
 * Re-runs validateForPublish; target is live or scheduled (no pending_review).
 * Manual deals with expired attestation require attest: true (creates attestation).
 */
export async function resumeDeal(
  store: DealDraftStore,
  dealId: string,
  options: ResumeDealOptions
): Promise<ResumeDealResult> {
  const existing = requireDeal(store, dealId);
  if (!RESUME_FROM.has(existing.status)) {
    throw new DealActionsError(
      `Resume requires paused or auto_paused (currently ${existing.status})`,
      409
    );
  }

  const now = options.now ?? new Date().toISOString();
  const manual = isManualDealType(existing.dealType);
  const attestationExpired = isAttestationExpired(existing, now);

  if (manual && attestationExpired && options.attest !== true) {
    throw new DealActionsError(
      "Manual deals with expired attestation require attest: true to resume",
      422,
      {
        checks: [
          {
            key: "attestation",
            label: "Attestation",
            passed: false,
            message:
              "Confirm seats are available and you will honour this price",
            editorStep: "review",
          },
        ],
      }
    );
  }

  const validation = await validateDealInStore(store, dealId, {
    now,
    attested: manual && (options.attest === true || !attestationExpired),
  });

  if (!validation.ok) {
    throw new DealActionsError("Resume validation failed", 422, {
      checks: validation.checks,
      validation,
    });
  }

  let deal = store.deals.get(dealId)!;
  let attestation: DealAttestation | null = null;

  if (manual && options.attest === true) {
    attestation = createDealAttestation(
      store.audit,
      {
        dealId,
        method: "dashboard",
        seatsBySession: seatsBySessionSnapshot(store, dealId),
        attestedBy: options.actor.id ?? null,
        attestedAt: now,
      },
      { now }
    );
    deal = {
      ...deal,
      lastAttestedAt: now,
      attestationExpiresAt: attestationExpiryIso(now),
      updatedAt: now,
    };
    store.deals.set(dealId, deal);
    logDealEvent(
      store.audit,
      dealId,
      "attested",
      options.actor,
      {
        method: "dashboard",
        attestation_id: attestation.id,
        expires_at: deal.attestationExpiresAt,
        context: "resume",
      },
      { now }
    );
  }

  const target = resumeTargetStatus(validation);

  try {
    deal = transitionDeal(asStatusStore(store), dealId, target, {
      actor: options.actor,
      now,
    });
  } catch (err) {
    wrapTransitionError(err);
  }

  return {
    deal,
    validation,
    target_status: target,
    attestation,
  };
}

// ---------------------------------------------------------------------------
// End / archive
// ---------------------------------------------------------------------------

export type EndDealOptions = {
  actor: DealActor;
  now?: string;
};

/**
 * Operator end → ended (any status except archived).
 */
export function endDeal(
  store: DealDraftStore,
  dealId: string,
  options: EndDealOptions
): Deal {
  requireDeal(store, dealId);
  try {
    return transitionDeal(asStatusStore(store), dealId, "ended", {
      actor: options.actor,
      now: options.now,
    });
  } catch (err) {
    wrapTransitionError(err);
  }
}

export type ArchiveDealOptions = {
  actor: DealActor;
  now?: string;
};

/**
 * Operator archive — expired or ended only.
 */
export function archiveDeal(
  store: DealDraftStore,
  dealId: string,
  options: ArchiveDealOptions
): Deal {
  const existing = requireDeal(store, dealId);
  if (!ARCHIVE_FROM.has(existing.status)) {
    throw new DealActionsError(
      `Archive requires expired or ended (currently ${existing.status})`,
      409
    );
  }

  try {
    return transitionDeal(asStatusStore(store), dealId, "archived", {
      actor: options.actor,
      now: options.now,
    });
  } catch (err) {
    wrapTransitionError(err);
  }
}

// ---------------------------------------------------------------------------
// Seats (manual only)
// ---------------------------------------------------------------------------

export type UpdateDealSeatsOptions = {
  actor: DealActor;
  /** Map of session_id → manual seats (0–999). */
  seats: Record<string, number>;
  now?: string;
};

export type UpdateDealSeatsResult = {
  deal: Deal;
  sessions: DealSession[];
};

function parseSeatsMap(
  raw: Record<string, unknown> | Record<string, number>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (
      key === "attest" ||
      key === "confirm" ||
      key === "action" ||
      key === "deal_ids" ||
      key === "dealIds"
    ) {
      continue;
    }
    // Nested { seats: { ... } } is handled by callers; skip non-numeric values.
    if (typeof value === "object" && value !== null) continue;
    const n =
      typeof value === "number"
        ? value
        : typeof value === "string" && value.trim() !== ""
          ? Number(value)
          : NaN;
    if (!Number.isInteger(n) || n < 0 || n > 999) {
      throw new DealActionsError(
        `Invalid seats for session ${key}: must be an integer 0–999`,
        400
      );
    }
    out[key] = n;
  }
  return out;
}

/**
 * Update manual seats for one or more sessions. Logs seats_changed.
 * If the deal is live and every remaining session has 0 seats → sold_out;
 * if sold_out and any remaining session has seats → live.
 */
export function updateDealSeats(
  store: DealDraftStore,
  dealId: string,
  options: UpdateDealSeatsOptions
): UpdateDealSeatsResult {
  const deal = requireDeal(store, dealId);
  if (!isManualDealType(deal.dealType)) {
    throw new DealActionsError(
      "Seat updates are only available for manual deals",
      400
    );
  }

  const seatsMap =
    options.seats && Object.keys(options.seats).length > 0
      ? parseSeatsMap(options.seats as Record<string, unknown>)
      : null;
  if (!seatsMap || Object.keys(seatsMap).length === 0) {
    throw new DealActionsError(
      "Body must include at least one session_id → seats entry",
      400
    );
  }

  const now = options.now ?? new Date().toISOString();
  const dealSessions = sessionsForDeal(store, dealId);
  const byId = new Map(dealSessions.map((s) => [s.id, s]));
  const updatedSessions: DealSession[] = [];

  for (const [sessionId, seats] of Object.entries(seatsMap)) {
    const existing = byId.get(sessionId);
    if (!existing) {
      throw new DealActionsError(`Session not found: ${sessionId}`, 404);
    }
    const before = existing.manualSeatsAvailable;
    const seatsDisplayed = computeSeatsDisplayed(
      {
        providerSeatsAvailable: null,
        manualSeatsAvailable: seats,
        seatCap: existing.seatCap,
      },
      deal
    );
    const updated: DealSession = {
      ...existing,
      manualSeatsAvailable: seats,
      seatsDisplayed,
      updatedAt: now,
    };
    store.sessions.set(sessionId, updated);
    byId.set(sessionId, updated);
    updatedSessions.push(updated);

    if (before !== seats) {
      logDealEvent(
        store.audit,
        dealId,
        "seats_changed",
        options.actor,
        {
          session_id: sessionId,
          old_manual_seats_available: before,
          new_manual_seats_available: seats,
          seats_displayed: seatsDisplayed,
        },
        { now }
      );
    }
  }

  let nextDeal = store.deals.get(dealId)!;
  const remaining = [...byId.values()].filter(
    (s) => s.status === "live" || s.status === "sold_out"
  );
  const anySeats = remaining.some((s) => (s.seatsDisplayed ?? 0) > 0);
  const allZero =
    remaining.length > 0 &&
    remaining.every((s) => (s.seatsDisplayed ?? 0) === 0);

  try {
    if (nextDeal.status === "live" && allZero) {
      nextDeal = transitionDeal(asStatusStore(store), dealId, "sold_out", {
        actor: options.actor,
        now,
      });
    } else if (nextDeal.status === "sold_out" && anySeats) {
      nextDeal = transitionDeal(asStatusStore(store), dealId, "live", {
        actor: options.actor,
        now,
      });
    }
  } catch (err) {
    wrapTransitionError(err);
  }

  return {
    deal: nextDeal,
    sessions: sessionsForDeal(store, dealId),
  };
}

// ---------------------------------------------------------------------------
// Mark sold out (manual only)
// ---------------------------------------------------------------------------

export type MarkSoldOutOptions = {
  actor: DealActor;
  now?: string;
};

export type MarkSoldOutResult = {
  deal: Deal;
  sessions: DealSession[];
};

/**
 * Set every session's manual seats to 0 and transition live → sold_out.
 */
export function markDealSoldOut(
  store: DealDraftStore,
  dealId: string,
  options: MarkSoldOutOptions
): MarkSoldOutResult {
  const deal = requireDeal(store, dealId);
  if (!isManualDealType(deal.dealType)) {
    throw new DealActionsError(
      "Mark sold out is only available for manual deals",
      400
    );
  }

  const now = options.now ?? new Date().toISOString();
  const dealSessions = sessionsForDeal(store, dealId);
  if (dealSessions.length === 0) {
    throw new DealActionsError("Deal has no sessions", 400);
  }

  const seats: Record<string, number> = {};
  for (const s of dealSessions) {
    seats[s.id] = 0;
  }

  // Always zero seats first (logs seats_changed).
  updateDealSeats(store, dealId, {
    actor: options.actor,
    seats,
    now,
  });

  let next = store.deals.get(dealId)!;
  if (next.status === "live") {
    try {
      next = transitionDeal(asStatusStore(store), dealId, "sold_out", {
        actor: options.actor,
        now,
      });
    } catch (err) {
      // updateDealSeats may already have transitioned live → sold_out.
      if (!(err instanceof InvalidDealTransitionError)) {
        wrapTransitionError(err);
      }
      next = store.deals.get(dealId)!;
    }
  } else if (next.status !== "sold_out") {
    throw new DealActionsError(
      `Mark sold out requires live (currently ${next.status})`,
      409
    );
  }

  return {
    deal: next,
    sessions: sessionsForDeal(store, dealId),
  };
}

// ---------------------------------------------------------------------------
// Bulk
// ---------------------------------------------------------------------------

export type BulkDealAction = "pause" | "resume" | "end" | "mark_sold_out";

export type BulkDealActionsInput = {
  action: BulkDealAction;
  dealIds: string[];
  /** Required true when action is pause. */
  confirm?: boolean;
  /** Passed through to resume for manual attestation. */
  attest?: boolean;
  actor: DealActor;
  now?: string;
};

export type BulkDealActionResultItem = {
  id: string;
  ok: boolean;
  error?: string;
  deal?: Deal;
  target_status?: "live" | "scheduled";
};

export type BulkDealActionsResult = {
  results: BulkDealActionResultItem[];
};

const BULK_ACTIONS: ReadonlySet<string> = new Set([
  "pause",
  "resume",
  "end",
  "mark_sold_out",
]);

export function isBulkDealAction(value: unknown): value is BulkDealAction {
  return typeof value === "string" && BULK_ACTIONS.has(value);
}

/**
 * Run pause | resume | end | mark_sold_out across deal_ids.
 * Returns per-deal { id, ok, error? }. Pause requires confirm=true.
 * mark_sold_out skips integrated deals with an error.
 */
export async function bulkDealActions(
  store: DealDraftStore,
  operatorId: string,
  input: BulkDealActionsInput
): Promise<BulkDealActionsResult> {
  if (!isBulkDealAction(input.action)) {
    throw new DealActionsError(
      "action must be pause, resume, end, or mark_sold_out",
      400
    );
  }
  if (!Array.isArray(input.dealIds) || input.dealIds.length === 0) {
    throw new DealActionsError("deal_ids must be a non-empty array", 400);
  }
  if (input.action === "pause" && input.confirm !== true) {
    throw new DealActionsError(
      "Bulk pause requires confirm: true",
      400
    );
  }

  const now = input.now ?? new Date().toISOString();
  const results: BulkDealActionResultItem[] = [];

  for (const dealId of input.dealIds) {
    try {
      const deal = store.deals.get(dealId);
      if (!deal) {
        results.push({ id: dealId, ok: false, error: "Deal not found" });
        continue;
      }
      if (deal.operatorId !== operatorId) {
        results.push({
          id: dealId,
          ok: false,
          error: "Deal does not belong to this operator",
        });
        continue;
      }

      if (input.action === "pause") {
        const updated = pauseDeal(store, dealId, {
          actor: input.actor,
          now,
        });
        results.push({ id: dealId, ok: true, deal: updated });
      } else if (input.action === "resume") {
        const resumed = await resumeDeal(store, dealId, {
          actor: input.actor,
          attest: input.attest,
          now,
        });
        results.push({
          id: dealId,
          ok: true,
          deal: resumed.deal,
          target_status: resumed.target_status,
        });
      } else if (input.action === "end") {
        const updated = endDeal(store, dealId, {
          actor: input.actor,
          now,
        });
        results.push({ id: dealId, ok: true, deal: updated });
      } else {
        // mark_sold_out
        if (!isManualDealType(deal.dealType)) {
          results.push({
            id: dealId,
            ok: false,
            error: "mark_sold_out is only available for manual deals",
          });
          continue;
        }
        const sold = markDealSoldOut(store, dealId, {
          actor: input.actor,
          now,
        });
        results.push({ id: dealId, ok: true, deal: sold.deal });
      }
    } catch (err) {
      const message =
        err instanceof DealActionsError || err instanceof DealPublishError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unknown error";
      results.push({ id: dealId, ok: false, error: message });
    }
  }

  return { results };
}

/** Normalize seats body: either a flat map or `{ seats: { ... } }`. */
export function normalizeSeatsBody(
  body: Record<string, unknown>
): Record<string, number> {
  const nested = body.seats;
  if (nested != null && typeof nested === "object" && !Array.isArray(nested)) {
    return parseSeatsMap(nested as Record<string, unknown>);
  }
  return parseSeatsMap(body);
}
