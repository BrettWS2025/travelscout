"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { SettingsSubnav } from "@/components/settings/SettingsSubnav";
import {
  listMyOperators,
  type MyOperator,
} from "@/lib/marketplace/operator-deals-client";
import {
  BillingApiError,
  getBillingApi,
  patchBillingEmailApi,
  type BillingApiRow,
} from "@/lib/marketplace/billing-client";
import {
  canManageBilling,
  fieldErrorMap,
  formatMoneyMinor,
  formatPaymentMethod,
  ownerOnlyHint,
  usageSummaryText,
} from "@/lib/marketplace/billing-ui";
import type { UserRole } from "@/lib/marketplace/enums";

export function BillingSettings() {
  const { session, isLoading: authLoading } = useAuth();
  const token = session?.access_token ?? null;

  const [operators, setOperators] = useState<MyOperator[]>([]);
  const [operatorId, setOperatorId] = useState<string | null>(null);
  const [billing, setBilling] = useState<BillingApiRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const [emailDraft, setEmailDraft] = useState("");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const currentOp = operators.find((o) => o.id === operatorId) ?? null;
  const actorRole = (currentOp?.role ?? null) as UserRole | null;
  const canEdit = canManageBilling(actorRole);

  const loadOperators = useCallback(async () => {
    if (!token) return;
    const res = await listMyOperators(token);
    setOperators(res.operators);
    if (res.operators.length && !operatorId) {
      setOperatorId(res.operators[0]!.id);
    }
  }, [token, operatorId]);

  const loadBilling = useCallback(async () => {
    if (!token || !operatorId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getBillingApi(operatorId, token);
      setBilling(res.billing);
      setEmailDraft(res.billing.billing_email ?? "");
    } catch (err) {
      setBilling(null);
      setError(
        err instanceof BillingApiError ? err.message : "Failed to load billing"
      );
    } finally {
      setLoading(false);
    }
  }, [token, operatorId]);

  useEffect(() => {
    if (authLoading || !token) return;
    void loadOperators();
  }, [authLoading, token, loadOperators]);

  useEffect(() => {
    if (!operatorId || !token) return;
    void loadBilling();
  }, [operatorId, token, loadBilling]);

  async function onSaveEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !operatorId || !canEdit) return;
    setSaving(true);
    setFormErrors({});
    setBanner(null);
    setError(null);
    try {
      const trimmed = emailDraft.trim();
      const res = await patchBillingEmailApi(
        operatorId,
        token,
        trimmed.length ? trimmed : null
      );
      setBilling(res.billing);
      setEmailDraft(res.billing.billing_email ?? "");
      setBanner("Billing email updated.");
    } catch (err) {
      if (err instanceof BillingApiError) {
        setFormErrors(fieldErrorMap(err.errors));
        setError(err.message);
      } else {
        setError("Failed to update billing email");
      }
    } finally {
      setSaving(false);
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
          Sign in to view billing.
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
          Plan, invoices, and current-period usage. Plan and commission are
          read-only.
        </p>
      </div>

      <SettingsSubnav />

      {operators.length > 1 ? (
        <div className="mt-6">
          <label
            htmlFor="billing-operator"
            className="block font-[family-name:var(--font-sora)] text-xs font-semibold text-[var(--ts-muted)]"
          >
            Operator
          </label>
          <select
            id="billing-operator"
            className="mt-1 w-full max-w-sm rounded-xl border border-[var(--ts-ink)]/15 bg-white px-3 py-2.5 font-[family-name:var(--font-sora)] text-sm"
            value={operatorId ?? ""}
            onChange={(e) => setOperatorId(e.target.value)}
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

      {loading ? (
        <p className="mt-6 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
          Loading billing…
        </p>
      ) : billing && canEdit ? (
        <div className="mt-6 space-y-6">
          <section className="rounded-2xl border border-[var(--ts-ink)]/10 bg-white/80 p-4">
            <h2 className="font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--ts-ink)]">
              Plan
            </h2>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="font-[family-name:var(--font-sora)] text-xs text-[var(--ts-muted)]">
                  Plan
                </dt>
                <dd className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-ink)]">
                  {billing.plan}
                </dd>
              </div>
              <div>
                <dt className="font-[family-name:var(--font-sora)] text-xs text-[var(--ts-muted)]">
                  Model
                </dt>
                <dd className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-ink)]">
                  {billing.billing_model_label}
                </dd>
              </div>
              <div>
                <dt className="font-[family-name:var(--font-sora)] text-xs text-[var(--ts-muted)]">
                  Commission
                </dt>
                <dd className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-ink)]">
                  {billing.commission_pct == null
                    ? "—"
                    : `${billing.commission_pct}%`}
                </dd>
              </div>
              <div>
                <dt className="font-[family-name:var(--font-sora)] text-xs text-[var(--ts-muted)]">
                  Status
                </dt>
                <dd className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-ink)]">
                  {billing.status_label}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="font-[family-name:var(--font-sora)] text-xs text-[var(--ts-muted)]">
                  Payment method
                </dt>
                <dd className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-ink)]">
                  {formatPaymentMethod(billing.payment_method)}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-2xl border border-[var(--ts-ink)]/10 bg-white/80 p-4">
            <h2 className="font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--ts-ink)]">
              Billing email
            </h2>
            <form onSubmit={onSaveEmail} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label
                  htmlFor="billing-email"
                  className="block font-[family-name:var(--font-sora)] text-xs font-semibold text-[var(--ts-muted)]"
                >
                  Email
                </label>
                <input
                  id="billing-email"
                  type="email"
                  value={emailDraft}
                  onChange={(e) => setEmailDraft(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[var(--ts-ink)]/15 bg-white px-3 py-2.5 font-[family-name:var(--font-sora)] text-sm"
                  placeholder="billing@example.com"
                />
                {formErrors.billing_email ? (
                  <p className="mt-1 text-xs text-red-600">
                    {formErrors.billing_email}
                  </p>
                ) : null}
              </div>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-[var(--ts-ink)] px-4 py-2.5 font-[family-name:var(--font-sora)] text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save email"}
              </button>
            </form>
          </section>

          <section className="rounded-2xl border border-[var(--ts-ink)]/10 bg-white/80 p-4">
            <h2 className="font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--ts-ink)]">
              Current period usage
            </h2>
            <p className="mt-2 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-ink)]">
              {usageSummaryText(billing.usage, billing.currency)}
            </p>
          </section>

          <section className="rounded-2xl border border-[var(--ts-ink)]/10 bg-white/80 p-4">
            <h2 className="font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--ts-ink)]">
              Invoices
            </h2>
            {billing.billing_provider.message ? (
              <p className="mt-2 font-[family-name:var(--font-sora)] text-xs text-[var(--ts-muted)]">
                {billing.billing_provider.message}
              </p>
            ) : null}
            {billing.invoices.length === 0 ? (
              <p className="mt-3 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
                No invoices yet.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-[var(--ts-ink)]/10">
                {billing.invoices.map((inv) => (
                  <li
                    key={inv.id}
                    className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-[family-name:var(--font-sora)] text-sm font-medium text-[var(--ts-ink)]">
                        {inv.number}
                      </p>
                      <p className="font-[family-name:var(--font-sora)] text-xs text-[var(--ts-muted)]">
                        {inv.status} ·{" "}
                        {formatMoneyMinor(inv.amount_minor, inv.currency)}
                      </p>
                    </div>
                    <a
                      href={inv.download_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--ts-ink)] underline"
                    >
                      Download
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
