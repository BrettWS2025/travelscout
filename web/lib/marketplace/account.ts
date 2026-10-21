/**
 * Account settings (deals platform Chunk 42).
 *
 * - POST /operators/:id/export → CSV download payloads for deals,
 *   DealMetricDaily, DealEvent
 * - POST /operators/:id/close {confirm_text} (owner) → end live/scheduled
 *   deals, disconnect integrations (delete secrets), account_status suspended
 *
 * Login email/password change stays on existing Supabase auth
 * (`/account/details`). SSO / 2FA: see TODO in docs/deals-spec.md §6.8.
 *
 * Keep free of server-only imports (auth, permissions, next/headers) so
 * account-ui can import confirm helpers safely. closeOperatorAccount is
 * async because disconnect deletes secrets.
 */

import { endDeal } from "./deal-actions";
import type { Deal } from "./deal";
import type { DealDraftStore } from "./deal-draft";
import {
  listDealEvents,
  type DealEvent,
  type DealMetricDaily,
} from "./deal-audit";
import { disconnectIntegration } from "./integration-connect";
import type { DealActor } from "./deal-status";
import type { AccountStatus } from "./enums";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class AccountError extends Error {
  readonly status: number;
  readonly errors?: Array<{ field: string; message: string }>;
  readonly code?: string;

  constructor(
    message: string,
    status = 400,
    extras?: {
      errors?: Array<{ field: string; message: string }>;
      code?: string;
    }
  ) {
    super(message);
    this.name = "AccountError";
    this.status = status;
    this.errors = extras?.errors;
    this.code = extras?.code;
  }
}

/** Required confirmation text for close — must match operator trading_name. */
export function closeConfirmTextForOperator(tradingName: string): string {
  return tradingName.trim();
}

export function isCloseConfirmValid(
  tradingName: string,
  confirmText: unknown
): boolean {
  if (typeof confirmText !== "string") return false;
  return confirmText.trim() === closeConfirmTextForOperator(tradingName);
}

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

function csvEscape(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(
  headers: string[],
  rows: Array<Array<unknown>>
): string {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(","));
  }
  return lines.join("\n") + "\n";
}

