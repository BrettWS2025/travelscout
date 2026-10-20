/**
 * Client-safe deals-list constants and DTO types (Chunk 21/23).
 *
 * Keep this module free of permissions/auth/supabase imports so browser
 * components can import it without pulling next/headers into the client bundle.
 */

import type {
  Category,
  DealStatus,
  DealType,
  PauseReason,
  SourceProvider,
} from "./enums";
import type { SessionStatus } from "./enums";

export const DEAL_LIST_TABS = [
  "live",
  "scheduled",
  "needs_attention",
  "paused",
  "drafts",
  "sold_out",
  "past",
] as const;
export type DealListTab = (typeof DEAL_LIST_TABS)[number];

export function isDealListTab(value: unknown): value is DealListTab {
  return (
    typeof value === "string" &&
    (DEAL_LIST_TABS as readonly string[]).includes(value)
  );
}

export const DEAL_LIST_ROW_ACTIONS = [
  "edit",
  "duplicate",
  "pause",
  "resume",
  "end",
  "preview",
  "view_stats",
  "save_as_template",
  "update_seats",
  "mark_sold_out",
] as const;
export type DealListRowAction = (typeof DEAL_LIST_ROW_ACTIONS)[number];

export const DEAL_LIST_SORTS = [
  "next_session",
  "title",
  "status",
  "created_at",
] as const;
export type DealListSort = (typeof DEAL_LIST_SORTS)[number];

export function isDealListSort(value: unknown): value is DealListSort {
  return (
    typeof value === "string" &&
    (DEAL_LIST_SORTS as readonly string[]).includes(value)
  );
}

export type DealListRow = {
  id: string;
  cover_thumbnail_url: string | null;
  title: string | null;
  deal_type: DealType;
  source_provider: SourceProvider;
  from_rule: boolean;
  next_session_start_at: string | null;
  next_session_start_local: string | null;
  original_price_minor: number | null;
  deal_price_minor: number | null;
  discount_pct: number | null;
  seats_displayed: number | null;
  cutoff_at: string | null;
  status: DealStatus;
  pause_reason: PauseReason | null;
  pause_detail: string | null;
  clicks_today: number;
  allowed_actions: DealListRowAction[];
};

export type DealListBanner = {
  type: "integration_unhealthy" | "attestation_due";
  message: string;
  /** Relative fix path for the operator UI. */
  fix: string;
  integration_id?: string;
  provider?: string;
  count?: number;
};

export type ListOperatorDealsResult = {
  deals: DealListRow[];
  tab_counts: Record<DealListTab, number>;
  banners: DealListBanner[];
  has_any_deals: boolean;
  has_integration: boolean;
  page: number;
  page_size: number;
  total: number;
  tab: DealListTab | null;
};

/** Query shape without server-only permissionUser / integrations. */
export type ListOperatorDealsQueryParams = {
  tab?: DealListTab | null;
  dealType?: DealType | null;
  sourceProvider?: SourceProvider | null;
  externalProductId?: string | null;
  category?: Category | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  search?: string | null;
  sort?: DealListSort | null;
  page?: number | null;
  pageSize?: number | null;
  now?: string;
};

export type DealCalendarSession = {
  session_id: string;
  deal_id: string;
  start_at: string;
  start_at_local: string;
  end_at: string | null;
  seats_displayed: number;
  session_status: SessionStatus;
  deal: {
    id: string;
    title: string | null;
    deal_type: DealType;
    source_provider: SourceProvider;
    status: DealStatus;
    cover_thumbnail_url: string | null;
    deal_price_minor: number | null;
    original_price_minor: number | null;
    discount_pct: number | null;
  };
};

export type DealCalendarDay = {
  date: string;
  sessions: DealCalendarSession[];
};

export type DealCalendarResult = {
  from: string;
  days: DealCalendarDay[];
  timezone: string;
};

export type BulkDealAction = "pause" | "resume" | "end" | "mark_sold_out";
