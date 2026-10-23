/**
 * Book now click flow and tracking (deals platform Chunk 36).
 *
 * Public: POST /api/marketplace/deals/:slug/book { session_id, visitor_id }
 * Creates a ClickEvent, rechecks integrated availability when CLICK_RECHECK,
 * builds tracked booking URLs, and fails closed when live data cannot be confirmed.
 *
 * Spec: docs/deals-spec.md §4.4.
 */

import { buildTrackedUrl } from "./booking-link";
import {
  getPlatformConfig,
  type PlatformConfig,
} from "./config";
import { createClickEvent, type ClickEvent } from "./deal-audit";
import type { DealDraftStore } from "./deal-draft";
import { getDealCoverImage } from "./deal-media";
import { nextSessionForDeal } from "./deal-list";
import type { Deal } from "./deal";
import {
  computeSeatsDisplayed,
  withSeatsDisplayed,
  type DealSession,
} from "./deal-session";
import {
  isVisibleToTravellers,
} from "./deal-status-ticker";
import {
  transitionDeal,
  type DealActor,
  type DealStatusStore,
} from "./deal-status";
import { bookingPromoForSession } from "./deal-stepped-discounts";
import {
  isIntegratedDealType,
  isManualDealType,
  type RecheckResult,
} from "./enums";
import type { SyncLog } from "./integration";
import { getAdapter } from "./providers";
import { AdapterOperationError } from "./providers/errors";
import {
  BOOK_NOW_RATE_LIMIT_MAX,
  BOOK_NOW_RATE_LIMIT_WINDOW_MS,
  checkBookNowRateLimit,
  enforceBookNowRateLimit,
  resetBookNowRateLimit,
} from "./public-rate-limit";

// Re-export rate-limit helpers for existing Book now tests / callers.
export {
  BOOK_NOW_RATE_LIMIT_MAX,
  BOOK_NOW_RATE_LIMIT_WINDOW_MS,
  checkBookNowRateLimit,
  resetBookNowRateLimit,
};

// ---------------------------------------------------------------------------
// Errors / types
// ---------------------------------------------------------------------------

export class DealBookNowError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly retryAfterSec?: number;

  constructor(
    message: string,
    status = 400,
    opts?: { code?: string; retryAfterSec?: number }
  ) {
    super(message);
    this.name = "DealBookNowError";
    this.status = status;
    this.code = opts?.code;
    this.retryAfterSec = opts?.retryAfterSec;
  }
}

export type BookNowAlternative = {
  id: string;
  slug: string;
  title: string | null;
  region: string | null;
  next_session_start: string | null;
  cover_url: string | null;
};

export type BookNowOperatorContact = {
  public_phone: string | null;
  public_email: string | null;
  website: string | null;
  trading_name: string;
};

export type BookNowDestination = {
  type: string;
  url: string | null;
  phone: string | null;
  email: string | null;
};

export type BookNowOutcome =
  | {
      outcome: "redirect";
      click_id: string;
      url: string;
      instructions: string | null;
    }
  | {
      outcome: "show_instructions";
      click_id: string;
      booking_instructions: string | null;
      destination: BookNowDestination;
      url: string | null;
    }
  | {
      outcome: "unavailable";
      click_id: string;
      alternatives: BookNowAlternative[];
      message?: string;
    }
  | {
      outcome: "just_sold_out";
      click_id: string;
      alternatives: BookNowAlternative[];
    }
  | {
      outcome: "cannot_confirm";
      click_id: string;
      operator: BookNowOperatorContact;
      message: string;
    };

export type BookNowInput = {
  session_id: string;
  visitor_id: string;
};

export type BookNowOptions = {
  now?: string;
  /** Client IP for IP-bound rate limiting (security S16; required for enforcement). */
  clientIp?: string | null;
  /** Skip rate limit (tests). */
  skipRateLimit?: boolean;
  config?: PlatformConfig;
  /** Override getAvailability (tests). */
  getAvailabilityFn?: (
    ...args: Parameters<ReturnType<typeof getAdapter>["getAvailability"]>
  ) => ReturnType<ReturnType<typeof getAdapter>["getAvailability"]>;
};

const SYSTEM_ACTOR: DealActor = { type: "system" };
const CANNOT_CONFIRM_MESSAGE = "We couldn't confirm live availability";

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
  return [...store.sessions.values()].filter((s) => s.dealId === dealId);
}

