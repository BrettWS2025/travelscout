/**
 * Metrics rollup and deal stats (deals platform Chunk 45).
 *
 * - Public tracking: impressions (batched card views) + detail_views
 * - Hourly job: aggregate into DealMetricDaily (local calendar day)
 * - Attribution via Integration.conversion_tracking_method + adapter.listBookings
 * - GET deal stats: totals, CTR, per-day series, sessions, DealEvent activity
 *
 * Spec: docs/deals-spec.md §3.7 DealMetricDaily, §4.5 Metrics rollup, §5.3.
 */

import {
  createClickEvent,
  listDealEvents,
  upsertDealMetricDaily,
  type ClickEvent,
  type DealEvent,
  type DealMetricDaily,
} from "./deal-audit";
import type { Deal } from "./deal";
import type { DealDraftStore } from "./deal-draft";
import { DealNotFoundError } from "./deal-status";
import { formatLocalDateTime } from "./deal-list";
import type { DealSession } from "./deal-session";
import {
  isIntegratedDealType,
  type ConversionTrackingMethod,
} from "./enums";
import { getAdapter } from "./providers";
import type { NormalisedBooking } from "./providers/types";
import { localDateKey, startOfLocalDayUtc } from "./timezone";

// ---------------------------------------------------------------------------
// Constants / errors
// ---------------------------------------------------------------------------

/** Job interval hint — hourly. */
export const METRICS_ROLLUP_INTERVAL_MS = 60 * 60 * 1000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_IMPRESSION_BATCH = 100;

