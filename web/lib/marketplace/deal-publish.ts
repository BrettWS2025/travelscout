/**
 * Publish, schedule, review and attestation (deals platform Chunk 17).
 *
 * - POST publish (operator): validate → attest (manual) → pending_review or
 *   scheduled/live; link check on publish.
 * - Admin approve / reject / pause / manual-review flag.
 * - Exposes publish button label for GET deal detail.
 *
 * Spec: docs/deals-spec.md §4.1–4.2. Constants via getPlatformConfig().
 */

import {
  runLinkCheck,
  type FetchLike,
  type RunLinkCheckResult,
} from "./booking-link";
import { getPlatformConfig } from "./config";
import {
  createDealAttestation,
  listDealEvents,
  type DealAttestation,
} from "./deal-audit";
import type { DealDraftStore } from "./deal-draft";
import type { Deal } from "./deal";
import {
  validateDealInStore,
  type PublishValidationOutcome,
} from "./deal-publish-validation";
import {
  DealNotFoundError,
  DealStatusError,
  InvalidDealTransitionError,
  logDealEvent,
  transitionDeal,
  type DealActor,
  type DealStatusStore,
} from "./deal-status";
import {
  isManualDealType,
  type DealStatus,
} from "./enums";
import {
  setOperatorRequiresManualReview,
  type Operator,
} from "./operators";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class DealPublishError extends Error {
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
    this.name = "DealPublishError";
    this.status = status;
    this.checks = extras?.checks;
    this.validation = extras?.validation;
  }
}

// ---------------------------------------------------------------------------
// Notify operator members (Chunk 39: deal_review_update)
// ---------------------------------------------------------------------------

export type DealReviewNotifyPayload = {
  operatorId: string;
  dealId: string;
  dealTitle: string | null;
  submittedBy: string | null;
  at: string;
  action?: "submitted" | "approved" | "rejected";
  notes?: string | null;
};

export type NotifyAdminsOfDealReviewFn = (
  payload: DealReviewNotifyPayload
) => void | Promise<void>;

let notifyAdminsHook: NotifyAdminsOfDealReviewFn | null = null;

/** Test override; null → notify() via notifyDealReviewUpdate. */
export function setNotifyAdminsOfDealReview(
  fn: NotifyAdminsOfDealReviewFn | null
): void {
  notifyAdminsHook = fn;
}

export async function notifyAdminsOfDealReview(
  store: DealDraftStore,
  payload: DealReviewNotifyPayload
): Promise<void> {
  if (notifyAdminsHook) {
    await notifyAdminsHook(payload);
    return;
  }
  const { notifyDealReviewUpdate } = await import("./notifications");
  await notifyDealReviewUpdate(store, {
    operatorId: payload.operatorId,
    dealId: payload.dealId,
    dealTitle: payload.dealTitle,
    action: payload.action ?? "submitted",
    submittedBy: payload.submittedBy,
    notes: payload.notes ?? null,
    at: payload.at,
  });
}

// ---------------------------------------------------------------------------
// Publish button / target helpers
// ---------------------------------------------------------------------------

export type PublishButtonLabel =
  | "Publish"
  | "Schedule"
  | "Submit for review";

export type PublishTargetStatus = "pending_review" | "scheduled" | "live";

function asStatusStore(store: DealDraftStore): DealStatusStore {
  return { deals: store.deals, audit: store.audit };
}

/**
 * Count of manual deals for an operator that an admin has approved
 * (DealEvent type `approved`). Used with MANUAL_REVIEW_COUNT.
 */
export function countApprovedManualDeals(
  store: DealDraftStore,
  operatorId: string
): number {
  const manualDealIds = new Set(
    [...store.deals.values()]
      .filter(
        (d) => d.operatorId === operatorId && isManualDealType(d.dealType)
      )
      .map((d) => d.id)
  );
  const approvedDealIds = new Set<string>();
  for (const dealId of manualDealIds) {
    const events = listDealEvents(store.audit, dealId);
    if (events.some((e) => e.eventType === "approved")) {
      approvedDealIds.add(dealId);
    }
  }
  return approvedDealIds.size;
}

