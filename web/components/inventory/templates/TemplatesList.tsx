"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { InventorySubnav } from "@/components/inventory/InventorySubnav";
import { DEAL_TYPE_LABELS } from "@/lib/marketplace/deals-list-ui";
import {
  OperatorDealsApiError,
  createDealFromTemplateApi,
  deleteOperatorTemplateApi,
  listMyOperators,
  listOperatorTemplatesApi,
  renameOperatorTemplateApi,
  type MyOperator,
  type OperatorDealTemplate,
} from "@/lib/marketplace/operator-deals-client";
import { canWriteInventory } from "@/lib/marketplace/deals-list-ui";

export function TemplatesList() {
  const { session } = useAuth();
  const token = session?.access_token;
  const router = useRouter();

  const [operator, setOperator] = useState<MyOperator | null>(null);
  const [templates, setTemplates] = useState<OperatorDealTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
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
        const { templates: rows } = await listOperatorTemplatesApi(
          operator.id,
          token
        );
        if (cancelled) return;
        setTemplates(rows);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof OperatorDealsApiError
              ? err.message
              : "Failed to load templates"
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

  async function onCreateDeal(template: OperatorDealTemplate) {
    if (!operator || !canWrite) return;
    setBusyId(template.id);
    setMessage(null);
    setError(null);
    try {
      const { deal } = await createDealFromTemplateApi(
        operator.id,
        template.id,
        {},
        token
      );
      router.push(`/account/inventory/deals/${deal.id}`);
    } catch (err) {
      setError(
        err instanceof OperatorDealsApiError
          ? err.message
          : "Could not create deal from template"
      );
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(template: OperatorDealTemplate) {
    if (!operator || !canWrite) return;
    if (
      !window.confirm(
        `Delete template “${template.name}”? This cannot be undone.`
      )
    ) {
      return;
    }
    setBusyId(template.id);
    setMessage(null);
    setError(null);
    try {
      await deleteOperatorTemplateApi(operator.id, template.id, token);
      setMessage(`Deleted “${template.name}”.`);
      bumpReload();
    } catch (err) {
      setError(
        err instanceof OperatorDealsApiError
          ? err.message
          : "Could not delete template"
      );
    } finally {
      setBusyId(null);
    }
  }

  function startRename(template: OperatorDealTemplate) {
    setRenamingId(template.id);
    setRenameValue(template.name);
  }

  async function commitRename(template: OperatorDealTemplate) {
    if (!operator || !canWrite) return;
    const next = renameValue.trim();
    if (!next || next === template.name) {
      setRenamingId(null);
      return;
    }
    setBusyId(template.id);
    setError(null);
    try {
      await renameOperatorTemplateApi(
        operator.id,
        template.id,
        next,
        token
      );
      setMessage(`Renamed to “${next}”.`);
      setRenamingId(null);
      bumpReload();
    } catch (err) {
      setError(
        err instanceof OperatorDealsApiError
          ? err.message
          : "Could not rename template"
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
            Templates
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
            href="/account/inventory"
            className="rounded-xl border border-[var(--ts-ink)]/15 bg-white px-4 py-2.5 font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--ts-ink)]"
          >
            Save from a deal
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
          Loading templates…
        </p>
      ) : !operator ? (
        <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
          No operator membership found.
        </p>
      ) : templates.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--ts-ink)]/15 bg-white/60 px-6 py-10 text-center">
          <p className="font-[family-name:var(--font-instrument)] text-2xl text-[var(--ts-ink)]">
            No templates yet
          </p>
          <p className="mt-2 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
            Open a deal and choose “Save as template” to reuse content, images,
            pricing and booking destination — sessions are never copied.
          </p>
          {canWrite ? (
            <Link
              href="/account/inventory"
              className="mt-4 inline-block rounded-xl bg-[var(--ts-teal)] px-4 py-2.5 font-[family-name:var(--font-sora)] text-sm font-semibold text-white"
            >
              Go to deals
            </Link>
          ) : null}
        </div>
      ) : (
        <ul className="divide-y divide-[var(--ts-ink)]/10 overflow-hidden rounded-2xl border border-[var(--ts-ink)]/10 bg-white">
          {templates.map((template) => {
            const busy = busyId === template.id;
            const typeLabel = template.deal_type
              ? DEAL_TYPE_LABELS[template.deal_type]
              : "Unknown type";
            return (
              <li
                key={template.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-4"
              >
                <div className="min-w-0 flex-1">
                  {renamingId === template.id ? (
                    <form
                      className="flex flex-wrap items-center gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void commitRename(template);
                      }}
                    >
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        className="min-w-[12rem] flex-1 rounded-lg border border-[var(--ts-ink)]/15 px-3 py-2 font-[family-name:var(--font-sora)] text-sm"
                        maxLength={120}
                        disabled={busy}
                      />
                      <button
                        type="submit"
                        disabled={busy}
                        className="rounded-lg bg-[var(--ts-teal)] px-3 py-2 text-sm font-semibold text-white"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setRenamingId(null)}
                        className="rounded-lg border border-[var(--ts-ink)]/15 px-3 py-2 text-sm"
                      >
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <>
                      <p className="truncate font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--ts-ink)]">
                        {template.name}
                      </p>
                      <p className="mt-0.5 font-[family-name:var(--font-sora)] text-xs text-[var(--ts-muted)]">
                        {typeLabel}
                      </p>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {canWrite && renamingId !== template.id ? (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void onCreateDeal(template)}
                        className="rounded-lg bg-[var(--ts-teal)] px-3 py-2 font-[family-name:var(--font-sora)] text-sm font-semibold text-white disabled:opacity-60"
                      >
                        {busy ? "Working…" : "Create Deal"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => startRename(template)}
                        className="rounded-lg border border-[var(--ts-ink)]/15 px-3 py-2 font-[family-name:var(--font-sora)] text-sm font-medium text-[var(--ts-ink)]"
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void onDelete(template)}
                        className="rounded-lg border border-red-200 px-3 py-2 font-[family-name:var(--font-sora)] text-sm font-medium text-red-700"
                      >
                        Delete
                      </button>
                    </>
                  ) : null}
                  {!canWrite ? (
                    <span className="font-[family-name:var(--font-sora)] text-xs text-[var(--ts-muted)]">
                      Read only
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