export class DealMetricsError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status = 400, code?: string) {
    super(message);
    this.name = "DealMetricsError";
    this.status = status;
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Raw tracking events (pre-rollup)
// ---------------------------------------------------------------------------

export type TrackingEventKind = "impression" | "detail_view";

export type TrackingEvent = {
  id: string;
  dealId: string;
  kind: TrackingEventKind;
  visitorId: string | null;
  createdAt: string;
};

export function ensureTrackingEvents(
  store: DealDraftStore
): Map<string, TrackingEvent> {
  if (!store.trackingEvents) {
    store.trackingEvents = new Map();
  }
  return store.trackingEvents;
}

function resolveDealBySlugOrId(
  store: DealDraftStore,
  ref: string
): Deal | null {
  const trimmed = ref.trim();
  if (!trimmed) return null;
  const byId = store.deals.get(trimmed);
  if (byId) return byId;
  for (const deal of store.deals.values()) {
    if (deal.slug === trimmed) return deal;
  }
  return null;
}

export type RecordImpressionsInput = {
  items: Array<{ deal_id?: string; slug?: string; visitor_id?: string | null }>;
};

export type RecordImpressionsResult = {
  recorded: number;
  skipped: number;
};

/**
 * Public: record deal-card impressions (batched). Unknown ids/slugs are skipped.
 */
export function recordImpressions(
  store: DealDraftStore,
  input: RecordImpressionsInput,
  options?: { now?: string }
): RecordImpressionsResult {
  const items = input.items ?? [];
  if (!Array.isArray(items)) {
    throw new DealMetricsError("items must be an array");
  }
  if (items.length > MAX_IMPRESSION_BATCH) {
    throw new DealMetricsError(
      `At most ${MAX_IMPRESSION_BATCH} impressions per request`
    );
  }

  const now = options?.now ?? new Date().toISOString();
  const events = ensureTrackingEvents(store);
  let recorded = 0;
  let skipped = 0;

  for (const item of items) {
    const ref =
      (typeof item.deal_id === "string" && item.deal_id.trim()) ||
      (typeof item.slug === "string" && item.slug.trim()) ||
      "";
    if (!ref) {
      skipped += 1;
      continue;
    }
    const deal = resolveDealBySlugOrId(store, ref);
    if (!deal) {
      skipped += 1;
      continue;
    }
    const row: TrackingEvent = {
      id: crypto.randomUUID(),
      dealId: deal.id,
      kind: "impression",
      visitorId:
        typeof item.visitor_id === "string" && item.visitor_id.trim()
          ? item.visitor_id.trim()
          : null,
      createdAt: now,
    };
    events.set(row.id, row);
    recorded += 1;
  }

  return { recorded, skipped };
}

export type RecordDetailViewInput = {
  deal_id?: string;
  slug?: string;
  visitor_id?: string | null;
};

/**
 * Public: record a deal detail page open.
 */
export function recordDetailView(
  store: DealDraftStore,
  input: RecordDetailViewInput,
  options?: { now?: string }
): { recorded: true; deal_id: string } {
  const ref =
    (typeof input.deal_id === "string" && input.deal_id.trim()) ||
    (typeof input.slug === "string" && input.slug.trim()) ||
    "";
  if (!ref) {
    throw new DealMetricsError("deal_id or slug is required");
  }
  const deal = resolveDealBySlugOrId(store, ref);
  if (!deal) {
    throw new DealMetricsError("Deal not found", 404, "deal_not_found");
  }

  const now = options?.now ?? new Date().toISOString();
  const events = ensureTrackingEvents(store);
  const row: TrackingEvent = {
    id: crypto.randomUUID(),
    dealId: deal.id,
    kind: "detail_view",
    visitorId:
      typeof input.visitor_id === "string" && input.visitor_id.trim()
        ? input.visitor_id.trim()
        : null,
    createdAt: now,
  };
  events.set(row.id, row);
  return { recorded: true, deal_id: deal.id };
}

/** Test helper: seed a ClickEvent without going through Book now. */
export function seedClickEventForMetrics(
  store: DealDraftStore,
  input: {
    dealId: string;
    clickId?: string;
    dealSessionId?: string | null;
    visitorId?: string | null;
    recheckResult?: ClickEvent["recheckResult"];
    redirectUrl?: string | null;
    createdAt?: string;
  }
): ClickEvent {
  return createClickEvent(
    store.audit,
    {
      dealId: input.dealId,
      clickId: input.clickId ?? crypto.randomUUID(),
      dealSessionId: input.dealSessionId,
      visitorId: input.visitorId,
      recheckResult: input.recheckResult,
      redirectUrl: input.redirectUrl,
    },
    { now: input.createdAt }
  );
}

// ---------------------------------------------------------------------------
// Attribution
// ---------------------------------------------------------------------------

function normalizeCode(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  const t = value.trim().toUpperCase();
  return t.length ? t : null;
}

function bookingMatchesDeal(
  booking: NormalisedBooking,
  deal: Deal,
  method: ConversionTrackingMethod,
  bookingSourceLabel: string | null
): boolean {
  if (method === "none") return false;

  if (method === "promo_code") {
    const dealCode = normalizeCode(deal.promoCode);
    const bookingCode = normalizeCode(booking.promo_code);
    return Boolean(dealCode && bookingCode && dealCode === bookingCode);
  }

  if (method === "booking_source") {
    const label = bookingSourceLabel?.trim();
    if (!label) return false;
    const channel = booking.source_channel?.trim();
    if (!channel) return false;
    return channel.toLowerCase() === label.toLowerCase();
  }

  if (method === "webhook") {
    // Matched against ClickEvent.click_id for this deal in the rollup.
    return Boolean(booking.click_id);
  }

  return false;
}

function productExternalIdForDeal(
  store: DealDraftStore,
  deal: Deal
): string | null {
  if (!deal.externalProductId) return null;
  const product = store.externalProducts?.get(deal.externalProductId);
  return product?.externalId ?? null;
}

export type AttributionDayBucket = {
  attributedBookings: number;
  attributedRevenueMinor: number;
};

/**
 * Attribute provider bookings to a deal for local calendar days in [from, to].
 * Returns map of local date → counts (zeros omitted).
 */
export async function attributeBookingsForDeal(
  store: DealDraftStore,
  deal: Deal,
  fromDate: string,
  toDate: string,
  options?: { now?: string }
): Promise<Map<string, AttributionDayBucket>> {
  const result = new Map<string, AttributionDayBucket>();
  if (!isIntegratedDealType(deal.dealType) || !deal.integrationId) {
    return result;
  }

  const integration = store.integrations?.get(deal.integrationId);
  if (!integration) return result;

  const method = integration.conversionTrackingMethod ?? "none";
  if (method === "none") return result;

  const operator = store.operators.operators.get(deal.operatorId);
  const timeZone = operator?.timezone || "Pacific/Auckland";

  const fromUtc = startOfLocalDayUtc(fromDate, timeZone);
  // Inclusive end of toDate: start of next day minus 1ms via end-of-day window.
  const toNext = addLocalDays(toDate, 1);
  const toUtcExclusive = startOfLocalDayUtc(toNext, timeZone);

  let bookings: NormalisedBooking[] = [];
  try {
    const adapter = getAdapter(integration.provider);
    bookings = await adapter.listBookings(
      integration,
      new Date(fromUtc),
      new Date(Date.parse(toUtcExclusive) - 1)
    );
  } catch {
    // Fail closed on attribution — leave zeros (do not throw the rollup).
    return result;
  }

  const productExt = productExternalIdForDeal(store, deal);
  const clickIdsForDeal = new Set(
    [...store.audit.clicks.values()]
      .filter((c) => c.dealId === deal.id)
      .map((c) => c.clickId)
  );

  for (const booking of bookings) {
    if (productExt && booking.product_external_id) {
      if (booking.product_external_id !== productExt) continue;
    }

    if (method === "webhook") {
      if (!booking.click_id || !clickIdsForDeal.has(booking.click_id)) {
        continue;
      }
    } else if (
      !bookingMatchesDeal(
        booking,
        deal,
        method,
        integration.bookingSourceLabel
      )
    ) {
      continue;
    }

    const day = localDateKey(booking.booked_at, timeZone);
    if (day < fromDate || day > toDate) continue;

    const bucket = result.get(day) ?? {
      attributedBookings: 0,
      attributedRevenueMinor: 0,
    };
    bucket.attributedBookings += 1;
    bucket.attributedRevenueMinor += Math.max(0, booking.total_amount_minor);
    result.set(day, bucket);
  }

  void options;
  return result;
}

function addLocalDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const utc = Date.UTC(y!, m! - 1, d! + days);
  const dt = new Date(utc);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Rollup job
// ---------------------------------------------------------------------------

export type MetricsRollupJobResult = {
  dealsProcessed: number;
  daysUpserted: number;
  dealIds: string[];
};

function eachLocalDateInclusive(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    cur = addLocalDays(cur, 1);
    if (out.length > 400) break; // safety
  }
  return out;
}