export function findDealBySlug(
  store: DealDraftStore,
  slug: string
): Deal | null {
  const normalised = slug.trim();
  if (!normalised) return null;
  for (const deal of store.deals.values()) {
    if (deal.slug === normalised) return deal;
  }
  return null;
}

function ensureSyncLogs(store: DealDraftStore): Map<string, SyncLog> {
  if (!store.syncLogs) store.syncLogs = new Map();
  return store.syncLogs;
}

function writeClickRecheckSyncLog(
  store: DealDraftStore,
  integrationId: string,
  dealId: string,
  now: string,
  result: {
    ok: boolean;
    errorCode?: string | null;
    errorMessage?: string | null;
  }
): SyncLog {
  const logs = ensureSyncLogs(store);
  const log: SyncLog = {
    id: crypto.randomUUID(),
    integrationId,
    syncType: "click_recheck",
    status: result.ok ? "success" : "failed",
    startedAt: now,
    finishedAt: now,
    itemsProcessed: 1,
    errorCode: result.errorCode ?? null,
    errorMessage: result.errorMessage ?? null,
    affectedDealIds: [dealId],
    createdAt: now,
    updatedAt: now,
  };
  logs.set(log.id, log);
  return log;
}

function patchClickEvent(
  store: DealDraftStore,
  click: ClickEvent,
  patch: Partial<Pick<ClickEvent, "recheckResult" | "redirectUrl">>
): ClickEvent {
  const next: ClickEvent = { ...click, ...patch };
  store.audit.clicks.set(click.id, next);
  return next;
}

function isAttestationCurrent(deal: Deal, nowIso: string): boolean {
  if (!isManualDealType(deal.dealType)) return true;
  if (deal.attestationExpiresAt == null) return false;
  const expiresMs = Date.parse(deal.attestationExpiresAt);
  if (!Number.isFinite(expiresMs)) return false;
  return expiresMs > Date.parse(nowIso);
}

function remainingSellableSessions(sessions: DealSession[]): DealSession[] {
  return sessions.filter(
    (s) => s.status === "live" || s.status === "sold_out"
  );
}

function maybeFlipDealSoldOut(
  store: DealDraftStore,
  dealId: string,
  now: string
): void {
  const deal = store.deals.get(dealId);
  if (!deal) return;
  const remaining = remainingSellableSessions(sessionsForDeal(store, dealId));
  if (remaining.length === 0) return;
  const anySeats = remaining.some((s) => (s.seatsDisplayed ?? 0) > 0);
  if (deal.status === "live" && !anySeats) {
    transitionDeal(asStatusStore(store), dealId, "sold_out", {
      actor: SYSTEM_ACTOR,
      now,
      detail: "Sold out on Book now recheck",
    });
  }
}

function updateSessionFromRecheck(
  store: DealDraftStore,
  deal: Deal,
  session: DealSession,
  seats: number,
  now: string,
  status: "live" | "sold_out"
): DealSession {
  let next: DealSession = {
    ...session,
    providerSeatsAvailable: seats,
    lastSyncedAt: now,
    updatedAt: now,
    status,
  };
  next = withSeatsDisplayed(next, deal);
  // Force displayed seats from provider when sold out
  if (status === "sold_out") {
    next = {
      ...next,
      seatsDisplayed: computeSeatsDisplayed(
        {
          providerSeatsAvailable: 0,
          manualSeatsAvailable: null,
          seatCap: next.seatCap,
        },
        deal
      ),
    };
  }
  store.sessions.set(next.id, next);
  return next;
}

/**
 * Other live deals in the same region, soonest next session first, max 4.
 * Excludes the clicked deal. Fail-closed visibility via isVisibleToTravellers.
 */