export function needsManualReview(
  store: DealDraftStore,
  deal: Deal,
  operator: Operator
): boolean {
  if (operator.requiresManualReview) return true;
  if (!isManualDealType(deal.dealType)) return false;
  const { MANUAL_REVIEW_COUNT } = getPlatformConfig();
  return countApprovedManualDeals(store, deal.operatorId) < MANUAL_REVIEW_COUNT;
}

export function resolvePublishTarget(
  store: DealDraftStore,
  deal: Deal,
  operator: Operator,
  options: {
    now: string;
    hasSessionWithinLeadHours?: boolean;
  }
): PublishTargetStatus {
  if (needsManualReview(store, deal, operator)) {
    return "pending_review";
  }

  const nowMs = Date.parse(options.now);
  const publishAtMs =
    deal.publishAt != null ? Date.parse(deal.publishAt) : NaN;
  if (Number.isFinite(publishAtMs) && publishAtMs > nowMs) {
    return "scheduled";
  }

  if (options.hasSessionWithinLeadHours === false) {
    return "scheduled";
  }

  // Undefined timing treated as scheduled (fail closed to scheduled, not live).
  if (options.hasSessionWithinLeadHours !== true) {
    return "scheduled";
  }

  return "live";
}

export function publishButtonLabel(
  target: PublishTargetStatus
): PublishButtonLabel {
  if (target === "pending_review") return "Submit for review";
  if (target === "scheduled") return "Schedule";
  return "Publish";
}

/**
 * Button label for the editor before clicking publish (Chunk 17 GET exposure).
 */
export function getPublishButtonLabel(
  store: DealDraftStore,
  dealId: string,
  options?: {
    now?: string;
    hasSessionWithinLeadHours?: boolean;
  }
): PublishButtonLabel {
  const deal = store.deals.get(dealId);
  if (!deal) throw new DealNotFoundError(dealId);
  const operator = store.operators.operators.get(deal.operatorId);
  if (!operator) {
    throw new DealPublishError("Operator not found", 404);
  }
  const now = options?.now ?? new Date().toISOString();
  const target = resolvePublishTarget(store, deal, operator, {
    now,
    hasSessionWithinLeadHours: options?.hasSessionWithinLeadHours,
  });
  return publishButtonLabel(target);
}