function defaultRollupWindow(
  nowIso: string,
  timeZone: string
): { from: string; to: string } {
  const today = localDateKey(nowIso, timeZone);
  // Roll up yesterday + today so late events land; idempotent replace.
  return { from: addLocalDays(today, -1), to: today };
}

/**
 * Hourly idempotent rollup into DealMetricDaily.
 * Counts replace from raw tracking events + ClickEvent + attribution.
 */
export async function runMetricsRollupJob(
  store: DealDraftStore,
  options?: {
    now?: string;
    /** Override local date window (YYYY-MM-DD inclusive). */
    from?: string;
    to?: string;
    dealIds?: string[];
  }
): Promise<MetricsRollupJobResult> {
  const now = options?.now ?? new Date().toISOString();
  const dealIdsFilter = options?.dealIds
    ? new Set(options.dealIds)
    : null;

  const deals = [...store.deals.values()].filter((d) =>
    dealIdsFilter ? dealIdsFilter.has(d.id) : true
  );

  let daysUpserted = 0;
  const touchedDealIds: string[] = [];

  for (const deal of deals) {
    const operator = store.operators.operators.get(deal.operatorId);
    const timeZone = operator?.timezone || "Pacific/Auckland";
    const window = {
      from: options?.from ?? defaultRollupWindow(now, timeZone).from,
      to: options?.to ?? defaultRollupWindow(now, timeZone).to,
    };
    if (!DATE_RE.test(window.from) || !DATE_RE.test(window.to)) {
      throw new DealMetricsError("from/to must be YYYY-MM-DD");
    }
    if (window.from > window.to) {
      throw new DealMetricsError("from must be ≤ to");
    }

    const days = eachLocalDateInclusive(window.from, window.to);
    const tracking = ensureTrackingEvents(store);
    const clicks = [...store.audit.clicks.values()].filter(
      (c) => c.dealId === deal.id
    );

    const attribution = await attributeBookingsForDeal(
      store,
      deal,
      window.from,
      window.to,
      { now }
    );

    let dealTouched = false;
    for (const day of days) {
      let impressions = 0;
      let detailViews = 0;
      for (const ev of tracking.values()) {
        if (ev.dealId !== deal.id) continue;
        if (localDateKey(ev.createdAt, timeZone) !== day) continue;
        if (ev.kind === "impression") impressions += 1;
        else if (ev.kind === "detail_view") detailViews += 1;
      }

      let bookingClicks = 0;
      let soldOutOnClick = 0;
      for (const click of clicks) {
        if (localDateKey(click.createdAt, timeZone) !== day) continue;
        bookingClicks += 1;
        if (click.recheckResult === "sold_out") soldOutOnClick += 1;
      }

      const attr = attribution.get(day) ?? {
        attributedBookings: 0,
        attributedRevenueMinor: 0,
      };

      const hasAny =
        impressions > 0 ||
        detailViews > 0 ||
        bookingClicks > 0 ||
        soldOutOnClick > 0 ||
        attr.attributedBookings > 0 ||
        attr.attributedRevenueMinor > 0;

      // Still upsert zeros when a row already exists so re-runs stay accurate.
      const existing = [...store.audit.metrics.values()].find(
        (m) => m.dealId === deal.id && m.date === day
      );
      if (!hasAny && !existing) continue;

      upsertDealMetricDaily(
        store.audit,
        {
          dealId: deal.id,
          date: day,
          impressions,
          detailViews,
          bookingClicks,
          soldOutOnClick,
          attributedBookings: attr.attributedBookings,
          attributedRevenueMinor: attr.attributedRevenueMinor,
        },
        { now }
      );
      daysUpserted += 1;
      dealTouched = true;
    }

    if (dealTouched) touchedDealIds.push(deal.id);
  }

  return {
    dealsProcessed: touchedDealIds.length,
    daysUpserted,
    dealIds: touchedDealIds,
  };
}

