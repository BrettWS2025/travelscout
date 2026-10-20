/**
 * Status ticker job (deals platform Chunk 18).
 *
 * Runs every minute (invoke from cron / later job runner). Idempotent.
 * All deal status changes go through transitionDeal.
 *
 * Spec: docs/deals-spec.md §4.2, §4.5.
 */

import { getPlatformConfig, type PlatformConfig } from "./config";
import { listDealEvents } from "./deal-audit";
import type { DealDraftStore } from "./deal-draft";
import type { Deal } from "./deal";
import {
  hasSellableSessionWithinLeadHours,
  isSessionSellableAt,
  validateDealInStore,
  type PublishValidationOutcome,
} from "./deal-publish-validation";
import type { DealSession } from "./deal-session";
import {
  transitionDeal,
  type DealActor,
  type DealStatusStore,
} from "./deal-status";
import type { DealStatus, SessionStatus } from "./enums";

const SYSTEM_ACTOR: DealActor = { type: "system" };

const EXPIRE_FROM: ReadonlySet<DealStatus> = new Set([
  "live",
  "sold_out",
  "auto_paused",
  "paused",
  "scheduled",
]);

const REMAINING_SESSION_STATUSES: ReadonlySet<SessionStatus> = new Set([
  "live",
  "sold_out",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function salesCutoffMinutes(deal: Deal): number {
  return deal.salesCutoffMinutes ?? 0;
}

/** Sessions that are not expired or cancelled (still "remaining"). */
export function remainingSessions(sessions: DealSession[]): DealSession[] {
  return sessions.filter((s) => REMAINING_SESSION_STATUSES.has(s.status));
}

function allSessionsGone(sessions: DealSession[]): boolean {
  if (sessions.length === 0) return true;
  return sessions.every(
    (s) => s.status === "expired" || s.status === "cancelled"
  );
}

function archiveAnchorMs(
  store: DealDraftStore,
  deal: Deal
): number | null {
  if (deal.status === "ended" && deal.endedAt) {
    const ms = Date.parse(deal.endedAt);
    return Number.isFinite(ms) ? ms : null;
  }
  if (deal.status === "expired") {
    const events = listDealEvents(store.audit, deal.id).filter(
      (e) => e.eventType === "expired"
    );
    // Newest expired event; fall back to updatedAt.
    if (events.length > 0) {
      const latest = events[events.length - 1];
      const ms = Date.parse(latest.createdAt);
      if (Number.isFinite(ms)) return ms;
    }
    const ms = Date.parse(deal.updatedAt);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

/**
 * Traveller visibility: status live, at least one session starting within
 * MAX_LEAD_HOURS, and that session not past sales cutoff.
 * Use in all public inventory-deal queries.
 */
export function isVisibleToTravellers(
  deal: Pick<Deal, "status" | "salesCutoffMinutes">,
  sessions: DealSession[],
  now: string = new Date().toISOString(),
  config: PlatformConfig = getPlatformConfig()
): boolean {
  if (deal.status !== "live") return false;
  const cutoff = deal.salesCutoffMinutes;
  if (cutoff == null) return false;
  return hasSellableSessionWithinLeadHours(
    sessions,
    cutoff,
    now,
    config.MAX_LEAD_HOURS
  );
}

/**
 * Filter helper for public listings over operator_deals.
 */
export function filterVisibleToTravellers(
  deals: Deal[],
  sessionsByDealId: Map<string, DealSession[]> | ((dealId: string) => DealSession[]),
  now: string = new Date().toISOString(),
  config: PlatformConfig = getPlatformConfig()
): Deal[] {
  const getSessions =
    typeof sessionsByDealId === "function"
      ? sessionsByDealId
      : (id: string) => sessionsByDealId.get(id) ?? [];
  return deals.filter((d) =>
    isVisibleToTravellers(d, getSessions(d.id), now, config)
  );
}

// ---------------------------------------------------------------------------
// Discount-step hook (Chunk 43 fills this in)
// ---------------------------------------------------------------------------

export type ApplyCurrentDiscountStepsFn = (
  store: DealDraftStore,
  dealId: string,
  now: string
) => void | Promise<void>;

/**
 * Placeholder until stepped discounts (Chunk 43). No-op by default.
 * When steps activate, Chunk 43 will log price_changed and refresh display price.
 */
export async function applyCurrentDiscountSteps(
  _store: DealDraftStore,
  _dealId: string,
  _now: string
): Promise<void> {
  // Chunk 43
}

// ---------------------------------------------------------------------------
// Per-deal steps
// ---------------------------------------------------------------------------

export type StatusTickerDealResult = {
  dealId: string;
  sessionExpired: number;
  fromStatus: DealStatus;
  toStatus: DealStatus;
  transitions: DealStatus[];
};

function expirePastCutoffSessions(
  store: DealDraftStore,
  deal: Deal,
  nowIso: string
): number {
  const nowMs = Date.parse(nowIso);
  const cutoff = salesCutoffMinutes(deal);
  let count = 0;

  for (const session of sessionsForDeal(store, deal.id)) {
    if (session.status === "expired" || session.status === "cancelled") {
      continue;
    }
    // Past cutoff → session expired (idempotent: only write when changing).
    if (!isSessionSellableAt(session, cutoff, nowMs)) {
      store.sessions.set(session.id, {
        ...session,
        status: "expired",
        updatedAt: nowIso,
      });
      count += 1;
    }
  }
  return count;
}

async function maybePromoteScheduledToLive(
  store: DealDraftStore,
  deal: Deal,
  nowIso: string,
  options: {
    validate?: (dealId: string) => Promise<PublishValidationOutcome>;
  }
): Promise<Deal | null> {
  if (deal.status !== "scheduled") return null;

  const nowMs = Date.parse(nowIso);
  const publishAtMs =
    deal.publishAt != null ? Date.parse(deal.publishAt) : NaN;
  if (Number.isFinite(publishAtMs) && publishAtMs > nowMs) {
    return null;
  }

  const sessions = sessionsForDeal(store, deal.id);
  const cutoff = deal.salesCutoffMinutes;
  if (cutoff == null) return null;

  if (
    !hasSellableSessionWithinLeadHours(
      sessions,
      cutoff,
      nowIso,
      getPlatformConfig().MAX_LEAD_HOURS
    )
  ) {
    return null;
  }

  const validate =
    options.validate ??
    ((dealId: string) =>
      validateDealInStore(store, dealId, {
        now: nowIso,
        refreshStaleLinks: false,
      }));

  const validation = await validate(deal.id);
  if (!validation.ok) return null;

  return transitionDeal(asStatusStore(store), deal.id, "live", {
    actor: SYSTEM_ACTOR,
    now: nowIso,
  });
}

function maybeExpireDeal(
  store: DealDraftStore,
  deal: Deal,
  nowIso: string
): Deal | null {
  if (!EXPIRE_FROM.has(deal.status)) return null;
  const sessions = sessionsForDeal(store, deal.id);
  if (!allSessionsGone(sessions)) return null;

  return transitionDeal(asStatusStore(store), deal.id, "expired", {
    actor: SYSTEM_ACTOR,
    now: nowIso,
    detail: "All sessions expired or cancelled",
  });
}

function maybeSoldOutFlip(
  store: DealDraftStore,
  deal: Deal,
  nowIso: string
): Deal | null {
  const remaining = remainingSessions(sessionsForDeal(store, deal.id));
  if (remaining.length === 0) return null;

  const anySeats = remaining.some((s) => (s.seatsDisplayed ?? 0) > 0);

  if (deal.status === "live" && !anySeats) {
    return transitionDeal(asStatusStore(store), deal.id, "sold_out", {
      actor: SYSTEM_ACTOR,
      now: nowIso,
    });
  }

  if (deal.status === "sold_out" && anySeats) {
    return transitionDeal(asStatusStore(store), deal.id, "live", {
      actor: SYSTEM_ACTOR,
      now: nowIso,
    });
  }

  return null;
}

function maybeArchive(
  store: DealDraftStore,
  deal: Deal,
  nowIso: string
): Deal | null {
  if (deal.status !== "expired" && deal.status !== "ended") return null;

  const anchor = archiveAnchorMs(store, deal);
  if (anchor == null) return null;

  const { ARCHIVE_AFTER_DAYS } = getPlatformConfig();
  const archiveAfterMs = ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000;
  const nowMs = Date.parse(nowIso);
  if (nowMs < anchor + archiveAfterMs) return null;

  return transitionDeal(asStatusStore(store), deal.id, "archived", {
    actor: SYSTEM_ACTOR,
    now: nowIso,
  });
}

/**
 * Process one deal through the ticker rules. Safe to call repeatedly.
 */
export async function tickDealStatus(
  store: DealDraftStore,
  dealId: string,
  options?: {
    now?: string;
    applyDiscountSteps?: ApplyCurrentDiscountStepsFn;
    validate?: (dealId: string) => Promise<PublishValidationOutcome>;
  }
): Promise<StatusTickerDealResult> {
  const now = options?.now ?? new Date().toISOString();
  const existing = store.deals.get(dealId);
  if (!existing) {
    return {
      dealId,
      sessionExpired: 0,
      fromStatus: "draft",
      toStatus: "draft",
      transitions: [],
    };
  }

  const fromStatus = existing.status;
  const transitions: DealStatus[] = [];
  let deal = existing;

  // 1. scheduled → live when publish_at reached + session within lead + valid
  const promoted = await maybePromoteScheduledToLive(store, deal, now, {
    validate: options?.validate,
  });
  if (promoted) {
    deal = promoted;
    transitions.push("live");
  }

  // 2. Per session: past cutoff → expired
  deal = store.deals.get(dealId) ?? deal;
  const sessionExpired = expirePastCutoffSessions(store, deal, now);

  // 3. All sessions gone → deal expired
  deal = store.deals.get(dealId) ?? deal;
  const expired = maybeExpireDeal(store, deal, now);
  if (expired) {
    deal = expired;
    transitions.push("expired");
  }

  // 4. live ↔ sold_out from seats on remaining sessions
  deal = store.deals.get(dealId) ?? deal;
  const flipped = maybeSoldOutFlip(store, deal, now);
  if (flipped) {
    deal = flipped;
    transitions.push(flipped.status);
  }

  // 5. Discount step hook (Chunk 43)
  const applySteps =
    options?.applyDiscountSteps ?? applyCurrentDiscountSteps;
  await applySteps(store, dealId, now);

  // 6. expired/ended → archived after ARCHIVE_AFTER_DAYS
  deal = store.deals.get(dealId) ?? deal;
  const archived = maybeArchive(store, deal, now);
  if (archived) {
    deal = archived;
    transitions.push("archived");
  }

  return {
    dealId,
    sessionExpired,
    fromStatus,
    toStatus: deal.status,
    transitions,
  };
}

// ---------------------------------------------------------------------------
// Job
// ---------------------------------------------------------------------------

export type StatusTickerJobResult = {
  dealsProcessed: number;
  sessionExpired: number;
  transitions: number;
  results: StatusTickerDealResult[];
};

export type RunStatusTickerOptions = {
  now?: string;
  /** Limit to specific deal ids (tests). Default: all deals in store. */
  dealIds?: string[];
  applyDiscountSteps?: ApplyCurrentDiscountStepsFn;
  validate?: (dealId: string) => Promise<PublishValidationOutcome>;
};

/**
 * Status ticker: scheduled↔live, session/deal expiry, sold_out, archive.
 * Idempotent — a second run at the same `now` performs no further transitions.
 */
export async function runStatusTickerJob(
  store: DealDraftStore,
  options?: RunStatusTickerOptions
): Promise<StatusTickerJobResult> {
  const now = options?.now ?? new Date().toISOString();
  const dealIds =
    options?.dealIds ?? [...store.deals.keys()].sort((a, b) => a.localeCompare(b));

  const results: StatusTickerDealResult[] = [];
  let sessionExpired = 0;
  let transitions = 0;

  for (const dealId of dealIds) {
    const r = await tickDealStatus(store, dealId, {
      now,
      applyDiscountSteps: options?.applyDiscountSteps,
      validate: options?.validate,
    });
    results.push(r);
    sessionExpired += r.sessionExpired;
    transitions += r.transitions.length;
  }

  return {
    dealsProcessed: results.length,
    sessionExpired,
    transitions,
    results,
  };
}
