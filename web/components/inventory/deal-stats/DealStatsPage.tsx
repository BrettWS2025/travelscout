"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { InventorySubnav } from "@/components/inventory/InventorySubnav";
import {
  formatCount,
  formatCtr,
  formatMoneyMinor,
  STATS_METRIC_LABELS,
} from "@/lib/marketplace/deal-metrics-ui";
import { statusLabel } from "@/lib/marketplace/deals-list-ui";
import {
  OperatorDealsApiError,
  getOperatorDealStatsApi,
  type OperatorDealStatsResponse,
} from "@/lib/marketplace/operator-deals-client";

type Props = {
  dealId: string;
};

function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - 6 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: fmt(from), to: fmt(to) };
}

export function DealStatsPage({ dealId }: Props) {
  const { session } = useAuth();
  const token = session?.access_token;

  const [range, setRange] = useState(defaultRange);
  const [stats, setStats] = useState<OperatorDealStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getOperatorDealStatsApi(
        dealId,
        { from: range.from, to: range.to },
        token
      );
      setStats(res);
    } catch (err) {
      setStats(null);
      setError(
        err instanceof OperatorDealsApiError
          ? err.message
          : "Failed to load deal stats"
      );
    } finally {
      setLoading(false);
    }
  }, [dealId, range.from, range.to, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const currency = stats?.deal.currency ?? "NZD";
  const totals = stats?.totals;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6">
      <InventorySubnav />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-[family-name:var(--font-sora)] text-xs font-medium uppercase tracking-wide text-[var(--ts-muted)]">
            Deal stats
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-sora)] text-2xl font-semibold text-[var(--ts-ink)]">
            {stats?.deal.title?.trim() || "Untitled deal"}
          </h1>
          {stats ? (
            <p className="mt-1 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
              {statusLabel(
                stats.deal.status as Parameters<typeof statusLabel>[0]
              )}
              {stats.deal.pause_reason
                ? ` · ${stats.deal.pause_reason}`
                : ""}
              {stats.deal.pause_detail ? ` — ${stats.deal.pause_detail}` : ""}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/account/inventory/deals/${encodeURIComponent(dealId)}`}
            className="rounded-lg border border-[var(--ts-ink)]/15 bg-white px-3 py-2 font-[family-name:var(--font-sora)] text-sm font-medium text-[var(--ts-ink)] hover:bg-[var(--ts-mist)]"
          >
            Edit deal
          </Link>
          <Link
            href="/account/inventory"
            className="rounded-lg border border-[var(--ts-ink)]/15 bg-white px-3 py-2 font-[family-name:var(--font-sora)] text-sm font-medium text-[var(--ts-muted)] hover:bg-[var(--ts-mist)]"
          >
            Back to deals
          </Link>
        </div>
      </div>

      <form
        className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--ts-ink)]/10 bg-white/70 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <label className="flex flex-col gap-1 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-ink)]">
          From
          <input
            type="date"
            value={range.from}
            onChange={(e) =>
              setRange((r) => ({ ...r, from: e.target.value }))
            }
            className="rounded-lg border border-[var(--ts-ink)]/15 bg-white px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-ink)]">
          To
          <input
            type="date"
            value={range.to}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            className="rounded-lg border border-[var(--ts-ink)]/15 bg-white px-3 py-2"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-[var(--ts-ink)] px-4 py-2 font-[family-name:var(--font-sora)] text-sm font-semibold text-white"
        >
          Apply
        </button>
        {stats ? (
          <p className="font-[family-name:var(--font-sora)] text-xs text-[var(--ts-muted)]">
            Times in {stats.timezone}
          </p>
        ) : null}
      </form>

      {loading ? (
        <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
          Loading stats…
        </p>
      ) : null}
      {error ? (
        <p
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-[family-name:var(--font-sora)] text-sm text-red-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {totals ? (
        <section aria-label="Totals">
          <h2 className="mb-3 font-[family-name:var(--font-sora)] text-lg font-semibold text-[var(--ts-ink)]">
            Totals
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ["impressions", formatCount(totals.impressions)],
                ["detail_views", formatCount(totals.detail_views)],
                ["booking_clicks", formatCount(totals.booking_clicks)],
                ["ctr", formatCtr(totals.ctr)],
                ["sold_out_on_click", formatCount(totals.sold_out_on_click)],
                [
                  "attributed_bookings",
                  formatCount(totals.attributed_bookings),
                ],
                [
                  "attributed_revenue_minor",
                  formatMoneyMinor(
                    totals.attributed_revenue_minor,
                    currency
                  ),
                ],
              ] as const
            ).map(([key, value]) => (
              <div
                key={key}
                className="rounded-xl border border-[var(--ts-ink)]/10 bg-white/80 p-4"
              >
                <p className="font-[family-name:var(--font-sora)] text-xs font-medium uppercase tracking-wide text-[var(--ts-muted)]">
                  {STATS_METRIC_LABELS[key]}
                </p>
                <p className="mt-1 font-[family-name:var(--font-sora)] text-xl font-semibold text-[var(--ts-ink)]">
                  {value}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {stats?.series?.length ? (
        <section aria-label="Per day">
          <h2 className="mb-3 font-[family-name:var(--font-sora)] text-lg font-semibold text-[var(--ts-ink)]">
            Per day
          </h2>
          <div className="overflow-x-auto rounded-xl border border-[var(--ts-ink)]/10 bg-white/80">
            <table className="min-w-full text-left font-[family-name:var(--font-sora)] text-sm">
              <thead className="border-b border-[var(--ts-ink)]/10 text-xs uppercase text-[var(--ts-muted)]">
                <tr>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Impressions</th>
                  <th className="px-3 py-2 font-medium">Views</th>
                  <th className="px-3 py-2 font-medium">Clicks</th>
                  <th className="px-3 py-2 font-medium">CTR</th>
                  <th className="px-3 py-2 font-medium">Bookings</th>
                  <th className="px-3 py-2 font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {stats.series.map((row) => (
                  <tr
                    key={row.date}
                    className="border-b border-[var(--ts-ink)]/5 text-[var(--ts-ink)]"
                  >
                    <td className="px-3 py-2">{row.date}</td>
                    <td className="px-3 py-2">
                      {formatCount(row.impressions)}
                    </td>
                    <td className="px-3 py-2">
                      {formatCount(row.detail_views)}
                    </td>
                    <td className="px-3 py-2">
                      {formatCount(row.booking_clicks)}
                    </td>
                    <td className="px-3 py-2">{formatCtr(row.ctr)}</td>
                    <td className="px-3 py-2">
                      {formatCount(row.attributed_bookings)}
                    </td>
                    <td className="px-3 py-2">
                      {formatMoneyMinor(
                        row.attributed_revenue_minor,
                        currency
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {stats?.sessions ? (
        <section aria-label="Sessions">
          <h2 className="mb-3 font-[family-name:var(--font-sora)] text-lg font-semibold text-[var(--ts-ink)]">
            Sessions
          </h2>
          {stats.sessions.length === 0 ? (
            <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
              No sessions on this deal.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[var(--ts-ink)]/10 bg-white/80">
              <table className="min-w-full text-left font-[family-name:var(--font-sora)] text-sm">
                <thead className="border-b border-[var(--ts-ink)]/10 text-xs uppercase text-[var(--ts-muted)]">
                  <tr>
                    <th className="px-3 py-2 font-medium">Starts</th>
                    <th className="px-3 py-2 font-medium">Seats</th>
                    <th className="px-3 py-2 font-medium">Last synced</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.sessions.map((s) => (
                    <tr
                      key={s.id}
                      className="border-b border-[var(--ts-ink)]/5 text-[var(--ts-ink)]"
                    >
                      <td className="px-3 py-2">{s.start_at_local}</td>
                      <td className="px-3 py-2">{s.seats_displayed}</td>
                      <td className="px-3 py-2">
                        {s.last_synced_at
                          ? new Date(s.last_synced_at).toLocaleString()
                          : "—"}
                      </td>
                      <td className="px-3 py-2">{s.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {stats?.activity ? (
        <section aria-label="Activity log">
          <h2 className="mb-3 font-[family-name:var(--font-sora)] text-lg font-semibold text-[var(--ts-ink)]">
            Activity
          </h2>
          {stats.activity.length === 0 ? (
            <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
              No events yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {stats.activity.map((ev) => (
                <li
                  key={ev.id}
                  className="rounded-xl border border-[var(--ts-ink)]/10 bg-white/80 px-4 py-3 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-ink)]"
                >
                  <p className="font-medium">{ev.change}</p>
                  <p className="mt-1 text-xs text-[var(--ts-muted)]">
                    {ev.created_at_local} · {ev.actor_type}
                    {ev.actor_id ? ` · ${ev.actor_id}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