// ---------------------------------------------------------------------------
// Stats API
// ---------------------------------------------------------------------------

export type DealStatsTotals = {
  impressions: number;
  detail_views: number;
  booking_clicks: number;
  sold_out_on_click: number;
  attributed_bookings: number;
  attributed_revenue_minor: number;
  /** booking_clicks / detail_views; 0 when no detail views. */
  ctr: number;
};

export type DealStatsDayRow = {
  date: string;
  impressions: number;
  detail_views: number;
  booking_clicks: number;
  sold_out_on_click: number;
  attributed_bookings: number;
  attributed_revenue_minor: number;
  ctr: number;
};

export type DealStatsSessionRow = {
  id: string;
  start_at: string;
  start_at_local: string;
  end_at: string | null;
  seats_displayed: number;
  last_synced_at: string | null;
  status: DealSession["status"];
};

export type DealStatsActivityRow = {
  id: string;
  event_type: DealEvent["eventType"];
  actor_type: DealEvent["actorType"];
  actor_id: string | null;
  change: string;
  detail: DealEvent["detail"];
  created_at: string;
  created_at_local: string;
};

export type DealStatsResult = {
  deal: {
    id: string;
    title: string | null;
    slug: string;
    status: Deal["status"];
    pause_reason: Deal["pauseReason"];
    pause_detail: Deal["pauseDetail"];
    currency: string | null;
    deal_type: Deal["dealType"];
    source_provider: Deal["sourceProvider"];
  };
  from: string;
  to: string;
  timezone: string;
  totals: DealStatsTotals;
  series: DealStatsDayRow[];
  sessions: DealStatsSessionRow[];
  activity: DealStatsActivityRow[];
};

function ctr(clicks: number, detailViews: number): number {
  if (detailViews <= 0) return 0;
  return Math.round((clicks / detailViews) * 10_000) / 10_000;
}

function describeEvent(event: DealEvent): string {
  const from = event.detail.from_status;
  const to = event.detail.to_status;
  const reason = event.detail.reason ?? event.detail.pause_detail;
  if (from && to) {
    return reason
      ? `${event.eventType}: ${from} → ${to} (${reason})`
      : `${event.eventType}: ${from} → ${to}`;
  }
  if (reason) return `${event.eventType} (${String(reason)})`;
  return event.eventType;
}

function emptyDay(date: string): DealStatsDayRow {
  return {
    date,
    impressions: 0,
    detail_views: 0,
    booking_clicks: 0,
    sold_out_on_click: 0,
    attributed_bookings: 0,
    attributed_revenue_minor: 0,
    ctr: 0,
  };
}

function metricToDayRow(m: DealMetricDaily): DealStatsDayRow {
  return {
    date: m.date,
    impressions: m.impressions,
    detail_views: m.detailViews,
    booking_clicks: m.bookingClicks,
    sold_out_on_click: m.soldOutOnClick,
    attributed_bookings: m.attributedBookings,
    attributed_revenue_minor: m.attributedRevenueMinor,
    ctr: ctr(m.bookingClicks, m.detailViews),
  };
}

/**
 * Operator deal stats for [from, to] local dates (inclusive).
 * Requires inventory.read (enforced by the route).
 */
