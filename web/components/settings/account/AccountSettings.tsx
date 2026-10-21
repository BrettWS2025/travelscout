"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { SettingsSubnav } from "@/components/settings/SettingsSubnav";
import {
  listMyOperators,
  type MyOperator,
} from "@/lib/marketplace/operator-deals-client";
import {
  AccountApiError,
  closeOperatorAccountApi,
  downloadExportFiles,
  exportOperatorDataApi,
} from "@/lib/marketplace/account-client";
import {
  canManageAccount,
  closeWarningCopy,
  fieldErrorMap,
  isCloseConfirmValid,
  ownerOnlyHint,
} from "@/lib/marketplace/account-ui";
import type { UserRole } from "@/lib/marketplace/enums";

export function AccountSettings() {
  const { session, user, isLoading: authLoading } = useAuth();
  const token = session?.access_token ?? null;

  const [operators, setOperators] = useState<MyOperator[]>([]);
  const [operatorId, setOperatorId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const [exporting, setExporting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [closeErrors, setCloseErrors] = useState<Record<string, string>>({});
  const [closing, setClosing] = useState(false);
  const [closed, setClosed] = useState(false);

  const currentOp = operators.find((o) => o.id === operatorId) ?? null;
  const actorRole = (currentOp?.role ?? null) as UserRole | null;
  const canEdit = canManageAccount(actorRole);
  const tradingName = currentOp?.tradingName ?? "";

  const loadOperators = useCallback(async () => {
    if (!token) return;
    const res = await listMyOperators(token);
    setOperators(res.operators);
    if (res.operators.length && !operatorId) {
      setOperatorId(res.operators[0]!.id);
    }
  }, [token, operatorId]);

  useEffect(() => {
    if (authLoading || !token) return;
    void loadOperators();
  }, [authLoading, token, loadOperators]);

  async function onExport() {
    if (!token || !operatorId || !canEdit) return;
    setExporting(true);
    setError(null);
    setBanner(null);
    try {
      const result = await exportOperatorDataApi(operatorId, token);
      downloadExportFiles(result.files);
      setBanner(
        `Exported ${result.deal_count} deal(s) — ${result.files.length} CSV files downloaded.`
      );
    } catch (err) {
      setError(
        err instanceof AccountApiError ? err.message : "Failed to export data"
      );
    } finally {
      setExporting(false);
    }
  }

  async function onClose(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !operatorId || !canEdit) return;
    if (!isCloseConfirmValid(tradingName, confirmText)) {
      setCloseErrors({
        confirm_text: `must exactly match trading name "${tradingName}"`,
      });
      return;
    }
    if (
      !window.confirm(
        `Close ${tradingName}? This cannot be undone from the dashboard.`
      )
    ) {
      return;
    }
    setClosing(true);
    setCloseErrors({});
    setError(null);
    setBanner(null);
    try {
      const res = await closeOperatorAccountApi(
        operatorId,
        token,
        confirmText
      );
      setClosed(true);
      setBanner(
        `Account closed. Ended ${res.closed.ended_deal_ids.length} deal(s); disconnected ${res.closed.disconnected_providers.length} integration(s).`
      );
    } catch (err) {
      if (err instanceof AccountApiError) {
        setCloseErrors(fieldErrorMap(err.errors));
        setError(err.message);
      } else {
        setError("Failed to close account");
      }
    } finally {
      setClosing(false);
    }
  }

  if (authLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
          Loading…
        </p>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
          Sign in to manage your account.
        </p>
      </div>
    );
  }

  const hint = ownerOnlyHint(actorRole);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <h1 className="font-[family-name:var(--font-sora)] text-2xl font-semibold text-[var(--ts-ink)]">
          Settings
        </h1>
        <p className="mt-1 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
          Login, data export, and close account.
        </p>
      </div>

      <SettingsSubnav />

      {operators.length > 1 ? (
        <div className="mt-6">
          <label
            htmlFor="account-operator"
            className="block font-[family-name:var(--font-sora)] text-xs font-semibold text-[var(--ts-muted)]"
          >
            Operator
          </label>
          <select
            id="account-operator"
            className="mt-1 w-full max-w-sm rounded-xl border border-[var(--ts-ink)]/15 bg-white px-3 py-2.5 font-[family-name:var(--font-sora)] text-sm"
            value={operatorId ?? ""}
            onChange={(e) => {
              setOperatorId(e.target.value);
              setClosed(false);
              setConfirmText("");
            }}
          >
            {operators.map((op) => (
              <option key={op.id} value={op.id}>
                {op.tradingName}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {banner ? (
        <p
          className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 font-[family-name:var(--font-sora)] text-sm text-emerald-800"
          role="status"
        >
          {banner}
        </p>
      ) : null}
      {error ? (
        <p
          className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 font-[family-name:var(--font-sora)] text-sm text-red-700"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {hint ? (
        <p className="mt-4 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
          {hint}
        </p>
      ) : null}

      <section className="mt-6 rounded-2xl border border-[var(--ts-ink)]/10 bg-white/80 p-4">
        <h2 className="font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--ts-ink)]">
          Login
        </h2>
        <p className="mt-2 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-ink)]">
          Signed in as {user?.email ?? "—"}
        </p>
        <p className="mt-1 font-[family-name:var(--font-sora)] text-xs text-[var(--ts-muted)]">
          Change email or password from your profile. SSO and 2FA are not
          enabled yet.
        </p>
        <Link
          href="/account/details"
          className="mt-3 inline-block font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--ts-ink)] underline"
        >
          Open profile &amp; password
        </Link>
      </section>

      {canEdit ? (
        <>
          <section className="mt-6 rounded-2xl border border-[var(--ts-ink)]/10 bg-white/80 p-4">
            <h2 className="font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--ts-ink)]">
              Export data
            </h2>
            <p className="mt-2 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
              Download CSV files for deals, daily metrics, and the audit log.
            </p>
            <button
              type="button"
              onClick={() => void onExport()}
              disabled={exporting || !operatorId}
              className="mt-3 rounded-xl bg-[var(--ts-ink)] px-4 py-2.5 font-[family-name:var(--font-sora)] text-sm font-semibold text-white disabled:opacity-60"
            >
              {exporting ? "Exporting…" : "Download CSVs"}
            </button>
          </section>

          <section className="mt-6 rounded-2xl border border-red-200 bg-red-50/60 p-4">
            <h2 className="font-[family-name:var(--font-sora)] text-sm font-semibold text-red-900">
              Close account
            </h2>
            <p className="mt-2 font-[family-name:var(--font-sora)] text-sm text-red-800">
              {closeWarningCopy(tradingName || "this operator")}
            </p>
            {closed ? (
              <p className="mt-3 font-[family-name:var(--font-sora)] text-sm font-medium text-red-900">
                This account is suspended.
              </p>
            ) : (
              <form onSubmit={onClose} className="mt-3 space-y-3">
                <div>
                  <label
                    htmlFor="close-confirm"
                    className="block font-[family-name:var(--font-sora)] text-xs font-semibold text-red-900"
                  >
                    Type {tradingName || "trading name"} to confirm
                  </label>
                  <input
                    id="close-confirm"
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    className="mt-1 w-full max-w-md rounded-xl border border-red-300 bg-white px-3 py-2.5 font-[family-name:var(--font-sora)] text-sm"
                    autoComplete="off"
                  />
                  {closeErrors.confirm_text ? (
                    <p className="mt-1 text-xs text-red-700">
                      {closeErrors.confirm_text}
                    </p>
                  ) : null}
                </div>
                <button
                  type="submit"
                  disabled={closing || !operatorId}
                  className="rounded-xl bg-red-700 px-4 py-2.5 font-[family-name:var(--font-sora)] text-sm font-semibold text-white disabled:opacity-60"
                >
                  {closing ? "Closing…" : "Close account"}
                </button>
              </form>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
