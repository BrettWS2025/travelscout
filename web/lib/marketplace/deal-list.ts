/**
 * Operator deals list API (deals platform Chunk 21).
 *
 * Tabs, filters, search, pagination, row actions, tab_counts, banners,
 * empty-state flags, and 3-day calendar. Spec: docs/deals-spec.md §5.1.
 */

import { getPlatformConfig } from "./config";
import type { ClickEvent } from "./deal-audit";
import type { Deal } from "./deal";
import type { DealDraftStore } from "./deal-draft";
import { getDealCoverImage } from "./deal-media";
import type { DealPriceOption, DealSession } from "./deal-session";
import { lowestCurrentPriceOption } from "./deal-stepped-discounts";
import type { Integration } from "./integration";
import {
  isCategory,
  isDealType,
  isManualDealType,
  isSourceProvider,
  type DealStatus,
  type DealType,
  type SourceProvider,
  type UserRole,
} from "./enums";
import { can, type PermissionUser } from "./permissions";
import {
  getZonedParts,
  localDateKey,
  startOfLocalDayUtc,
  zonedLocalToUtcIso,
} from "./timezone";
import {
  DEAL_LIST_ROW_ACTIONS,
  DEAL_LIST_SORTS,
  DEAL_LIST_TABS,
  isDealListSort,
  isDealListTab,
  type DealCalendarDay,
  type DealCalendarResult,
  type DealCalendarSession,
  type DealListBanner,
  type DealListRow,
  type DealListRowAction,
  type DealListSort,
  type DealListTab,
  type ListOperatorDealsQueryParams,
  type ListOperatorDealsResult,
} from "./deal-list-shared";

// Re-export client-safe constants/types for server + existing imports.
export {
  DEAL_LIST_ROW_ACTIONS,
  DEAL_LIST_SORTS,
  DEAL_LIST_TABS,
  isDealListSort,
  isDealListTab,
};
export type {
  DealCalendarDay,
  DealCalendarResult,
  DealCalendarSession,
  DealListBanner,
  DealListRow,
  DealListRowAction,
  DealListSort,
  DealListTab,
  ListOperatorDealsResult,
};

const PAST_STATUSES: ReadonlySet<DealStatus> = new Set([
  "expired",
  "ended",
  "archived",
]);

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class DealListError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "DealListError";
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function operatorTimezone(store: DealDraftStore, operatorId: string): string {
  const op = store.operators.operators.get(operatorId);
  return op?.timezone ?? getPlatformConfig().DEFAULT_TIMEZONE;
}

function providerDisplayName(provider: string): string {
  switch (provider) {
    case "rezdy":
      return "Rezdy";
    case "fareharbor":
      return "FareHarbor";
    case "bokun":
      return "Bókun";
    case "checkfront":
      return "Checkfront";
    default:
      return provider.charAt(0).toUpperCase() + provider.slice(1);
  }
}

