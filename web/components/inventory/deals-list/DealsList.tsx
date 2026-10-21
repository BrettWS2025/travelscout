"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { UpdateSeatsDialog } from "@/components/inventory/deals-list/UpdateSeatsDialog";
import { InventorySubnav } from "@/components/inventory/InventorySubnav";
import type {
  BulkDealAction,
  DealCalendarResult,
  DealListBanner,
  DealListRow,
  DealListRowAction,
  DealListTab,
  ListOperatorDealsResult,
} from "@/lib/marketplace/deal-list-shared";
import {
  DEAL_LIST_ROW_ACTION_LABELS,
  DEAL_LIST_TAB_LABELS,
  DEAL_TYPE_LABELS,
  DEFAULT_DEALS_LIST_FILTERS,
  SOURCE_PROVIDER_LABELS,
  bannerFixHref,
  buildDealsListQuery,
  canWriteInventory,
  emptyStateCopy,
  filterOptions,
  formatCutoffCountdown,
  formatMinorAsDollars,
  pauseTooltip,
  statusLabel,
  type DealsListFilters,
  type DealsListViewMode,
} from "@/lib/marketplace/deals-list-ui";
import {
  OperatorDealsApiError,
  bulkOperatorDealsApi,
  duplicateOperatorDeal,
  endOperatorDealApi,
  getOperatorDealsCalendarApi,
  listMyOperators,
  listOperatorDealsApi,
  markOperatorDealSoldOutApi,
  pauseOperatorDealApi,
  resumeOperatorDealApi,
  saveOperatorDealAsTemplateApi,
  type MyOperator,
} from "@/lib/marketplace/operator-deals-client";

type Props = {
  initialTab?: DealListTab;
};

function useNowTick(enabled: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [enabled, intervalMs]);
  return now;
}