function seatsBySessionSnapshot(store: DealDraftStore, dealId: string) {
  const seats: Record<string, number> = {};
  for (const session of store.sessions.values()) {
    if (session.dealId !== dealId) continue;
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

// ---------------------------------------------------------------------------
// Publish
// ---------------------------------------------------------------------------

export type PublishDealOptions = {
  actor: DealActor;
  /** Required true for manual deals. */
  attest?: boolean;
  now?: string;
  fetchFn?: FetchLike;
  /** Skip HTTP link check (tests). Default false. */
  skipLinkCheck?: boolean;
};

export type PublishDealResult = {
  deal: Deal;
  validation: PublishValidationOutcome;
  publish_button: PublishButtonLabel;
  target_status: PublishTargetStatus;
  attestation: DealAttestation | null;
  link_check: RunLinkCheckResult | null;
};

/**
 * Operator publish: validate → (manual) attest → pending_review | scheduled | live.
 */
export async function publishDeal(
  store: DealDraftStore,
  dealId: string,
  options: PublishDealOptions
): Promise<PublishDealResult> {
  const existing = store.deals.get(dealId);
  if (!existing) throw new DealNotFoundError(dealId);

  if (existing.status !== "draft") {
    throw new DealPublishError(
      `Deal must be draft to publish (currently ${existing.status})`,
      409
    );
  }

  const operator = store.operators.operators.get(existing.operatorId);
  if (!operator) {
    throw new DealPublishError("Operator not found", 404);
  }

  const now = options.now ?? new Date().toISOString();
  const manual = isManualDealType(existing.dealType);

  if (manual && options.attest !== true) {
    throw new DealPublishError(
      "Manual deals require attest: true to publish",
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
    attested: manual ? true : options.attest,
    fetchFn: options.fetchFn,
    refreshStaleLinks: options.fetchFn != null,
  });

  if (!validation.ok) {
    throw new DealPublishError("Publish validation failed", 422, {
      checks: validation.checks,
      validation,
    });
  }

  // Re-read after validation (link refresh may have updated the deal).
  let deal = store.deals.get(dealId)!;
  let attestation: DealAttestation | null = null;

  if (manual) {
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
      },
      { now }
    );
  }

  const target = resolvePublishTarget(store, deal, operator, {
    now,
    hasSessionWithinLeadHours: validation.hasSessionWithinLeadHours,
  });

  try {
    deal = transitionDeal(asStatusStore(store), dealId, target, {
      actor: options.actor,
      now,
    });
  } catch (err) {
    if (err instanceof InvalidDealTransitionError) {
      throw new DealPublishError(err.message, 409);
    }
    throw err;
  }

  if (target === "pending_review") {
    await notifyAdminsOfDealReview(store, {
      operatorId: deal.operatorId,
      dealId: deal.id,
      dealTitle: deal.title,
      submittedBy: options.actor.id ?? null,
      action: "submitted",
      at: now,
    });
  }

  let linkCheck: RunLinkCheckResult | null = null;
  if (!options.skipLinkCheck) {
    linkCheck = await runLinkCheck(store, dealId, {
      now,
      actor: options.actor,
      fetchFn: options.fetchFn,
    });
    deal = store.deals.get(dealId) ?? deal;
  }

  return {
    deal,
    validation,
    publish_button: publishButtonLabel(target),
    target_status: target,
    attestation,
    link_check: linkCheck,
  };
}

// ---------------------------------------------------------------------------
// Admin: approve / reject / pause / manual-review flag
// ---------------------------------------------------------------------------

export type ApproveDealOptions = {
  actor: DealActor;
  now?: string;
  fetchFn?: FetchLike;
  skipLinkCheck?: boolean;
};

export type ApproveDealResult = {
  deal: Deal;
  validation: PublishValidationOutcome;
  publish_button: PublishButtonLabel;
  target_status: Exclude<PublishTargetStatus, "pending_review">;
  link_check: RunLinkCheckResult | null;
};

/**
 * Admin approve: re-validate, then scheduled or live (same rules as publish step 4).
 */
export async function approveDeal(
  store: DealDraftStore,
  dealId: string,
  options: ApproveDealOptions
): Promise<ApproveDealResult> {
  const existing = store.deals.get(dealId);
  if (!existing) throw new DealNotFoundError(dealId);

  if (existing.status !== "pending_review") {
    throw new DealPublishError(
      `Deal must be pending_review to approve (currently ${existing.status})`,
      409
    );
  }

  const operator = store.operators.operators.get(existing.operatorId);
  if (!operator) {
    throw new DealPublishError("Operator not found", 404);
  }

  const now = options.now ?? new Date().toISOString();

  // Manual attestation from submit-for-review must still be current (deal fields).
  const validation = await validateDealInStore(store, dealId, {
    now,
    fetchFn: options.fetchFn,
    refreshStaleLinks: options.fetchFn != null,
  });

  if (!validation.ok) {
    throw new DealPublishError("Publish validation failed", 422, {
      checks: validation.checks,
      validation,
    });
  }

  logDealEvent(
    store.audit,
    dealId,
    "approved",
    options.actor.type === "admin"
      ? options.actor
      : { type: "admin", id: options.actor.id },
    { from_status: "pending_review" },
    { now }
  );

  // Approve ignores requires_manual_review / review count — go scheduled or live.
  const nowMs = Date.parse(now);
  const publishAtMs =
    existing.publishAt != null ? Date.parse(existing.publishAt) : NaN;
  let target: "scheduled" | "live" = "live";
  if (Number.isFinite(publishAtMs) && publishAtMs > nowMs) {
    target = "scheduled";
  } else if (validation.hasSessionWithinLeadHours !== true) {
    target = "scheduled";
  }

  let deal: Deal;
  try {
    deal = transitionDeal(asStatusStore(store), dealId, target, {
      actor:
        options.actor.type === "admin"
          ? options.actor
          : { type: "admin", id: options.actor.id },
      now,
    });
  } catch (err) {
    if (err instanceof InvalidDealTransitionError) {
      throw new DealPublishError(err.message, 409);
    }
    throw err;
  }

  let linkCheck: RunLinkCheckResult | null = null;
  if (!options.skipLinkCheck) {
    linkCheck = await runLinkCheck(store, dealId, {
      now,
      actor: { type: "admin", id: options.actor.id },
      fetchFn: options.fetchFn,
    });
    deal = store.deals.get(dealId) ?? deal;
  }

  await notifyAdminsOfDealReview(store, {
    operatorId: deal.operatorId,
    dealId: deal.id,
    dealTitle: deal.title,
    submittedBy: null,
    action: "approved",
    at: now,
  });

  return {
    deal,
    validation,
    publish_button: publishButtonLabel(target),
    target_status: target,
    link_check: linkCheck,
  };
}

