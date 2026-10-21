/**
 * Booking destination validation and link checker (deals platform Chunk 15).
 *
 * Spec: docs/deals-spec.md §3.1 (booking_*), §4.3 (link_broken), §4.4 (tracked URLs),
 * §4.5 (link checker job every 6 h).
 */

import {
  isHttpsUrl,
  isUrlBookingDestination,
} from "./booking-destination";
import { getPlatformConfig } from "./config";
import type { DealDraftStore } from "./deal-draft";
import type { Deal } from "./deal";
import type { DealPriceOption } from "./deal-session";
import {
  applyAutoPause,
  clearAutoPause,
  DealNotFoundError,
  logDealEvent,
  type DealActor,
  type DealStatusStore,
  type ValidateForPublishFn,
} from "./deal-status";
import type { LinkStatus } from "./enums";

export {
  BOOKING_EMAIL_REGEX,
  E164_PHONE_REGEX,
  URL_BOOKING_DESTINATION_TYPES,
  isE164Phone,
  isHttpsUrl,
  isUrlBookingDestination,
  isValidBookingEmail,
  validateBookingDestinationFields,
} from "./booking-destination";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** UTM source / platform name for tracked booking redirects. */
export const PLATFORM_UTM_SOURCE = "travelscout";

/** Statuses the scheduled link checker visits. */
export const LINK_CHECK_JOB_STATUSES = [
  "live",
  "scheduled",
  "auto_paused",
] as const;

// ---------------------------------------------------------------------------
// checkLink
// ---------------------------------------------------------------------------

export type LinkCheckResult = {
  ok: boolean;
  /** Final HTTP status when obtained; null on network/timeout/abort. */
  status: number | null;
  error: string | null;
};

export type FetchLike = (
  input: string,
  init?: RequestInit
) => Promise<Response>;

export type CheckLinkOptions = {
  timeoutMs?: number;
  fetchFn?: FetchLike;
  /** Test helper: AbortSignal already aborted / custom. */
  signal?: AbortSignal;
};

function isSuccessStatus(status: number): boolean {
  return (status >= 200 && status < 300) || (status >= 300 && status < 400);
}

async function fetchWithMethod(
  fetchFn: FetchLike,
  url: string,
  method: "HEAD" | "GET",
  signal: AbortSignal
): Promise<Response> {
  return fetchFn(url, {
    method,
    redirect: "follow",
    signal,
  });
}

/**
 * Reachability check: HEAD, then GET fallback. Follows redirects.
 * ok when the final status is 2xx or 3xx within LINK_CHECK_TIMEOUT_MS.
 */
export async function checkLink(
  url: string,
  options?: CheckLinkOptions
): Promise<LinkCheckResult> {
  const timeoutMs =
    options?.timeoutMs ?? getPlatformConfig().LINK_CHECK_TIMEOUT_MS;
  const fetchFn = options?.fetchFn ?? fetch;

  if (!isHttpsUrl(url) && !/^http:\/\//i.test(url.trim())) {
    return { ok: false, status: null, error: "invalid URL" };
  }

  const controller = new AbortController();
  const external = options?.signal;
  if (external?.aborted) {
    return { ok: false, status: null, error: "timeout" };
  }
  const onExternalAbort = () => controller.abort();
  external?.addEventListener("abort", onExternalAbort);

  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let response: Response;
    try {
      response = await fetchWithMethod(
        fetchFn,
        url.trim(),
        "HEAD",
        controller.signal
      );
      // Some hosts reject HEAD — fall back to GET.
      if (response.status === 405 || response.status === 501) {
        response = await fetchWithMethod(
          fetchFn,
          url.trim(),
          "GET",
          controller.signal
        );
      }
    } catch (headErr) {
      if (controller.signal.aborted) {
        return { ok: false, status: null, error: "timeout" };
      }
      // Network / HEAD unsupported → GET fallback
      try {
        response = await fetchWithMethod(
          fetchFn,
          url.trim(),
          "GET",
          controller.signal
        );
      } catch (getErr) {
        if (controller.signal.aborted) {
          return { ok: false, status: null, error: "timeout" };
        }
        const msg =
          getErr instanceof Error
            ? getErr.message
            : headErr instanceof Error
              ? headErr.message
              : "request failed";
        return { ok: false, status: null, error: msg };
      }
    }

    const status = response.status;
    if (isSuccessStatus(status)) {
      return { ok: true, status, error: null };
    }
    return {
      ok: false,
      status,
      error: `HTTP ${status}`,
    };
  } finally {
    clearTimeout(timer);
    external?.removeEventListener("abort", onExternalAbort);
  }
}