/** Format wall-clock in operator TZ as "YYYY-MM-DD HH:MM". */
export function formatLocalDateTime(
  isoOrDate: string | Date,
  timeZone: string
): string {
  const p = getZonedParts(isoOrDate, timeZone);
  return `${String(p.year).padStart(4, "0")}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")} ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

function sessionsForDeal(
  store: DealDraftStore,
  dealId: string
): DealSession[] {
  return [...store.sessions.values()].filter((s) => s.dealId === dealId);
}

function priceOptionsForDeal(
  store: DealDraftStore,
  dealId: string
): DealPriceOption[] {
  return [...store.priceOptions.values()].filter((p) => p.dealId === dealId);
}

/**
 * Next upcoming session: soonest start_at >= now among non-cancelled/expired.
 * Falls back to soonest overall if none are upcoming.
 */
export function nextSessionForDeal(
  sessions: DealSession[],
  nowIso: string
): DealSession | null {
  if (sessions.length === 0) return null;
  const nowMs = Date.parse(nowIso);
  const active = sessions.filter(
    (s) => s.status !== "cancelled" && s.status !== "expired"
  );
  const pool = active.length > 0 ? active : sessions;
  const upcoming = pool
    .filter((s) => Date.parse(s.startAt) >= nowMs)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  if (upcoming.length > 0) return upcoming[0]!;
  return [...pool].sort((a, b) => a.startAt.localeCompare(b.startAt))[0] ?? null;
}

/** Lowest deal_price_minor option (ties → lowest original, then sort_order). */
export function lowestPriceOption(
  options: DealPriceOption[]
): DealPriceOption | null {
  if (options.length === 0) return null;
  return [...options].sort((a, b) => {
    if (a.dealPriceMinor !== b.dealPriceMinor) {
      return a.dealPriceMinor - b.dealPriceMinor;
    }
    if (a.originalPriceMinor !== b.originalPriceMinor) {
      return a.originalPriceMinor - b.originalPriceMinor;
    }
    return a.sortOrder - b.sortOrder;
  })[0]!;
}

export function cutoffAtForSession(
  session: DealSession,
  salesCutoffMinutes: number | null | undefined
): string | null {
  const mins =
    salesCutoffMinutes == null || !Number.isFinite(salesCutoffMinutes)
      ? 0
      : Math.max(0, Math.floor(salesCutoffMinutes));
  const startMs = Date.parse(session.startAt);
  if (!Number.isFinite(startMs)) return null;
  return new Date(startMs - mins * 60_000).toISOString();
}

/**
 * Manual live deal whose attestation expires within ATTESTATION_REMINDER_HOURS
 * (default 2 h). Also true when already expired but still live (edge).
 */
export function isAttestationDueSoon(
  deal: Deal,
  nowIso: string,
  reminderHours = getPlatformConfig().ATTESTATION_REMINDER_HOURS
): boolean {
  if (!isManualDealType(deal.dealType)) return false;
  if (deal.status !== "live") return false;
  if (deal.attestationExpiresAt == null) return true;
  const expiresMs = Date.parse(deal.attestationExpiresAt);
  if (!Number.isFinite(expiresMs)) return true;
  const nowMs = Date.parse(nowIso);
  const windowMs = reminderHours * 60 * 60 * 1000;
  return expiresMs - nowMs <= windowMs;
}

export function dealMatchesTab(
  deal: Deal,
  tab: DealListTab,
  nowIso: string
): boolean {
  switch (tab) {
    case "live":
      return deal.status === "live";
    case "scheduled":
      return deal.status === "scheduled";
    case "needs_attention":
      return (
        deal.status === "auto_paused" ||
        deal.status === "pending_review" ||
        isAttestationDueSoon(deal, nowIso)
      );
    case "paused":
      return deal.status === "paused";
    case "drafts":
      return deal.status === "draft";
    case "sold_out":
      return deal.status === "sold_out";
    case "past":
      return PAST_STATUSES.has(deal.status);
    default:
      return false;
  }
}

export function computeTabCounts(
  deals: Deal[],
  nowIso: string
): Record<DealListTab, number> {
  const counts: Record<DealListTab, number> = {
    live: 0,
    scheduled: 0,
    needs_attention: 0,
    paused: 0,
    drafts: 0,
    sold_out: 0,
    past: 0,
  };
  for (const deal of deals) {
    for (const tab of DEAL_LIST_TABS) {
      if (dealMatchesTab(deal, tab, nowIso)) counts[tab] += 1;
    }
  }
  return counts;
}

/** Row actions allowed for this user + deal status. */
export function allowedRowActions(
  deal: Deal,
  permissionUser: PermissionUser,
  operatorId: string
): DealListRowAction[] {
  const actions: DealListRowAction[] = [];
  const canRead = can(permissionUser, operatorId, "inventory.read");
  const canWrite = can(permissionUser, operatorId, "inventory.write");

  if (canRead) {
    actions.push("preview", "view_stats");
  }
  if (!canWrite) return actions;

  actions.push("edit", "duplicate", "save_as_template");

  if (deal.status === "live" || deal.status === "scheduled") {
    actions.push("pause");
  }
  if (deal.status === "paused" || deal.status === "auto_paused") {
    actions.push("resume");
  }
  if (deal.status !== "ended" && deal.status !== "archived") {
    actions.push("end");
  }
  if (isManualDealType(deal.dealType)) {
    if (
      deal.status === "live" ||
      deal.status === "scheduled" ||
      deal.status === "paused" ||
      deal.status === "auto_paused" ||
      deal.status === "sold_out"
    ) {
      actions.push("update_seats");
    }
    if (
      deal.status === "live" ||
      deal.status === "scheduled" ||
      deal.status === "paused" ||
      deal.status === "auto_paused"
    ) {
      actions.push("mark_sold_out");
    }
  }

  return actions;
}

function clicksTodayForDeal(
  clicks: Iterable<ClickEvent>,
  dealId: string,
  nowIso: string,
  timeZone: string
): number {
  const todayKey = localDateKey(nowIso, timeZone);
  let count = 0;
  for (const click of clicks) {
    if (click.dealId !== dealId) continue;
    if (localDateKey(click.createdAt, timeZone) === todayKey) count += 1;
  }
  return count;
}

function coverThumbnailUrl(
  store: DealDraftStore,
  dealId: string
): string | null {
  const cover = getDealCoverImage(store.media, dealId);
  return cover?.url ?? null;
}

function integrationsForOperator(
  store: DealDraftStore,
  operatorId: string,
  override?: Integration[]
): Integration[] {
  if (override) {
    return override.filter((i) => i.operatorId === operatorId);
  }
  if (!store.integrations) return [];
  return [...store.integrations.values()].filter(
    (i) => i.operatorId === operatorId
  );
}

function isIntegrationUnhealthy(
  integration: Integration,
  nowIso: string
): boolean {
  if (
    integration.status === "error" ||
    integration.status === "disconnected"
  ) {
    return true;
  }
  if (
    integration.status === "connected" ||
    integration.status === "degraded"
  ) {
    const { SYNC_STALE_MINUTES } = getPlatformConfig();
    const lastOk = integration.lastSuccessfulSyncAt;
    if (lastOk == null) return true;
    const ageMs = Date.parse(nowIso) - Date.parse(lastOk);
    return ageMs > SYNC_STALE_MINUTES * 60_000;
  }
  return false;
}

function failingSinceIso(integration: Integration): string | null {
  return (
    integration.lastSuccessfulSyncAt ??
    integration.lastSyncAt ??
    integration.connectedAt ??
    integration.updatedAt
  );
}

function hiddenDealCountForIntegration(
  deals: Deal[],
  integrationId: string
): number {
  return deals.filter(
    (d) =>
      d.integrationId === integrationId &&
      (d.status === "auto_paused" ||
        d.pauseReason === "sync_failure" ||
        d.pauseReason === "integration_disconnected")
  ).length;
}

// ---------------------------------------------------------------------------
// List query
// ---------------------------------------------------------------------------

export type ListOperatorDealsQuery = ListOperatorDealsQueryParams & {
  /** Role used when building PermissionUser is preferred; pass permissionUser. */
  permissionUser: PermissionUser;
  /** Optional integrations override (tests / HTTP seed). */
  integrations?: Integration[];
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export function parseListOperatorDealsQuery(
  searchParams: URLSearchParams
): Omit<ListOperatorDealsQuery, "permissionUser"> {
  const tabRaw = searchParams.get("tab");
  const tab =
    tabRaw == null || tabRaw === ""
      ? null
      : isDealListTab(tabRaw)
        ? tabRaw
        : (() => {
            throw new DealListError(
              `tab must be one of: ${DEAL_LIST_TABS.join(", ")}`
            );
          })();

  const dealTypeRaw = searchParams.get("deal_type") ?? searchParams.get("dealType");
  const dealType =
    dealTypeRaw == null || dealTypeRaw === ""
      ? null
      : isDealType(dealTypeRaw)
        ? dealTypeRaw
        : (() => {
            throw new DealListError("deal_type is invalid.");
          })();

  const sourceRaw =
    searchParams.get("source_provider") ?? searchParams.get("sourceProvider");
  const sourceProvider =
    sourceRaw == null || sourceRaw === ""
      ? null
      : isSourceProvider(sourceRaw)
        ? sourceRaw
        : (() => {
            throw new DealListError("source_provider is invalid.");
          })();

  const categoryRaw = searchParams.get("category");
  const category =
    categoryRaw == null || categoryRaw === ""
      ? null
      : isCategory(categoryRaw)
        ? categoryRaw
        : (() => {
            throw new DealListError("category is invalid.");
          })();

  const sortRaw = searchParams.get("sort");
  const sort =
    sortRaw == null || sortRaw === ""
      ? "next_session"
      : isDealListSort(sortRaw)
        ? sortRaw
        : (() => {
            throw new DealListError(
              `sort must be one of: ${DEAL_LIST_SORTS.join(", ")}`
            );
          })();

  const pageRaw = searchParams.get("page");
  const page =
    pageRaw == null || pageRaw === ""
      ? 1
      : Math.max(1, Number.parseInt(pageRaw, 10) || 1);

  const pageSizeRaw =
    searchParams.get("page_size") ?? searchParams.get("pageSize");
  let pageSize =
    pageSizeRaw == null || pageSizeRaw === ""
      ? DEFAULT_PAGE_SIZE
      : Number.parseInt(pageSizeRaw, 10) || DEFAULT_PAGE_SIZE;
  pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, pageSize));

  return {
    tab,
    dealType,
    sourceProvider,
    externalProductId:
      searchParams.get("external_product_id") ??
      searchParams.get("externalProductId"),
    category,
    dateFrom: searchParams.get("date_from") ?? searchParams.get("dateFrom"),
    dateTo: searchParams.get("date_to") ?? searchParams.get("dateTo"),
    search: searchParams.get("search") ?? searchParams.get("q"),
    sort,
    page,
    pageSize,
  };
}

export function listOperatorDeals(
  store: DealDraftStore,
  operatorId: string,
  query: ListOperatorDealsQuery
): ListOperatorDealsResult {
  const now = query.now ?? new Date().toISOString();
  const timeZone = operatorTimezone(store, operatorId);
  const operatorDeals = [...store.deals.values()].filter(
    (d) => d.operatorId === operatorId
  );

  const tabCounts = computeTabCounts(operatorDeals, now);

  let filtered = operatorDeals;
  if (query.tab) {
    filtered = filtered.filter((d) => dealMatchesTab(d, query.tab!, now));
  }
  if (query.dealType) {
    filtered = filtered.filter((d) => d.dealType === query.dealType);
  }
  if (query.sourceProvider) {
    filtered = filtered.filter((d) => d.sourceProvider === query.sourceProvider);
  }
  if (query.externalProductId) {
    filtered = filtered.filter(
      (d) => d.externalProductId === query.externalProductId
    );
  }
  if (query.category) {
    filtered = filtered.filter((d) => d.category === query.category);
  }
  if (query.search && query.search.trim() !== "") {
    const needle = query.search.trim().toLowerCase();
    filtered = filtered.filter((d) =>
      (d.title ?? "").toLowerCase().includes(needle)
    );
  }

  const dateFromMs =
    query.dateFrom != null && query.dateFrom !== ""
      ? Date.parse(query.dateFrom)
      : null;
  const dateToMs =
    query.dateTo != null && query.dateTo !== ""
      ? Date.parse(query.dateTo)
      : null;
  if (
    (dateFromMs != null && !Number.isFinite(dateFromMs)) ||
    (dateToMs != null && !Number.isFinite(dateToMs))
  ) {
    throw new DealListError("date_from / date_to must be valid ISO datetimes.");
  }

  type Enriched = {
    deal: Deal;
    next: DealSession | null;
    lowest: DealPriceOption | null;
    currentDealPriceMinor: number | null;
    currentDiscountPct: number | null;
  };

  let enriched: Enriched[] = filtered.map((deal) => {
    const sessions = sessionsForDeal(store, deal.id);
    const next = nextSessionForDeal(sessions, now);
    const options = priceOptionsForDeal(store, deal.id);
    const steps = [...store.discountSteps.values()].filter(
      (s) => s.dealId === deal.id
    );
    const { option: lowest, current } = lowestCurrentPriceOption(
      options,
      next,
      now,
      steps,
      deal
    );
    return {
      deal,
      next,
      lowest,
      currentDealPriceMinor: current?.dealPriceMinor ?? lowest?.dealPriceMinor ?? null,
      currentDiscountPct:
        current?.discountPct ?? lowest?.discountPct ?? null,
    };
  });

  if (dateFromMs != null || dateToMs != null) {
    enriched = enriched.filter(({ next }) => {
      if (!next) return false;
      const startMs = Date.parse(next.startAt);
      if (dateFromMs != null && startMs < dateFromMs) return false;
      if (dateToMs != null && startMs > dateToMs) return false;
      return true;
    });
  }

  const sort: DealListSort = query.sort ?? "next_session";
  enriched.sort((a, b) => {
    if (sort === "title") {
      return (a.deal.title ?? "").localeCompare(b.deal.title ?? "");
    }
    if (sort === "status") {
      return a.deal.status.localeCompare(b.deal.status);
    }
    if (sort === "created_at") {
      return b.deal.createdAt.localeCompare(a.deal.createdAt);
    }
    // next_session (default): soonest first; nulls last
    const aStart = a.next?.startAt ?? null;
    const bStart = b.next?.startAt ?? null;
    if (aStart == null && bStart == null) {
      return a.deal.createdAt.localeCompare(b.deal.createdAt);
    }
    if (aStart == null) return 1;
    if (bStart == null) return -1;
    return aStart.localeCompare(bStart);
  });

  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE)
  );
  const total = enriched.length;
  const start = (page - 1) * pageSize;
  const pageRows = enriched.slice(start, start + pageSize);

  const deals: DealListRow[] = pageRows.map(
    ({ deal, next, lowest, currentDealPriceMinor, currentDiscountPct }) => ({
    id: deal.id,
    cover_thumbnail_url: coverThumbnailUrl(store, deal.id),
    title: deal.title,
    deal_type: deal.dealType,
    source_provider: deal.sourceProvider,
    from_rule: deal.dealRuleId != null,
    next_session_start_at: next?.startAt ?? null,
    next_session_start_local: next
      ? formatLocalDateTime(next.startAt, timeZone)
      : null,
    original_price_minor: lowest?.originalPriceMinor ?? null,
    deal_price_minor: currentDealPriceMinor,
    discount_pct: currentDiscountPct,
    seats_displayed: next?.seatsDisplayed ?? null,
    cutoff_at: next
      ? cutoffAtForSession(next, deal.salesCutoffMinutes)
      : null,
    status: deal.status,
    pause_reason: deal.pauseReason,
    pause_detail: deal.pauseDetail,
    clicks_today: clicksTodayForDeal(
      store.audit.clicks.values(),
      deal.id,
      now,
      timeZone
    ),
    allowed_actions: allowedRowActions(
      deal,
      query.permissionUser,
      operatorId
    ),
  })
  );

  const integrations = integrationsForOperator(
    store,
    operatorId,
    query.integrations
  );
  const banners = buildListBanners({
    deals: operatorDeals,
    integrations,
    now,
    timeZone,
  });

  return {
    deals,
    tab_counts: tabCounts,
    banners,
    has_any_deals: operatorDeals.length > 0,
    // Any integration row (including not_connected) — empty state prompts connect if false.
    has_integration: integrations.length > 0,
    page,
    page_size: pageSize,
    total,
    tab: query.tab ?? null,
  };
}

export function buildListBanners(input: {
  deals: Deal[];
  integrations: Integration[];
  now: string;
  timeZone: string;
}): DealListBanner[] {
  const banners: DealListBanner[] = [];

  for (const integration of input.integrations) {
    if (!isIntegrationUnhealthy(integration, input.now)) continue;
    const sinceIso = failingSinceIso(integration);
    const sinceLocal = sinceIso
      ? formatLocalDateTime(sinceIso, input.timeZone)
      : "unknown";
    const n = hiddenDealCountForIntegration(input.deals, integration.id);
    const name = providerDisplayName(integration.provider);
    banners.push({
      type: "integration_unhealthy",
      message: `${name} sync failing since ${sinceLocal}; ${n} deals hidden`,
      fix: `/operator/settings/integrations/${integration.provider}`,
      integration_id: integration.id,
      provider: integration.provider,
      count: n,
    });
  }

  const attestationDue = input.deals.filter((d) =>
    isAttestationDueSoon(d, input.now)
  ).length;
  if (attestationDue > 0) {
    banners.push({
      type: "attestation_due",
      message: `${attestationDue} deal${attestationDue === 1 ? "" : "s"} need reconfirming`,
      fix: "reattest",
      count: attestationDue,
    });
  }

  return banners;
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

export type GetDealCalendarQuery = {
  /** Local YYYY-MM-DD (operator TZ). Defaults to today. */
  from?: string | null;
  now?: string;
};

/**
 * 3 local days of sessions (from, from+1, from+2) with deal summary per session.
 */
export function getOperatorDealsCalendar(
  store: DealDraftStore,
  operatorId: string,
  query?: GetDealCalendarQuery
): DealCalendarResult {
  const now = query?.now ?? new Date().toISOString();
  const timeZone = operatorTimezone(store, operatorId);

  let fromDate = query?.from?.trim() || null;
  if (fromDate == null || fromDate === "") {
    fromDate = localDateKey(now, timeZone);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
    throw new DealListError("from must be a local date YYYY-MM-DD.");
  }

  // Local calendar days from `from` via UTC Y-M-D arithmetic (no TZ shift).
  const dayKeys: string[] = [];
  {
    const [y0, m0, d0] = fromDate.split("-").map(Number) as [
      number,
      number,
      number,
    ];
    for (let i = 0; i < 3; i++) {
      const dt = new Date(Date.UTC(y0, m0 - 1, d0 + i));
      const y = dt.getUTCFullYear();
      const m = dt.getUTCMonth() + 1;
      const d = dt.getUTCDate();
      dayKeys.push(
        `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
      );
    }
  }

  const rangeStartUtc = startOfLocalDayUtc(dayKeys[0]!, timeZone);
  const rangeEndUtc = zonedLocalToUtcIso(dayKeys[2]!, "23:59:59", timeZone);
  const rangeStartMs = Date.parse(rangeStartUtc);
  const rangeEndMs = Date.parse(rangeEndUtc);

  const operatorDealIds = new Set(
    [...store.deals.values()]
      .filter((d) => d.operatorId === operatorId)
      .map((d) => d.id)
  );

  const byDay = new Map<string, DealCalendarSession[]>();
  for (const key of dayKeys) byDay.set(key, []);

  for (const session of store.sessions.values()) {
    if (!operatorDealIds.has(session.dealId)) continue;
    const startMs = Date.parse(session.startAt);
    if (!Number.isFinite(startMs)) continue;
    if (startMs < rangeStartMs || startMs > rangeEndMs) continue;

    const dayKey = localDateKey(session.startAt, timeZone);
    if (!byDay.has(dayKey)) continue;

    const deal = store.deals.get(session.dealId);
    if (!deal) continue;
    const options = priceOptionsForDeal(store, deal.id);
    const steps = [...store.discountSteps.values()].filter(
      (s) => s.dealId === deal.id
    );
    const { option: lowest, current } = lowestCurrentPriceOption(
      options,
      session,
      now,
      steps,
      deal
    );

    byDay.get(dayKey)!.push({
      session_id: session.id,
      deal_id: deal.id,
      start_at: session.startAt,
      start_at_local: formatLocalDateTime(session.startAt, timeZone),
      end_at: session.endAt,
      seats_displayed: session.seatsDisplayed,
      session_status: session.status,
      deal: {
        id: deal.id,
        title: deal.title,
        deal_type: deal.dealType,
        source_provider: deal.sourceProvider,
        status: deal.status,
        cover_thumbnail_url: coverThumbnailUrl(store, deal.id),
        deal_price_minor:
          current?.dealPriceMinor ?? lowest?.dealPriceMinor ?? null,
        original_price_minor: lowest?.originalPriceMinor ?? null,
        discount_pct: current?.discountPct ?? lowest?.discountPct ?? null,
      },
    });
  }

  const days: DealCalendarDay[] = dayKeys.map((date) => {
    const sessions = byDay.get(date) ?? [];
    sessions.sort((a, b) => a.start_at.localeCompare(b.start_at));
    return { date, sessions };
  });

  return { from: fromDate, days, timezone: timeZone };
}

/** Build a PermissionUser with a single operator role (route / test helper). */
export function permissionUserForList(
  userId: string,
  operatorId: string,
  role: UserRole | null,
  isPlatformAdmin = false
): PermissionUser {
  return {
    id: userId,
    isPlatformAdmin,
    operatorRoles: role != null ? { [operatorId]: role } : {},
  };
}