export type RejectDealOptions = {
  actor: DealActor;
  notes: string;
  now?: string;
};

export async function rejectDeal(
  store: DealDraftStore,
  dealId: string,
  options: RejectDealOptions
): Promise<Deal> {
  const existing = store.deals.get(dealId);
  if (!existing) throw new DealNotFoundError(dealId);

  if (existing.status !== "pending_review") {
    throw new DealPublishError(
      `Deal must be pending_review to reject (currently ${existing.status})`,
      409
    );
  }

  const notes = options.notes?.trim();
  if (!notes) {
    throw new DealPublishError("notes are required to reject a deal", 400);
  }

  const actor: DealActor =
    options.actor.type === "admin"
      ? options.actor
      : { type: "admin", id: options.actor.id };

  const now = options.now ?? new Date().toISOString();
  let deal: Deal;
  try {
    deal = transitionDeal(asStatusStore(store), dealId, "draft", {
      actor,
      detail: notes,
      now,
      eventDetail: { notes },
    });
  } catch (err) {
    if (err instanceof InvalidDealTransitionError) {
      throw new DealPublishError(err.message, 409);
    }
    throw err;
  }

  await notifyAdminsOfDealReview(store, {
    operatorId: deal.operatorId,
    dealId: deal.id,
    dealTitle: deal.title,
    submittedBy: null,
    action: "rejected",
    notes,
    at: now,
  });

  return deal;
}

export type AdminPauseDealOptions = {
  actor: DealActor;
  detail?: string | null;
  now?: string;
};

/**
 * Admin pause (reason=admin). No auto-resume.
 * Allowed from live or scheduled (and other edges that allow → paused).
 */
export function adminPauseDeal(
  store: DealDraftStore,
  dealId: string,
  options: AdminPauseDealOptions
): Deal {
  const existing = store.deals.get(dealId);
  if (!existing) throw new DealNotFoundError(dealId);

  const actor: DealActor =
    options.actor.type === "admin"
      ? options.actor
      : { type: "admin", id: options.actor.id };

  const allowedFrom: DealStatus[] = ["live", "scheduled"];
  if (!allowedFrom.includes(existing.status)) {
    throw new DealPublishError(
      `Admin pause requires live or scheduled (currently ${existing.status})`,
      409
    );
  }

  try {
    return transitionDeal(asStatusStore(store), dealId, "paused", {
      actor,
      reason: "admin",
      detail: options.detail ?? null,
      now: options.now,
    });
  } catch (err) {
    if (
      err instanceof InvalidDealTransitionError ||
      err instanceof DealStatusError
    ) {
      throw new DealPublishError(err.message, 409);
    }
    throw err;
  }
}

export function setManualReviewFlag(
  store: DealDraftStore,
  operatorId: string,
  on: boolean,
  options?: { now?: string }
): Operator {
  return setOperatorRequiresManualReview(
    store.operators,
    operatorId,
    on,
    options
  );
}