export function getDealStats(
  store: DealDraftStore,
  dealId: string,
  input: { from: string; to: string }
): DealStatsResult {
  const deal = store.deals.get(dealId);
  if (!deal) throw new DealNotFoundError(dealId);

  if (!DATE_RE.test(input.from) || !DATE_RE.test(input.to)) {
    throw new DealMetricsError("from and to must be YYYY-MM-DD");
  }
  if (input.from > input.to) {
    throw new DealMetricsError("from must be ≤ to");
  }

  const operator = store.operators.operators.get(deal.operatorId);
  const timeZone = operator?.timezone || "Pacific/Auckland";
  const days = eachLocalDateInclusive(input.from, input.to);

  const byDate = new Map<string, DealMetricDaily>();
  for (const m of store.audit.metrics.values()) {
    if (m.dealId !== deal.id) continue;
    if (m.date < input.from || m.date > input.to) continue;
    byDate.set(m.date, m);
  }

  const series = days.map((d) => {
    const m = byDate.get(d);
    return m ? metricToDayRow(m) : emptyDay(d);
  });

  const totalsAcc = {
    impressions: 0,
    detail_views: 0,
    booking_clicks: 0,
    sold_out_on_click: 0,
    attributed_bookings: 0,
    attributed_revenue_minor: 0,
  };
  for (const row of series) {
    totalsAcc.impressions += row.impressions;
    totalsAcc.detail_views += row.detail_views;
    totalsAcc.booking_clicks += row.booking_clicks;
    totalsAcc.sold_out_on_click += row.sold_out_on_click;
    totalsAcc.attributed_bookings += row.attributed_bookings;
    totalsAcc.attributed_revenue_minor += row.attributed_revenue_minor;
  }

  const sessions = [...store.sessions.values()]
    .filter((s) => s.dealId === deal.id)
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
    .map(
      (s): DealStatsSessionRow => ({
        id: s.id,
        start_at: s.startAt,
        start_at_local: formatLocalDateTime(s.startAt, timeZone),
        end_at: s.endAt,
        seats_displayed: s.seatsDisplayed,
        last_synced_at: s.lastSyncedAt,
        status: s.status,
      })
    );

  const activity = listDealEvents(store.audit, deal.id)
    .slice()
    .reverse()
    .map(
      (e): DealStatsActivityRow => ({
        id: e.id,
        event_type: e.eventType,
        actor_type: e.actorType,
        actor_id: e.actorId,
        change: describeEvent(e),
        detail: e.detail,
        created_at: e.createdAt,
        created_at_local: formatLocalDateTime(e.createdAt, timeZone),
      })
    );

  return {
    deal: {
      id: deal.id,
      title: deal.title,
      slug: deal.slug,
      status: deal.status,
      pause_reason: deal.pauseReason,
      pause_detail: deal.pauseDetail,
      currency: deal.currency,
      deal_type: deal.dealType,
      source_provider: deal.sourceProvider,
    },
    from: input.from,
    to: input.to,
    timezone: timeZone,
    totals: {
      ...totalsAcc,
      ctr: ctr(totalsAcc.booking_clicks, totalsAcc.detail_views),
    },
    series,
    sessions,
    activity,
  };
}

/** Default last-7-local-days window for the stats UI. */
export function defaultStatsRange(
  nowIso: string,
  timeZone: string
): { from: string; to: string } {
  const to = localDateKey(nowIso, timeZone);
  return { from: addLocalDays(to, -6), to };
}

/** Parse public track body helpers. */
export function parseImpressionsBody(
  body: unknown
): RecordImpressionsInput {
  if (!body || typeof body !== "object") {
    throw new DealMetricsError("Request body is required");
  }
  const obj = body as Record<string, unknown>;
  const items = obj.items ?? obj.impressions;
  if (!Array.isArray(items)) {
    throw new DealMetricsError("items must be an array");
  }
  return {
    items: items.map((raw) => {
      if (!raw || typeof raw !== "object") return {};
      const r = raw as Record<string, unknown>;
      return {
        deal_id: typeof r.deal_id === "string" ? r.deal_id : undefined,
        slug: typeof r.slug === "string" ? r.slug : undefined,
        visitor_id:
          typeof r.visitor_id === "string" ? r.visitor_id : null,
      };
    }),
  };
}

export function parseDetailViewBody(body: unknown): RecordDetailViewInput {
  if (!body || typeof body !== "object") return {};
  const obj = body as Record<string, unknown>;
  return {
    deal_id: typeof obj.deal_id === "string" ? obj.deal_id : undefined,
    slug: typeof obj.slug === "string" ? obj.slug : undefined,
    visitor_id:
      typeof obj.visitor_id === "string" ? obj.visitor_id : null,
  };
}