// ---------------------------------------------------------------------------
// Evidence URL check store (for publish validator — Chunk 16)
// ---------------------------------------------------------------------------

export type EvidenceUrlCheckRecord = {
  priceOptionId: string;
  dealId: string;
  url: string;
  checkedAt: string;
  ok: boolean;
  status: number | null;
  error: string | null;
};

export type LinkCheckStore = DealStatusStore & {
  priceOptions: Map<string, DealPriceOption>;
  /** Keyed by price option id — reachable evidence for publish validation. */
  evidenceUrlChecks: Map<string, EvidenceUrlCheckRecord>;
};

/** DealDraftStore already has deals/audit/priceOptions; add evidence map. */
export type BookingLinkDealStore = DealDraftStore & {
  evidenceUrlChecks?: Map<string, EvidenceUrlCheckRecord>;
};

export function ensureEvidenceUrlChecks(
  store: BookingLinkDealStore
): Map<string, EvidenceUrlCheckRecord> {
  if (!store.evidenceUrlChecks) {
    store.evidenceUrlChecks = new Map();
  }
  return store.evidenceUrlChecks;
}

export function getEvidenceUrlCheck(
  store: BookingLinkDealStore,
  priceOptionId: string
): EvidenceUrlCheckRecord | undefined {
  return store.evidenceUrlChecks?.get(priceOptionId);
}

// ---------------------------------------------------------------------------
// buildTrackedUrl
// ---------------------------------------------------------------------------

/**
 * Append attribution query params. Preserves existing query string.
 * utm_source = platform name, utm_medium = referral, utm_campaign = deal slug,
 * click_id.
 */
export function buildTrackedUrl(
  url: string,
  deal: Pick<Deal, "slug">,
  clickId: string
): string {
  const parsed = new URL(url);
  parsed.searchParams.set("utm_source", PLATFORM_UTM_SOURCE);
  parsed.searchParams.set("utm_medium", "referral");
  parsed.searchParams.set("utm_campaign", deal.slug);
  parsed.searchParams.set("click_id", clickId);
  return parsed.toString();
}

// ---------------------------------------------------------------------------
// runLinkCheck
// ---------------------------------------------------------------------------

export type RunLinkCheckOptions = {
  now?: string;
  actor?: DealActor;
  fetchFn?: FetchLike;
  timeoutMs?: number;
  validateForPublish?: ValidateForPublishFn;
  /** Skip evidence URL checks (job can still run them). Default false. */
  skipEvidenceChecks?: boolean;
};

export type RunLinkCheckResult = {
  deal: Deal;
  bookingCheck: LinkCheckResult | null;
  evidenceChecks: EvidenceUrlCheckRecord[];
  autoPaused: boolean;
  autoResumed: boolean;
};

function asStatusStore(store: BookingLinkDealStore): DealStatusStore {
  return { deals: store.deals, audit: store.audit };
}

/**
 * Check booking_url for URL destinations; update link_* fields.
 * Second consecutive failure on a live deal → applyAutoPause(link_broken).
 * Success while auto_paused(link_broken) → clearAutoPause.
 * Also probes original_price_evidence_url (stored; no auto-pause).
 */
