"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { InventorySubnav } from "@/components/inventory/InventorySubnav";
import { canWriteInventory } from "@/lib/marketplace/deals-list-ui";
import {
  OperatorDealsApiError,
  deleteOperatorDealRuleApi,
  listMyOperators,
  listOperatorDealRulesApi,
  previewOperatorDealRuleApi,
  updateOperatorDealRuleApi,
  type MyOperator,
  type OperatorDealRuleListRow,
} from "@/lib/marketplace/operator-deals-client";

export function AutoDealRulesList() {
  const { session } = useAuth();
  const token = session?.access_token;

  const [operator, setOperator] = useState<MyOperator | null>(null);
  const [rules, setRules] = useState<OperatorDealRuleListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [previewById, setPreviewById] = useState<Record<string, string>>({});
  const [reloadKey, setReloadKey] = useState(0);

  const canWrite = canWriteInventory(operator?.role);
  const bumpReload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
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
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!operator) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const { rules: rows } = await listOperatorDealRulesApi(
          operator.id,
          token
        );
        if (cancelled) return;
        setRules(rows);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof OperatorDealsApiError
              ? err.message
              : "Failed to load auto-deal rules"
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [operator, token, reloadKey]);

  async function onToggleActive(rule: OperatorDealRuleListRow) {
    if (!operator || !canWrite) return;
    setBusyId(rule.id);
    setError(null);
    try {
      await updateOperatorDealRuleApi(
        operator.id,
        rule.id,
        { is_active: !rule.is_active },
        token
      );
      setMessage(
        rule.is_active
          ? `Paused “${rule.name}”.`
          : `Activated “${rule.name}”.`
      );
      bumpReload();
    } catch (err) {
      setError(
        err instanceof OperatorDealsApiError
          ? err.message
          : "Could not update rule"
      );
    } finally {
      setBusyId(null);
    }
  }

  async function onPreview(rule: OperatorDealRuleListRow) {
    if (!operator) return;
    setBusyId(rule.id);
    setError(null);
    try {
      const preview = await previewOperatorDealRuleApi(
        operator.id,
        rule.id,
        token
      );
      setPreviewById((prev) => ({ ...prev, [rule.id]: preview.message }));
    } catch (err) {
      setError(
        err instanceof OperatorDealsApiError
          ? err.message
          : "Could not preview rule"
      );
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(rule: OperatorDealRuleListRow) {
    if (!operator || !canWrite) return;
    if (
      !window.confirm(
        `Delete rule “${rule.name}”? Existing deals from this rule are kept.`
      )
    ) {
      return;
    }
    setBusyId(rule.id);
    setError(null);
    try {
      await deleteOperatorDealRuleApi(operator.id, rule.id, token);
      setMessage(`Deleted “${rule.name}”.`);
      bumpReload();
    } catch (err) {
      setError(
        err instanceof OperatorDealsApiError
          ? err.message
          : "Could not delete rule"
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-instrument)] text-3xl text-[var(--ts-ink)]">
            Auto-deal rules
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
            href="/account/inventory/auto-deal-rules/new"
            className="rounded-xl bg-[var(--ts-teal)] px-4 py-2.5 font-[family-name:var(--font-sora)] text-sm font-semibold text-white"
          >
            New rule
          </Link>
        ) : null}
      </div>

      <InventorySubnav />

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

      {loading ? (
        <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
          Loading rules…
        </p>
      ) : !operator ? (
        <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
          No operator membership found.
        </p>
      ) : rules.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--ts-ink)]/15 bg-white/60 px-6 py-10 text-center">
          <p className="font-[family-name:var(--font-instrument)] text-2xl text-[var(--ts-ink)]">
            No auto-deal rules yet
          </p>
          <p className="mt-2 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
            Create a rule from a booking-system product template to list unsold
            seats automatically (e.g. 48 h before departure).
          </p>
          {canWrite ? (
            <Link
              href="/account/inventory/auto-deal-rules/new"
              className="mt-4 inline-block rounded-xl bg-[var(--ts-teal)] px-4 py-2.5 font-[family-name:var(--font-sora)] text-sm font-semibold text-white"
            >
              New rule
            </Link>
          ) : null}
        </div>
      ) : (
        <ul className="divide-y divide-[var(--ts-ink)]/10 overflow-hidden rounded-2xl border border-[var(--ts-ink)]/10 bg-white">
          {rules.map((rule) => {
            const busy = busyId === rule.id;
            return (
              <li key={rule.id} className="space-y-2 px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--ts-ink)]">
                      {rule.name}
                      {!rule.is_active ? (
                        <span className="ml-2 text-xs font-medium text-[var(--ts-muted)]">
                          inactive
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 font-[family-name:var(--font-sora)] text-xs text-[var(--ts-muted)]">
                      {rule.product?.name ?? "Unknown product"}
                      {rule.provider ? ` · ${rule.provider}` : ""}
                    </p>
                    <p className="mt-1 font-[family-name:var(--font-sora)] text-xs text-[var(--ts-ink)]">
                      {rule.schedule_summary}
                    </p>
                    <p className="font-[family-name:var(--font-sora)] text-xs text-[var(--ts-muted)]">
                      {rule.discount_summary}
                      {" · "}
                      {rule.deals_generated_last_7_days} deals last 7 days
                      {rule.next_run_at
                        ? ` · next run ${new Date(rule.next_run_at).toLocaleString()}`
                        : ""}
                    </p>
                    {previewById[rule.id] ? (
                      <p className="mt-2 rounded-lg bg-[var(--ts-mist)]/60 px-3 py-2 font-[family-name:var(--font-sora)] text-xs text-[var(--ts-ink)]">
                        {previewById[rule.id]}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onPreview(rule)}
                      className="rounded-lg border border-[var(--ts-ink)]/15 px-3 py-2 font-[family-name:var(--font-sora)] text-sm font-medium text-[var(--ts-ink)]"
                    >
                      Preview
                    </button>
                    {canWrite ? (
                      <>
                        <Link
                          href={`/account/inventory/auto-deal-rules/${rule.id}`}
                          className="rounded-lg border border-[var(--ts-ink)]/15 px-3 py-2 font-[family-name:var(--font-sora)] text-sm font-medium text-[var(--ts-ink)]"
                        >
                          Edit
                        </Link>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void onToggleActive(rule)}
                          className="rounded-lg border border-[var(--ts-ink)]/15 px-3 py-2 font-[family-name:var(--font-sora)] text-sm font-medium text-[var(--ts-ink)]"
                        >
                          {rule.is_active ? "Deactivate" : "Activate"}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void onDelete(rule)}
                          className="rounded-lg border border-red-200 px-3 py-2 font-[family-name:var(--font-sora)] text-sm font-medium text-red-700"
                        >
                          Delete
                        </button>
                      </>
                    ) : (
                      <span className="font-[family-name:var(--font-sora)] text-xs text-[var(--ts-muted)]">
                        Read only
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