export function DealsList({ initialTab }: Props) {
  const { session } = useAuth();
  const token = session?.access_token;
  const router = useRouter();
  const options = filterOptions();

  const [operator, setOperator] = useState<MyOperator | null>(null);
  const [operatorReady, setOperatorReady] = useState(false);
  const [filters, setFilters] = useState<DealsListFilters>(() => ({
    ...DEFAULT_DEALS_LIST_FILTERS,
    tab: initialTab ?? "live",
  }));
  const [searchInput, setSearchInput] = useState("");
  const [view, setView] = useState<DealsListViewMode>("table");
  const [list, setList] = useState<ListOperatorDealsResult | null>(null);
  const [calendar, setCalendar] = useState<DealCalendarResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [seatsDeal, setSeatsDeal] = useState<DealListRow | null>(null);
  const [bulkPauseConfirm, setBulkPauseConfirm] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const canWrite = canWriteInventory(operator?.role);
  const nowMs = useNowTick(view === "table" && (list?.deals.length ?? 0) > 0);

  const bumpReload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    setOperatorReady(false);
    (async () => {
      try {
        const { operators } = await listMyOperators(token);
        if (cancelled) return;
        setOperator(operators[0] ?? null);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load operator"
          );
          setOperator(null);
        }
      } finally {
        if (!cancelled) setOperatorReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setFilters((prev) => {
        if (prev.search === searchInput) return prev;
        return { ...prev, search: searchInput, page: 1 };
      });
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    if (!operatorReady) return;
    if (!operator) {
      setList(null);
      setCalendar(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const listResult = await listOperatorDealsApi(
          operator.id,
          buildDealsListQuery(filters),
          token
        );
        if (cancelled) return;
        setList(listResult);
        if (view === "calendar") {
          const cal = await getOperatorDealsCalendarApi(
            operator.id,
            null,
            token
          );
          if (!cancelled) setCalendar(cal);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load deals"
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [operator, operatorReady, filters, view, token, reloadKey]);

  const empty = useMemo(
    () =>
      emptyStateCopy({
        hasAnyDeals: list?.has_any_deals ?? false,
        hasIntegration: list?.has_integration ?? false,
        canWrite,
      }),
    [list, canWrite]
  );

  function patchFilters(patch: Partial<DealsListFilters>) {
    setFilters((prev) => ({ ...prev, ...patch }));
    setSelected(new Set());
  }

  async function runAction(row: DealListRow, action: DealListRowAction) {
    if (!operator) return;
    setMessage(null);
    setBusy(true);
    try {
      switch (action) {
        case "edit":
          router.push(`/account/inventory/deals/${row.id}`);
          break;
        case "preview":
          router.push(`/account/inventory/deals/${row.id}?preview=1`);
          break;
        case "view_stats":
          setMessage("Deal stats land in a later chunk.");
          break;
        case "save_as_template": {
          const defaultName = row.title?.trim()
            ? `${row.title.trim()} template`
            : "Deal template";
          const name = window.prompt("Template name", defaultName);
          if (name == null) break;
          if (!name.trim()) {
            setMessage("Template name is required.");
            break;
          }
          const { template } = await saveOperatorDealAsTemplateApi(
            row.id,
            name.trim(),
            token
          );
          setMessage(
            `Saved “${template.name}”. Open Templates to create deals from it.`
          );
          break;
        }
        case "duplicate": {
          const { deal } = await duplicateOperatorDeal(row.id, token);
          router.push(`/account/inventory/deals/${deal.id}`);
          break;
        }
        case "pause":
          await pauseOperatorDealApi(row.id, {}, token);
          setMessage(`Paused “${row.title ?? "deal"}”.`);
          bumpReload();
          break;
        case "resume":
          await resumeOperatorDealApi(row.id, {}, token);
          setMessage(`Resumed “${row.title ?? "deal"}”.`);
          bumpReload();
          break;
        case "end":
          if (!window.confirm(`End “${row.title ?? "this deal"}”?`)) break;
          await endOperatorDealApi(row.id, token);
          setMessage(`Ended “${row.title ?? "deal"}”.`);
          bumpReload();
          break;
        case "mark_sold_out":
          if (!window.confirm(`Mark “${row.title ?? "this deal"}” sold out?`))
            break;
          await markOperatorDealSoldOutApi(row.id, token);
          setMessage("Marked sold out.");
          bumpReload();
          break;
        case "update_seats":
          setSeatsDeal(row);
          break;
        default:
          break;
      }
    } catch (err) {
      setError(
        err instanceof OperatorDealsApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Action failed"
      );
    } finally {
      setBusy(false);
    }
  }

  async function runBulk(action: BulkDealAction, confirm = false) {
    if (!operator || selected.size === 0) return;
    if (action === "pause" && !confirm) {
      setBulkPauseConfirm(true);
      return;
    }
    setBulkPauseConfirm(false);
    setBusy(true);
    setMessage(null);
    try {
      const { results } = await bulkOperatorDealsApi(
        operator.id,
        {
          action,
          deal_ids: [...selected],
          confirm: action === "pause" ? true : undefined,
        },
        token
      );
      const ok = results.filter((r) => r.ok).length;
      const fail = results.length - ok;
      setMessage(
        fail === 0
          ? `Bulk ${action.replace(/_/g, " ")}: ${ok} succeeded.`
          : `Bulk ${action.replace(/_/g, " ")}: ${ok} ok, ${fail} failed.`
      );
      setSelected(new Set());
      bumpReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk action failed");
    } finally {
      setBusy(false);
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (!list) return;
    if (selected.size === list.deals.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(list.deals.map((d) => d.id)));
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-instrument)] text-3xl text-[var(--ts-ink)]">
            Inventory
          </h2>
          {operator ? (
            <p className="mt-1 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
              {operator.tradingName}
              {operator.role === "staff" ? " · read only" : ""}
            </p>
          ) : null}
        </div>
        {canWrite ? (
          <Link
            href="/account/inventory/deals/new"
            className="rounded-xl bg-[var(--ts-teal)] px-4 py-2.5 font-[family-name:var(--font-sora)] text-sm font-semibold text-white shadow-[0_12px_30px_rgba(14,124,102,0.25)]"
          >
            Create deal
          </Link>
        ) : null}
      </div>

      <InventorySubnav />

      {list?.banners && list.banners.length > 0 ? (
        <div className="space-y-2">
          {list.banners.map((banner, i) => (
            <BannerRow
              key={`${banner.type}-${i}`}
              banner={banner}
              operatorId={operator?.id ?? ""}
              onAttention={() =>
                patchFilters({ tab: "needs_attention", page: 1 })
              }
            />
          ))}
        </div>
      ) : null}

      {message ? (
        <p className="rounded-xl border border-[var(--ts-teal)]/20 bg-[var(--ts-teal)]/5 px-4 py-2 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-ink)]">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 font-[family-name:var(--font-sora)] text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2 border-b border-[var(--ts-ink)]/10 pb-1">
        {options.tabs.map((tab) => {
          const count = list?.tab_counts?.[tab] ?? 0;
          const active = filters.tab === tab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => patchFilters({ tab, page: 1 })}
              className={`rounded-t-lg px-3 py-2 font-[family-name:var(--font-sora)] text-sm transition ${
                active
                  ? "bg-white font-semibold text-[var(--ts-teal)] shadow-[0_-1px_0_var(--ts-teal)]"
                  : "text-[var(--ts-muted)] hover:text-[var(--ts-ink)]"
              }`}
            >
              {DEAL_LIST_TAB_LABELS[tab]}
              <span className="ml-1.5 text-xs opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 font-[family-name:var(--font-sora)] text-xs text-[var(--ts-muted)]">
          Search
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Title…"
            className="min-w-[10rem] rounded-lg border border-[var(--ts-ink)]/15 bg-white px-3 py-2 text-sm text-[var(--ts-ink)]"
          />
        </label>
        <label className="flex flex-col gap-1 font-[family-name:var(--font-sora)] text-xs text-[var(--ts-muted)]">
          Type
          <select
            value={filters.dealType}
            onChange={(e) =>
              patchFilters({
                dealType: e.target.value as DealsListFilters["dealType"],
                page: 1,
              })
            }
            className="rounded-lg border border-[var(--ts-ink)]/15 bg-white px-3 py-2 text-sm text-[var(--ts-ink)]"
          >
            <option value="">All</option>
            {options.dealTypes.map((t) => (
              <option key={t} value={t}>
                {DEAL_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 font-[family-name:var(--font-sora)] text-xs text-[var(--ts-muted)]">
          Source
          <select
            value={filters.sourceProvider}
            onChange={(e) =>
              patchFilters({
                sourceProvider: e.target
                  .value as DealsListFilters["sourceProvider"],
                page: 1,
              })
            }
            className="rounded-lg border border-[var(--ts-ink)]/15 bg-white px-3 py-2 text-sm text-[var(--ts-ink)]"
          >
            <option value="">All</option>
            {options.sources.map((s) => (
              <option key={s} value={s}>
                {SOURCE_PROVIDER_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 font-[family-name:var(--font-sora)] text-xs text-[var(--ts-muted)]">
          Category
          <select
            value={filters.category}
            onChange={(e) =>
              patchFilters({
                category: e.target.value as DealsListFilters["category"],
                page: 1,
              })
            }
            className="rounded-lg border border-[var(--ts-ink)]/15 bg-white px-3 py-2 text-sm text-[var(--ts-ink)]"
          >
            <option value="">All</option>
            {options.categories.map((c) => (
              <option key={c} value={c}>
                {c.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 font-[family-name:var(--font-sora)] text-xs text-[var(--ts-muted)]">
          From
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) =>
              patchFilters({ dateFrom: e.target.value, page: 1 })
            }
            className="rounded-lg border border-[var(--ts-ink)]/15 bg-white px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 font-[family-name:var(--font-sora)] text-xs text-[var(--ts-muted)]">
          To
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) =>
              patchFilters({ dateTo: e.target.value, page: 1 })
            }
            className="rounded-lg border border-[var(--ts-ink)]/15 bg-white px-3 py-2 text-sm"
          />
        </label>
        <div className="ml-auto flex gap-1 rounded-xl border border-[var(--ts-ink)]/10 bg-white p-1">
          <button
            type="button"
            onClick={() => setView("table")}
            className={`rounded-lg px-3 py-1.5 font-[family-name:var(--font-sora)] text-sm ${
              view === "table"
                ? "bg-[var(--ts-teal)] text-white"
                : "text-[var(--ts-muted)]"
            }`}
          >
            Table
          </button>
          <button
            type="button"
            onClick={() => setView("calendar")}
            className={`rounded-lg px-3 py-1.5 font-[family-name:var(--font-sora)] text-sm ${
              view === "calendar"
                ? "bg-[var(--ts-teal)] text-white"
                : "text-[var(--ts-muted)]"
            }`}
          >
            3-day calendar
          </button>
        </div>
      </div>

      {canWrite && selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--ts-ink)]/10 bg-white/80 px-3 py-2">
          <span className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-ink)]">
            {selected.size} selected
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void runBulk("pause")}
            className="rounded-lg border border-[var(--ts-ink)]/15 px-3 py-1.5 text-sm"
          >
            Pause
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void runBulk("resume")}
            className="rounded-lg border border-[var(--ts-ink)]/15 px-3 py-1.5 text-sm"
          >
            Resume
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void runBulk("end")}
            className="rounded-lg border border-[var(--ts-ink)]/15 px-3 py-1.5 text-sm"
          >
            End
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void runBulk("mark_sold_out")}
            className="rounded-lg border border-[var(--ts-ink)]/15 px-3 py-1.5 text-sm"
          >
            Mark sold out
          </button>
        </div>
      ) : null}

      {bulkPauseConfirm ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-ink)]">
          Pause {selected.size} deal{selected.size === 1 ? "" : "s"}? Travellers
          will no longer see them.
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="rounded-lg bg-[var(--ts-teal)] px-3 py-1.5 text-sm font-semibold text-white"
              onClick={() => void runBulk("pause", true)}
            >
              Confirm pause
            </button>
            <button
              type="button"
              className="rounded-lg px-3 py-1.5 text-sm"
              onClick={() => setBulkPauseConfirm(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {loading && !list ? (
        <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
          Loading deals…
        </p>
      ) : !operator ? (
        <EmptyBlock
          title="No operator membership"
          body="Ask an owner to invite you, or create an operator account."
          cta={null}
        />
      ) : view === "calendar" ? (
        <CalendarView calendar={calendar} />
      ) : !list || list.deals.length === 0 ? (
        <EmptyBlock
          title={empty.title}
          body={empty.body}
          cta={empty.cta}
          showConnect={!list?.has_integration && !list?.has_any_deals}
        />
      ) : (
        <TableView
          deals={list.deals}
          canWrite={canWrite}
          selected={selected}
          nowMs={nowMs}
          busy={busy}
          onToggle={toggleSelect}
          onToggleAll={toggleSelectAll}
          onAction={runAction}
        />
      )}

      {view === "table" && list && list.total > list.page_size ? (
        <div className="flex items-center justify-between font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
          <span>
            Page {list.page} · {list.total} deals
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={list.page <= 1}
              onClick={() => patchFilters({ page: list.page - 1 })}
              className="rounded-lg border border-[var(--ts-ink)]/15 px-3 py-1.5 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={list.page * list.page_size >= list.total}
              onClick={() => patchFilters({ page: list.page + 1 })}
              className="rounded-lg border border-[var(--ts-ink)]/15 px-3 py-1.5 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      {seatsDeal ? (
        <UpdateSeatsDialog
          dealId={seatsDeal.id}
          dealTitle={seatsDeal.title}
          accessToken={token}
          onClose={() => setSeatsDeal(null)}
          onSaved={() => {
            setMessage("Seats updated.");
            bumpReload();
          }}
        />
      ) : null}
    </div>
  );
}

function BannerRow({
  banner,
  operatorId,
  onAttention,
}: {
  banner: DealListBanner;
  operatorId: string;
  onAttention: () => void;
}) {
  const href = bannerFixHref(banner, operatorId);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-ink)]">
        {banner.message}
      </p>
      {banner.type === "attestation_due" ? (
        <button
          type="button"
          onClick={onAttention}
          className="rounded-lg bg-[var(--ts-ink)] px-3 py-1.5 font-[family-name:var(--font-sora)] text-xs font-semibold text-white"
        >
          Reconfirm
        </button>
      ) : (
        <Link
          href={href}
          className="rounded-lg bg-[var(--ts-ink)] px-3 py-1.5 font-[family-name:var(--font-sora)] text-xs font-semibold text-white"
        >
          Fix
        </Link>
      )}
    </div>
  );
}

function EmptyBlock({
  title,
  body,
  cta,
  showConnect,
}: {
  title: string;
  body: string;
  cta: string | null;
  showConnect?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--ts-ink)]/15 bg-white/70 px-6 py-12 text-center shadow-[0_16px_40px_rgba(16,36,28,0.04)]">
      <p className="font-[family-name:var(--font-sora)] text-sm font-medium text-[var(--ts-ink)]">
        {title}
      </p>
      <p className="mt-2 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
        {body}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        {cta ? (
          <Link
            href="/account/inventory/deals/new"
            className="inline-block rounded-xl bg-[var(--ts-teal)] px-4 py-2.5 font-[family-name:var(--font-sora)] text-sm font-semibold text-white"
          >
            {cta}
          </Link>
        ) : null}
        {showConnect ? (
          <Link
            href="/account/settings/integrations"
            className="inline-block font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--ts-teal)]"
          >
            Connect an integration →
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function TableView({
  deals,
  canWrite,
  selected,
  nowMs,
  busy,
  onToggle,
  onToggleAll,
  onAction,
}: {
  deals: DealListRow[];
  canWrite: boolean;
  selected: Set<string>;
  nowMs: number;
  busy: boolean;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onAction: (row: DealListRow, action: DealListRowAction) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-[var(--ts-ink)]/10 bg-white/80 shadow-[0_12px_32px_rgba(16,36,28,0.05)]">
      <table className="min-w-full border-collapse font-[family-name:var(--font-sora)] text-sm">
        <thead>
          <tr className="border-b border-[var(--ts-ink)]/10 text-left text-xs uppercase tracking-wide text-[var(--ts-muted)]">
            {canWrite ? (
              <th className="px-3 py-3">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={selected.size > 0 && selected.size === deals.length}
                  onChange={onToggleAll}
                />
              </th>
            ) : null}
            <th className="px-3 py-3">Deal</th>
            <th className="px-3 py-3">Next session</th>
            <th className="px-3 py-3">Price</th>
            <th className="px-3 py-3">Seats</th>
            <th className="px-3 py-3">Cutoff</th>
            <th className="px-3 py-3">Status</th>
            <th className="px-3 py-3">Clicks</th>
            <th className="px-3 py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {deals.map((row) => {
            const tip = pauseTooltip(row);
            return (
              <tr
                key={row.id}
                className="border-b border-[var(--ts-ink)]/5 align-top last:border-0"
              >
                {canWrite ? (
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      aria-label={`Select ${row.title ?? row.id}`}
                      checked={selected.has(row.id)}
                      onChange={() => onToggle(row.id)}
                    />
                  </td>
                ) : null}
                <td className="px-3 py-3">
                  <div className="flex gap-3">
                    {row.cover_thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={row.cover_thumbnail_url}
                        alt=""
                        className="h-12 w-16 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-16 items-center justify-center rounded-lg bg-[var(--ts-ink)]/5 text-xs text-[var(--ts-muted)]">
                        —
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-[var(--ts-ink)]">
                        {row.title ?? "Untitled"}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--ts-muted)]">
                        {DEAL_TYPE_LABELS[row.deal_type]} ·{" "}
                        {SOURCE_PROVIDER_LABELS[row.source_provider]}
                        {row.from_rule ? " · from rule" : ""}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 text-[var(--ts-ink)]">
                  {row.next_session_start_local ?? "—"}
                </td>
                <td className="px-3 py-3 text-[var(--ts-ink)]">
                  <span className="line-through text-[var(--ts-muted)]">
                    {formatMinorAsDollars(row.original_price_minor)}
                  </span>{" "}
                  <span className="font-semibold">
                    {formatMinorAsDollars(row.deal_price_minor)}
                  </span>
                  {row.discount_pct != null ? (
                    <span className="ml-1 text-xs text-[var(--ts-teal)]">
                      −{row.discount_pct}%
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-3">{row.seats_displayed ?? "—"}</td>
                <td className="px-3 py-3 tabular-nums text-[var(--ts-ink)]">
                  {formatCutoffCountdown(row.cutoff_at, nowMs)}
                </td>
                <td className="px-3 py-3">
                  <span className="capitalize" title={tip ?? undefined}>
                    {statusLabel(row.status)}
                  </span>
                  {tip ? (
                    <span
                      className="ml-1 cursor-help text-xs text-[var(--ts-muted)]"
                      title={tip}
                    >
                      ⓘ
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-3">{row.clicks_today}</td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-1">
                    {row.allowed_actions.map((action) => (
                      <button
                        key={action}
                        type="button"
                        disabled={busy}
                        onClick={() => onAction(row, action)}
                        className="rounded-md border border-[var(--ts-ink)]/10 px-2 py-1 text-xs text-[var(--ts-ink)] hover:border-[var(--ts-teal)]/40 hover:text-[var(--ts-teal)] disabled:opacity-50"
                      >
                        {DEAL_LIST_ROW_ACTION_LABELS[action]}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CalendarView({ calendar }: { calendar: DealCalendarResult | null }) {
  if (!calendar) {
    return (
      <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
        Loading calendar…
      </p>
    );
  }
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {calendar.days.map((day) => (
        <div
          key={day.date}
          className="rounded-2xl border border-[var(--ts-ink)]/10 bg-white/80 p-4"
        >
          <h3 className="font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--ts-ink)]">
            {day.date}
          </h3>
          {day.sessions.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--ts-muted)]">No sessions</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {day.sessions.map((s) => (
                <li key={s.session_id} className="text-sm">
                  <Link
                    href={`/account/inventory/deals/${s.deal_id}`}
                    className="font-medium text-[var(--ts-teal)] hover:underline"
                  >
                    {s.deal.title ?? "Untitled"}
                  </Link>
                  <p className="text-xs text-[var(--ts-muted)]">
                    {s.start_at_local} · {s.seats_displayed} seats ·{" "}
                    {statusLabel(s.deal.status)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