export async function runLinkCheck(
  store: BookingLinkDealStore,
  dealId: string,
  options?: RunLinkCheckOptions
): Promise<RunLinkCheckResult> {
  const existing = store.deals.get(dealId);
  if (!existing) throw new DealNotFoundError(dealId);

  const now = options?.now ?? new Date().toISOString();
  const actor = options?.actor ?? ({ type: "system" } as const);
  const checkOpts: CheckLinkOptions = {
    fetchFn: options?.fetchFn,
    timeoutMs: options?.timeoutMs,
  };

  let deal = existing;
  let bookingCheck: LinkCheckResult | null = null;
  let autoPaused = false;
  let autoResumed = false;

  if (
    isUrlBookingDestination(deal.bookingDestinationType) &&
    deal.bookingUrl
  ) {
    bookingCheck = await checkLink(deal.bookingUrl, checkOpts);

    if (bookingCheck.ok) {
      const wasBroken = deal.linkStatus === "broken";
      const failuresBefore = deal.linkConsecutiveFailures;
      deal = {
        ...deal,
        linkStatus: "ok" as LinkStatus,
        linkLastCheckedAt: now,
        linkConsecutiveFailures: 0,
        updatedAt: now,
      };
      store.deals.set(dealId, deal);

      if (wasBroken || failuresBefore > 0) {
        logDealEvent(
          store.audit,
          dealId,
          "link_ok",
          actor,
          {
            status: bookingCheck.status,
            previous_failures: failuresBefore,
          },
          { now }
        );
      }

      if (
        deal.status === "auto_paused" &&
        deal.pauseReason === "link_broken"
      ) {
        deal = await clearAutoPause(asStatusStore(store), dealId, "link_broken", {
          actor,
          now,
          validateForPublish: options?.validateForPublish,
        });
        autoResumed = true;
      }
    } else {
      const failures = deal.linkConsecutiveFailures + 1;
      const prevStatus = deal.linkStatus;
      deal = {
        ...deal,
        linkStatus: "broken" as LinkStatus,
        linkLastCheckedAt: now,
        linkConsecutiveFailures: failures,
        updatedAt: now,
      };
      store.deals.set(dealId, deal);

      if (prevStatus !== "broken") {
        logDealEvent(
          store.audit,
          dealId,
          "link_broken",
          actor,
          {
            status: bookingCheck.status,
            error: bookingCheck.error,
            consecutive_failures: failures,
          },
          { now }
        );
      } else {
        logDealEvent(
          store.audit,
          dealId,
          "link_broken",
          actor,
          {
            status: bookingCheck.status,
            error: bookingCheck.error,
            consecutive_failures: failures,
            refreshed: true,
          },
          { now }
        );
      }

      // Second consecutive failure on a live deal → auto-pause
      if (failures >= 2 && deal.status === "live") {
        const detail =
          bookingCheck.error ??
          (bookingCheck.status != null
            ? `HTTP ${bookingCheck.status}`
            : "Booking link unreachable");
        deal = applyAutoPause(
          asStatusStore(store),
          dealId,
          "link_broken",
          detail,
          { actor, now }
        );
        autoPaused = true;
        const { notifyBookingLinkBroken } = await import("./notifications");
        await notifyBookingLinkBroken(store, {
          operatorId: deal.operatorId,
          dealId: deal.id,
          detail,
          at: now,
        });
      }
    }
  }

  const evidenceChecks: EvidenceUrlCheckRecord[] = [];
  if (!options?.skipEvidenceChecks) {
    const evidenceMap = ensureEvidenceUrlChecks(store);
    const optionsForDeal = [...store.priceOptions.values()].filter(
      (o) => o.dealId === dealId && o.originalPriceEvidenceUrl
    );
    for (const opt of optionsForDeal) {
      const url = opt.originalPriceEvidenceUrl!;
      const result = await checkLink(url, checkOpts);
      const record: EvidenceUrlCheckRecord = {
        priceOptionId: opt.id,
        dealId,
        url,
        checkedAt: now,
        ok: result.ok,
        status: result.status,
        error: result.error,
      };
      evidenceMap.set(opt.id, record);
      evidenceChecks.push(record);
    }
  }

  return {
    deal: store.deals.get(dealId)!,
    bookingCheck,
    evidenceChecks,
    autoPaused,
    autoResumed,
  };
}