function dealsForOperator(
  store: DealDraftStore,
  operatorId: string
): Deal[] {
  return [...store.deals.values()]
    .filter((d) => d.operatorId === operatorId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function buildDealsCsv(
  store: DealDraftStore,
  operatorId: string
): string {
  const deals = dealsForOperator(store, operatorId);
  return toCsv(
    [
      "id",
      "title",
      "slug",
      "deal_type",
      "source_provider",
      "status",
      "pause_reason",
      "category",
      "region",
      "currency",
      "published_at",
      "ended_at",
      "created_at",
      "updated_at",
    ],
    deals.map((d) => [
      d.id,
      d.title,
      d.slug,
      d.dealType,
      d.sourceProvider,
      d.status,
      d.pauseReason,
      d.category,
      d.region,
      d.currency,
      d.publishedAt,
      d.endedAt,
      d.createdAt,
      d.updatedAt,
    ])
  );
}

export function buildMetricsCsv(
  store: DealDraftStore,
  operatorId: string
): string {
  const dealIds = new Set(dealsForOperator(store, operatorId).map((d) => d.id));
  const metrics: DealMetricDaily[] = [...store.audit.metrics.values()]
    .filter((m) => dealIds.has(m.dealId))
    .sort((a, b) =>
      a.date === b.date
        ? a.dealId.localeCompare(b.dealId)
        : a.date.localeCompare(b.date)
    );
  return toCsv(
    [
      "id",
      "deal_id",
      "date",
      "impressions",
      "detail_views",
      "booking_clicks",
      "sold_out_on_click",
      "attributed_bookings",
      "attributed_revenue_minor",
      "created_at",
      "updated_at",
    ],
    metrics.map((m) => [
      m.id,
      m.dealId,
      m.date,
      m.impressions,
      m.detailViews,
      m.bookingClicks,
      m.soldOutOnClick,
      m.attributedBookings,
      m.attributedRevenueMinor,
      m.createdAt,
      m.updatedAt,
    ])
  );
}

export function buildEventsCsv(
  store: DealDraftStore,
  operatorId: string
): string {
  const deals = dealsForOperator(store, operatorId);
  const events: Array<DealEvent & { deal_title: string | null }> = [];
  for (const deal of deals) {
    for (const ev of listDealEvents(store.audit, deal.id)) {
      events.push({ ...ev, deal_title: deal.title });
    }
  }
  events.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return toCsv(
    [
      "id",
      "deal_id",
      "deal_title",
      "event_type",
      "actor_type",
      "actor_id",
      "detail_json",
      "created_at",
    ],
    events.map((e) => [
      e.id,
      e.dealId,
      e.deal_title,
      e.eventType,
      e.actorType,
      e.actorId,
      JSON.stringify(e.detail ?? {}),
      e.createdAt,
    ])
  );
}

export type OperatorExportResult = {
  files: Array<{ filename: string; content: string; content_type: string }>;
  generated_at: string;
  deal_count: number;
};

export function exportOperatorData(
  store: DealDraftStore,
  operatorId: string,
  options?: { now?: string }
): OperatorExportResult {
  const op = store.operators.operators.get(operatorId);
  if (!op) {
    throw new AccountError("Operator not found", 404);
  }
  const now = options?.now ?? new Date().toISOString();
  const deals = dealsForOperator(store, operatorId);
  return {
    generated_at: now,
    deal_count: deals.length,
    files: [
      {
        filename: "deals.csv",
        content: buildDealsCsv(store, operatorId),
        content_type: "text/csv; charset=utf-8",
      },
      {
        filename: "deal_metric_daily.csv",
        content: buildMetricsCsv(store, operatorId),
        content_type: "text/csv; charset=utf-8",
      },
      {
        filename: "deal_events.csv",
        content: buildEventsCsv(store, operatorId),
        content_type: "text/csv; charset=utf-8",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Close account
// ---------------------------------------------------------------------------

export type CloseAccountResult = {
  operator_id: string;
  account_status: AccountStatus;
  ended_deal_ids: string[];
  disconnected_providers: string[];
  closed_at: string;
};

export async function closeOperatorAccount(
  store: DealDraftStore,
  operatorId: string,
  options: {
    confirmText: unknown;
    actor: DealActor;
    now?: string;
  }
): Promise<CloseAccountResult> {
  const op = store.operators.operators.get(operatorId);
  if (!op) {
    throw new AccountError("Operator not found", 404);
  }

  if (!isCloseConfirmValid(op.tradingName, options.confirmText)) {
    throw new AccountError(
      `Type the operator trading name "${op.tradingName}" to confirm.`,
      400,
      {
        code: "confirm_required",
        errors: [
          {
            field: "confirm_text",
            message: `must exactly match trading name "${op.tradingName}"`,
          },
        ],
      }
    );
  }

  if (op.accountStatus === "suspended") {
    throw new AccountError("Account is already closed.", 409, {
      code: "already_closed",
    });
  }

  const now = options.now ?? new Date().toISOString();
  const endedDealIds: string[] = [];

  for (const deal of dealsForOperator(store, operatorId)) {
    if (deal.status === "live" || deal.status === "scheduled") {
      endDeal(store, deal.id, { actor: options.actor, now });
      endedDealIds.push(deal.id);
    }
  }

  const disconnectedProviders: string[] = [];
  const integrations = store.integrations
    ? [...store.integrations.values()].filter(
        (i) => i.operatorId === operatorId && i.status !== "disconnected"
      )
    : [];

  for (const integration of integrations) {
    await disconnectIntegration(store, operatorId, integration.provider, {
      confirm: true,
      actor: options.actor,
      now,
    });
    disconnectedProviders.push(integration.provider);
  }

  const updated = {
    ...op,
    accountStatus: "suspended" as const,
    updatedAt: now,
  };
  store.operators.operators.set(operatorId, updated);

  return {
    operator_id: operatorId,
    account_status: "suspended",
    ended_deal_ids: endedDealIds,
    disconnected_providers: disconnectedProviders,
    closed_at: now,
  };
}
