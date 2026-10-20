/**
 * Pure helpers for the operator deals list UI (Chunk 23).
 * Mirrors tab/action labels from deal-list.ts; countdown is client-side.
 */

import {
  DEAL_LIST_ROW_ACTIONS,
  DEAL_LIST_TABS,
  type DealListBanner,
  type DealListRow,
  type DealListRowAction,
  type DealListTab,
} from "./deal-list";
import type { Category, DealType, PauseReason, SourceProvider } from "./enums";
import { CATEGORIES, DEAL_TYPES, SOURCE_PROVIDERS } from "./enums";
import { formatMinorAsDollars } from "./deal-editor";

export { formatMinorAsDollars };

export const DEAL_LIST_TAB_LABELS: Record<DealListTab, string> = {
  live: "Live",
  scheduled: "Scheduled",
  needs_attention: "Needs attention",
  paused: "Paused",
  drafts: "Drafts",
  sold_out: "Sold out",
  past: "Past",
};

export const DEAL_LIST_ROW_ACTION_LABELS: Record<DealListRowAction, string> = {
  edit: "Edit",
  duplicate: "Duplicate",
  pause: "Pause",
  resume: "Resume",
  end: "End",
  preview: "Preview",
  view_stats: "View stats",
  save_as_template: "Save as template",
  update_seats: "Update seats",
  mark_sold_out: "Mark sold out",
};

export const PAUSE_REASON_LABELS: Record<PauseReason, string> = {
  operator: "Paused by operator",
  admin: "Paused by admin",
  sync_failure: "Provider sync failing",
  session_cancelled: "Session cancelled",
  capacity_zero: "No capacity",
  price_below_threshold: "Price below 50% off",
  attestation_expired: "Seats not reconfirmed",
  link_broken: "Booking link broken",
  cutoff_passed: "Cutoff passed",
  integration_disconnected: "Integration disconnected",
};

export const DEAL_TYPE_LABELS: Record<DealType, string> = {
  integrated_session: "Integrated session",
  integrated_multi_session: "Integrated multi-session",
  manual_session: "Manual session",
  manual_open_window: "Open window",
};

export const SOURCE_PROVIDER_LABELS: Record<SourceProvider, string> = {
  rezdy: "Rezdy",
  fareharbor: "FareHarbor",
  bokun: "Bókun",
  checkfront: "Checkfront",
  manual: "Manual",
};

export type DealsListViewMode = "table" | "calendar";

export type DealsListFilters = {
  tab: DealListTab;
  dealType: DealType | "";
  sourceProvider: SourceProvider | "";
  category: Category | "";
  dateFrom: string;
  dateTo: string;
  search: string;
  page: number;
  pageSize: number;
};

export const DEFAULT_DEALS_LIST_FILTERS: DealsListFilters = {
  tab: "live",
  dealType: "",
  sourceProvider: "",
  category: "",
  dateFrom: "",
  dateTo: "",
  search: "",
  page: 1,
  pageSize: 20,
};

export function buildDealsListQuery(filters: DealsListFilters): string {
  const params = new URLSearchParams();
  params.set("tab", filters.tab);
  if (filters.dealType) params.set("deal_type", filters.dealType);
  if (filters.sourceProvider) {
    params.set("source_provider", filters.sourceProvider);
  }
  if (filters.category) params.set("category", filters.category);
  if (filters.dateFrom) params.set("date_from", filters.dateFrom);
  if (filters.dateTo) params.set("date_to", filters.dateTo);
  if (filters.search.trim()) params.set("search", filters.search.trim());
  params.set("page", String(filters.page));
  params.set("page_size", String(filters.pageSize));
  params.set("sort", "next_session");
  return params.toString();
}

/** Countdown from now to cutoff_at. Tick client-side from the ISO timestamp. */
export function formatCutoffCountdown(
  cutoffAt: string | null | undefined,
  nowMs: number = Date.now()
): string {
  if (cutoffAt == null || cutoffAt === "") return "—";
  const end = Date.parse(cutoffAt);
  if (!Number.isFinite(end)) return "—";
  const remaining = end - nowMs;
  if (remaining <= 0) return "Cutoff passed";

  const totalSec = Math.floor(remaining / 1000);
  const days = Math.floor(totalSec / 86_400);
  const hours = Math.floor((totalSec % 86_400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function pauseTooltip(row: DealListRow): string | null {
  if (row.pause_reason == null && (row.pause_detail == null || row.pause_detail === "")) {
    return null;
  }
  const reason =
    row.pause_reason != null
      ? PAUSE_REASON_LABELS[row.pause_reason] ?? row.pause_reason
      : null;
  if (reason && row.pause_detail) return `${reason}: ${row.pause_detail}`;
  return reason ?? row.pause_detail;
}

export function statusLabel(status: DealListRow["status"]): string {
  return status.replace(/_/g, " ");
}

export function canWriteInventory(role: string | null | undefined): boolean {
  return role === "owner" || role === "manager";
}

export function bannerFixHref(
  banner: DealListBanner,
  operatorId: string
): string {
  if (banner.type === "integration_unhealthy") {
    return `/account/settings?section=integrations&operator=${encodeURIComponent(operatorId)}`;
  }
  if (banner.fix.startsWith("http") || banner.fix.startsWith("/")) {
    return banner.fix;
  }
  return `/account/inventory?tab=needs_attention`;
}

export function filterOptions() {
  return {
    dealTypes: DEAL_TYPES,
    sources: SOURCE_PROVIDERS,
    categories: CATEGORIES,
    tabs: DEAL_LIST_TABS,
    actions: DEAL_LIST_ROW_ACTIONS,
  };
}

export function emptyStateCopy(input: {
  hasAnyDeals: boolean;
  hasIntegration: boolean;
  canWrite: boolean;
}): { title: string; body: string; cta: string | null } {
  if (!input.hasAnyDeals) {
    return {
      title: "Create your first deal",
      body: input.hasIntegration
        ? "List a last-minute deal from your inventory or create a manual deal."
        : "Start with a manual deal, or connect a booking system in Settings to pull live inventory.",
      cta: input.canWrite ? "Create deal" : null,
    };
  }
  return {
    title: "No deals in this tab",
    body: "Try another status tab or clear filters.",
    cta: null,
  };
}