export function listNearbyAlternatives(
  store: DealDraftStore,
  deal: Deal,
  now: string,
  config: PlatformConfig = getPlatformConfig(),
  limit = 4
): BookNowAlternative[] {
  const region = deal.region;
  if (!region) return [];

  type Ranked = { alt: BookNowAlternative; start: string };
  const ranked: Ranked[] = [];

  for (const candidate of store.deals.values()) {
    if (candidate.id === deal.id) continue;
    if (candidate.region !== region) continue;
    const sessions = sessionsForDeal(store, candidate.id);
    if (!isVisibleToTravellers(candidate, sessions, now, config)) continue;
    const next = nextSessionForDeal(sessions, now);
    const cover = getDealCoverImage(store.media, candidate.id);
    ranked.push({
      start: next?.startAt ?? "9999",
      alt: {
        id: candidate.id,
        slug: candidate.slug,
        title: candidate.title,
        region: candidate.region,
        next_session_start: next?.startAt ?? null,
        cover_url: cover?.url ?? null,
      },
    });
  }

  ranked.sort((a, b) => a.start.localeCompare(b.start));
  return ranked.slice(0, limit).map((r) => r.alt);
}

function operatorContact(
  store: DealDraftStore,
  operatorId: string
): BookNowOperatorContact {
  const op = store.operators.operators.get(operatorId);
  return {
    public_phone: op?.publicPhone ?? null,
    public_email: op?.publicEmail ?? null,
    website: op?.website ?? null,
    trading_name: op?.tradingName ?? "Operator",
  };
}

function buildDestinationUrl(
  store: DealDraftStore,
  deal: Deal,
  session: DealSession | null,
  clickId: string,
  now?: string
): string | null {
  const type = deal.bookingDestinationType;
  if (type === "phone" && deal.bookingPhone) {
    return `tel:${deal.bookingPhone}`;
  }
  if (type === "email" && deal.bookingEmail) {
    return `mailto:${deal.bookingEmail}`;
  }
  if (type !== "provider_booking_page" && type !== "operator_website") {
    return null;
  }

  let baseUrl: string | null = deal.bookingUrl;
  const promoCode =
    session != null
      ? bookingPromoForSession(
          store,
          deal,
          session,
          now ?? new Date().toISOString()
        )
      : deal.promoCode;

  if (
    type === "provider_booking_page" &&
    isIntegratedDealType(deal.dealType) &&
    deal.integrationId &&
    deal.externalProductId
  ) {
    const integration = store.integrations?.get(deal.integrationId);
    const product = store.externalProducts?.get(deal.externalProductId);
    if (integration && product) {
      try {
        const adapter = getAdapter(integration.provider);
        let extSessionExternalId: string | undefined;
        if (session?.externalSessionId) {
          const ext = store.externalSessions?.get(session.externalSessionId);
          extSessionExternalId = ext?.externalId;
        }
        baseUrl = adapter.buildBookingUrl(
          integration,
          { external_id: product.externalId, name: product.name },
          extSessionExternalId
            ? { external_id: extSessionExternalId }
            : undefined,
          promoCode
        );
      } catch {
        // fall through to deal.bookingUrl
      }
    }
  }

  if (!baseUrl) return null;
  if (deal.appendTrackingParams) {
    return buildTrackedUrl(baseUrl, deal, clickId);
  }
  return baseUrl;
}

function destinationPayload(
  deal: Deal,
  url: string | null
): BookNowDestination {
  return {
    type: deal.bookingDestinationType ?? "unknown",
    url:
      deal.bookingDestinationType === "provider_booking_page" ||
      deal.bookingDestinationType === "operator_website"
        ? url
        : deal.bookingUrl,
    phone: deal.bookingPhone,
    email: deal.bookingEmail,
  };
}

function parseBookNowBody(body: Record<string, unknown>): BookNowInput {
  const sessionId = body.session_id;
  const visitorId = body.visitor_id;
  if (typeof sessionId !== "string" || sessionId.trim() === "") {
    throw new DealBookNowError("session_id is required", 400, {
      code: "session_id_required",
    });
  }
  if (typeof visitorId !== "string" || visitorId.trim() === "") {
    throw new DealBookNowError("visitor_id is required", 400, {
      code: "visitor_id_required",
    });
  }
  return { session_id: sessionId.trim(), visitor_id: visitorId.trim() };
}