// ---------------------------------------------------------------------------
// test-link API helper
// ---------------------------------------------------------------------------

export type TestDealLinkResult = {
  /** Final URL returned to the operator (tracked when append_tracking_params). */
  url: string;
  check: LinkCheckResult;
  tracked: boolean;
  clickId: string;
};

export type TestDealLinkOptions = RunLinkCheckOptions & {
  clickId?: string;
};

/**
 * Build the tracked booking URL (when enabled) and run a live check.
 * Does not persist consecutive-failure / auto-pause side effects beyond
 * updating link_* via runLinkCheck (so Test link also refreshes status).
 */
export async function testDealLink(
  store: BookingLinkDealStore,
  dealId: string,
  options?: TestDealLinkOptions
): Promise<TestDealLinkResult> {
  const deal = store.deals.get(dealId);
  if (!deal) throw new DealNotFoundError(dealId);

  if (!isUrlBookingDestination(deal.bookingDestinationType)) {
    throw new BookingLinkError(
      "Deal booking destination is not a URL type",
      400
    );
  }
  if (!deal.bookingUrl) {
    throw new BookingLinkError("Deal has no booking_url", 400);
  }
  if (!isHttpsUrl(deal.bookingUrl)) {
    throw new BookingLinkError("booking_url must be an https URL", 400);
  }

  const clickId = options?.clickId ?? crypto.randomUUID();
  const tracked = deal.appendTrackingParams !== false;
  const url = tracked
    ? buildTrackedUrl(deal.bookingUrl, deal, clickId)
    : deal.bookingUrl;

  // Persist link status / auto-pause rules via the same path as the job.
  const run = await runLinkCheck(store, dealId, {
    ...options,
    // Test link focuses on the booking URL; still refresh evidence.
  });

  return {
    url,
    check: run.bookingCheck ?? { ok: false, status: null, error: "no check" },
    tracked,
    clickId,
  };
}

export class BookingLinkError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "BookingLinkError";
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Background job (every 6 hours — invoke from cron / later job runner)
// ---------------------------------------------------------------------------

export function dealEligibleForLinkCheckJob(deal: Deal): boolean {
  if (!isUrlBookingDestination(deal.bookingDestinationType)) return false;
  if (!deal.bookingUrl) return false;

  if (deal.status === "live" || deal.status === "scheduled") return true;
  if (deal.status === "auto_paused" && deal.pauseReason === "link_broken") {
    return true;
  }
  return false;
}

export type LinkCheckerJobResult = {
  checked: number;
  autoPaused: number;
  autoResumed: number;
  results: RunLinkCheckResult[];
};

/**
 * Check all live / scheduled / auto_paused(link_broken) deals with URL
 * destinations. Intended to run every 6 hours.
 */
export async function runLinkCheckerJob(
  store: BookingLinkDealStore,
  options?: RunLinkCheckOptions
): Promise<LinkCheckerJobResult> {
  const results: RunLinkCheckResult[] = [];
  let autoPaused = 0;
  let autoResumed = 0;

  const deals = [...store.deals.values()].filter(dealEligibleForLinkCheckJob);
  for (const d of deals) {
    const r = await runLinkCheck(store, d.id, options);
    results.push(r);
    if (r.autoPaused) autoPaused += 1;
    if (r.autoResumed) autoResumed += 1;
  }

  return {
    checked: results.length,
    autoPaused,
    autoResumed,
    results,
  };
}