export function parseBookNowInput(
  body: Record<string, unknown>
): BookNowInput {
  return parseBookNowBody(body);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Process a traveller Book now click for an inventory deal (by slug).
 */
export async function bookDealNow(
  store: DealDraftStore,
  slug: string,
  body: BookNowInput | Record<string, unknown>,
  options: BookNowOptions = {}
): Promise<BookNowOutcome> {
  const input =
    "session_id" in body && typeof (body as BookNowInput).session_id === "string"
      ? parseBookNowBody(body as Record<string, unknown>)
      : parseBookNowBody(body as Record<string, unknown>);

  const now = options.now ?? new Date().toISOString();
  const nowMs = Date.parse(now);
  const config = options.config ?? getPlatformConfig();

  if (!options.skipRateLimit) {
    const rl = enforceBookNowRateLimit({
      clientIp: options.clientIp,
      visitorId: input.visitor_id,
      nowMs,
    });
    if (!rl.ok) {
      throw new DealBookNowError("Too many Book now requests", 429, {
        code: "rate_limited",
        retryAfterSec: rl.retryAfterSec,
      });
    }
  }

  const deal = findDealBySlug(store, slug);
  if (!deal) {
    throw new DealBookNowError("Deal not found", 404, { code: "not_found" });
  }

  const session = store.sessions.get(input.session_id);
  if (!session || session.dealId !== deal.id) {
    throw new DealBookNowError("Session not found for this deal", 400, {
      code: "session_not_found",
    });
  }

  const clickId = crypto.randomUUID();
  let click = createClickEvent(
    store.audit,
    {
      dealId: deal.id,
      clickId,
      dealSessionId: session.id,
      visitorId: input.visitor_id,
      recheckResult: null,
      redirectUrl: null,
    },
    { now }
  );

  const dealSessions = sessionsForDeal(store, deal.id);
  const visible = isVisibleToTravellers(deal, dealSessions, now, config);

  if (!visible) {
    const alternatives = listNearbyAlternatives(store, deal, now, config);
    return {
      outcome: "unavailable",
      click_id: clickId,
      alternatives,
      message: "This deal is no longer available",
    };
  }

  // ---- Integrated (+ optional click recheck) ----
  if (isIntegratedDealType(deal.dealType)) {
    return handleIntegratedBookNow(store, deal, session, click, {
      now,
      config,
      getAvailabilityFn: options.getAvailabilityFn,
    });
  }

  // ---- Manual ----
  return handleManualBookNow(store, deal, session, click, { now, config });
}

type HandleCtx = {
  now: string;
  config: PlatformConfig;
  getAvailabilityFn?: BookNowOptions["getAvailabilityFn"];
};

async function handleIntegratedBookNow(
  store: DealDraftStore,
  deal: Deal,
  session: DealSession,
  click: ClickEvent,
  ctx: HandleCtx
): Promise<BookNowOutcome> {
  const { now, config } = ctx;
  const clickId = click.clickId;

  if (!deal.integrationId || !deal.externalProductId) {
    const alternatives = listNearbyAlternatives(store, deal, now, config);
    return {
      outcome: "unavailable",
      click_id: clickId,
      alternatives,
      message: "Deal is missing provider linkage",
    };
  }

  const integration = store.integrations?.get(deal.integrationId);
  const product = store.externalProducts?.get(deal.externalProductId);
  if (!integration || !product) {
    const alternatives = listNearbyAlternatives(store, deal, now, config);
    return {
      outcome: "unavailable",
      click_id: clickId,
      alternatives,
      message: "Provider data unavailable",
    };
  }

  let extSessionExternalId: string | null = null;
  if (session.externalSessionId) {
    const ext = store.externalSessions?.get(session.externalSessionId);
    extSessionExternalId = ext?.externalId ?? null;
  }

  const shouldRecheck = config.CLICK_RECHECK === true;
  let recheckResult: RecheckResult | null = null;

  if (shouldRecheck) {
    if (!extSessionExternalId) {
      patchClickEvent(store, click, { recheckResult: "error" });
      return {
        outcome: "cannot_confirm",
        click_id: clickId,
        operator: operatorContact(store, deal.operatorId),
        message: CANNOT_CONFIRM_MESSAGE,
      };
    }

    const timeoutMs = config.CLICK_RECHECK_TIMEOUT_MS;
    try {
      const adapter = getAdapter(integration.provider);
      const getAvail =
        ctx.getAvailabilityFn ??
        ((...args: Parameters<typeof adapter.getAvailability>) =>
          adapter.getAvailability(...args));
      const avail = await getAvail(
        integration,
        product.externalId,
        extSessionExternalId,
        { timeoutMs }
      );
      writeClickRecheckSyncLog(store, integration.id, deal.id, now, {
        ok: true,
      });

      const seats = Math.max(0, avail.seats_available ?? 0);
      if (seats > 0) {
        updateSessionFromRecheck(store, deal, session, seats, now, "live");
        recheckResult = "available";
      } else {
        updateSessionFromRecheck(store, deal, session, 0, now, "sold_out");
        maybeFlipDealSoldOut(store, deal.id, now);
        patchClickEvent(store, click, { recheckResult: "sold_out" });
        return {
          outcome: "just_sold_out",
          click_id: clickId,
          alternatives: listNearbyAlternatives(store, deal, now, config),
        };
      }
    } catch (err) {
      const code =
        err instanceof AdapterOperationError ? err.code : "recheck_error";
      const message =
        err instanceof Error ? err.message : "Availability recheck failed";
      writeClickRecheckSyncLog(store, integration.id, deal.id, now, {
        ok: false,
        errorCode: code,
        errorMessage: message,
      });
      recheckResult = "error";

      const cacheOk = isCachedAvailabilityFresh(
        session,
        now,
        config.CACHED_AVAILABILITY_MAX_AGE_MINUTES
      );
      const cachedSeats = session.seatsDisplayed ?? 0;
      if (!(cacheOk && cachedSeats > 0)) {
        patchClickEvent(store, click, { recheckResult: "error" });
        return {
          outcome: "cannot_confirm",
          click_id: clickId,
          operator: operatorContact(store, deal.operatorId),
          message: CANNOT_CONFIRM_MESSAGE,
        };
      }
      // Fresh cache with seats → fall through to redirect
    }
  } else {
    // No recheck: use cached seats (fail closed if none)
    const cachedSeats = session.seatsDisplayed ?? 0;
    if (cachedSeats <= 0 || session.status === "sold_out") {
      patchClickEvent(store, click, { recheckResult: "sold_out" });
      return {
        outcome: "just_sold_out",
        click_id: clickId,
        alternatives: listNearbyAlternatives(store, deal, now, config),
      };
    }
    recheckResult = "available";
  }

  const url = buildDestinationUrl(store, deal, session, clickId, now);
  if (!url) {
    patchClickEvent(store, click, { recheckResult });
    return {
      outcome: "cannot_confirm",
      click_id: clickId,
      operator: operatorContact(store, deal.operatorId),
      message: CANNOT_CONFIRM_MESSAGE,
    };
  }

  patchClickEvent(store, click, {
    recheckResult: recheckResult ?? "available",
    redirectUrl: url,
  });

  return {
    outcome: "redirect",
    click_id: clickId,
    url,
    instructions: deal.bookingInstructions,
  };
}

function isCachedAvailabilityFresh(
  session: DealSession,
  nowIso: string,
  maxAgeMinutes: number
): boolean {
  if (session.lastSyncedAt == null) return false;
  const ageMs = Date.parse(nowIso) - Date.parse(session.lastSyncedAt);
  if (!Number.isFinite(ageMs) || ageMs < 0) return false;
  return ageMs <= maxAgeMinutes * 60_000;
}

function handleManualBookNow(
  store: DealDraftStore,
  deal: Deal,
  session: DealSession,
  click: ClickEvent,
  ctx: { now: string; config: PlatformConfig }
): BookNowOutcome {
  const { now, config } = ctx;
  const clickId = click.clickId;
  const seats = session.seatsDisplayed ?? 0;
  const attestationOk = isAttestationCurrent(deal, now);

  if (!attestationOk || seats <= 0 || session.status === "sold_out") {
    return {
      outcome: "unavailable",
      click_id: clickId,
      alternatives: listNearbyAlternatives(store, deal, now, config),
      message: !attestationOk
        ? "Availability needs reconfirmation"
        : "No seats remaining",
    };
  }

  const url = buildDestinationUrl(store, deal, session, clickId, now);
  patchClickEvent(store, click, {
    recheckResult: null,
    redirectUrl: url,
  });

  return {
    outcome: "show_instructions",
    click_id: clickId,
    booking_instructions: deal.bookingInstructions,
    destination: destinationPayload(deal, url),
    url,
  };
}

export function isDealBookNowError(err: unknown): err is DealBookNowError {
  return err instanceof DealBookNowError;
}
