"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { InventorySubnav } from "@/components/inventory/InventorySubnav";
import { canWriteInventory } from "@/lib/marketplace/deals-list-ui";
import {
  DAY_OF_WEEK_OPTIONS,
  RULE_TYPE_LABELS,
  dealRuleFormToBody,
  emptyDealRuleForm,
  type DealRuleFormState,
} from "@/lib/marketplace/deal-rules-ui";
import type { RuleType } from "@/lib/marketplace/enums";
import {
  OperatorDealsApiError,
  createOperatorDealRuleApi,
  getOperatorDeal,
  getOperatorDealRuleApi,
  listDealProductsApi,
  listMyOperators,
  listOperatorDealsApi,
  previewOperatorDealRuleApi,
  updateOperatorDealRuleApi,
  type DealProductPickerItem,
  type MyOperator,
} from "@/lib/marketplace/operator-deals-client";

type Props = {
  ruleId?: string;
};

type TemplateOption = { id: string; title: string; external_product_id: string | null };

export function AutoDealRuleEditor({ ruleId }: Props) {
  const { session } = useAuth();
  const token = session?.access_token;
  const router = useRouter();
  const isNew = !ruleId || ruleId === "new";

  const [operator, setOperator] = useState<MyOperator | null>(null);
  const [form, setForm] = useState<DealRuleFormState>(emptyDealRuleForm());
  const [products, setProducts] = useState<DealProductPickerItem[]>([]);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewMsg, setPreviewMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Array<{ field: string; message: string }>
  >([]);

  const canWrite = canWriteInventory(operator?.role);

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
    (async () => {
      try {
        const [productsRes, dealsRes] = await Promise.all([
          listDealProductsApi(operator.id, token),
          listOperatorDealsApi(operator.id, "tab=drafts&page_size=50", token),
        ]);
        if (cancelled) return;
        setProducts(productsRes.products);

        const live = await listOperatorDealsApi(
          operator.id,
          "tab=live&page_size=50",
          token
        );
        const scheduled = await listOperatorDealsApi(
          operator.id,
          "tab=scheduled&page_size=50",
          token
        );
        if (cancelled) return;

        const templateRows: TemplateOption[] = [
          ...dealsRes.deals,
          ...live.deals,
          ...scheduled.deals,
        ]
          .filter(
            (d) =>
              d.deal_type === "integrated_session" ||
              d.deal_type === "integrated_multi_session"
          )
          .map((d) => ({
            id: d.id,
            title: d.title ?? "Untitled",
            external_product_id: null,
          }));
        setTemplates(templateRows);

        if (!isNew && ruleId) {
          const { rule } = await getOperatorDealRuleApi(
            operator.id,
            ruleId,
            token
          );
          if (cancelled) return;
          const cfg = rule.price_config as {
            options?: Array<{
              external_price_option_id?: string;
              percentage?: number;
            }>;
          };
          const first = cfg.options?.[0];
          setForm(
            emptyDealRuleForm({
              name: rule.name,
              integration_id: rule.integration_id,
              external_product_id: rule.external_product_id,
              template_deal_id: rule.template_deal_id,
              rule_type: rule.rule_type as RuleType,
              days_of_week: rule.days_of_week,
              specific_dates: rule.specific_dates.join(", "),
              session_times: rule.session_times.join(", "),
              list_hours_before_start: rule.list_hours_before_start,
              min_unsold_seats: rule.min_unsold_seats,
              seat_cap: rule.seat_cap != null ? String(rule.seat_cap) : "",
              discount_mechanism:
                rule.discount_mechanism === "price_option" ||
                rule.discount_mechanism === "separate_product"
                  ? rule.discount_mechanism
                  : "promo_code",
              promo_code: rule.promo_code ?? "",
              percentage: first?.percentage ?? 55,
              external_price_option_id: first?.external_price_option_id ?? "",
              auto_publish: rule.auto_publish,
              is_active: rule.is_active,
              start_date: rule.start_date,
              end_date: rule.end_date ?? "",
            })
          );
        } else if (productsRes.products[0]) {
          const p = productsRes.products[0];
          setForm((f) => ({
            ...f,
            integration_id: p.integration_id,
            external_product_id: p.id,
          }));
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof OperatorDealsApiError
              ? err.message
              : "Failed to load editor"
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [operator, token, isNew, ruleId]);

  function patchForm(patch: Partial<DealRuleFormState>) {
    setForm((f) => ({ ...f, ...patch }));
  }

  async function onProductChange(productId: string) {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    patchForm({
      external_product_id: p.id,
      integration_id: p.integration_id,
    });
  }

  async function onTemplateChange(dealId: string) {
    patchForm({ template_deal_id: dealId });
    if (!dealId) return;
    try {
      const detail = await getOperatorDeal(dealId, token);
      const opt = detail.priceOptions?.[0];
      const extId = opt?.externalPriceOptionId ?? "";
      patchForm({
        template_deal_id: dealId,
        external_price_option_id: extId ? String(extId) : form.external_price_option_id,
        external_product_id:
          detail.deal.externalProductId ?? form.external_product_id,
        integration_id: detail.deal.integrationId ?? form.integration_id,
      });
    } catch {
      // leave form as-is; user can fill price option id manually
    }
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!operator || !canWrite) return;
    setSaving(true);
    setError(null);
    setFieldErrors([]);
    setPreviewMsg(null);
    try {
      const body = dealRuleFormToBody(form);
      if (isNew) {
        const { rule } = await createOperatorDealRuleApi(
          operator.id,
          body,
          token
        );
        router.push(`/account/inventory/auto-deal-rules/${rule.id}`);
      } else if (ruleId) {
        await updateOperatorDealRuleApi(operator.id, ruleId, body, token);
        const preview = await previewOperatorDealRuleApi(
          operator.id,
          ruleId,
          token
        );
        setPreviewMsg(preview.message);
      }
    } catch (err) {
      if (err instanceof OperatorDealsApiError) {
        setError(err.message);
        setFieldErrors(err.errors ?? []);
      } else {
        setError("Could not save rule");
      }
    } finally {
      setSaving(false);
    }
  }

  async function onPreviewOnly() {
    if (!operator || !ruleId || isNew) return;
    setSaving(true);
    setError(null);
    try {
      const preview = await previewOperatorDealRuleApi(
        operator.id,
        ruleId,
        token
      );
      setPreviewMsg(preview.message);
    } catch (err) {
      setError(
        err instanceof OperatorDealsApiError
          ? err.message
          : "Could not preview"
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
        Loading…
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-instrument)] text-3xl text-[var(--ts-ink)]">
            {isNew ? "New auto-deal rule" : "Edit auto-deal rule"}
          </h2>
          {operator ? (
            <p className="mt-1 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
              {operator.tradingName}
            </p>
          ) : null}
        </div>
        <Link
          href="/account/inventory/auto-deal-rules"
          className="rounded-xl border border-[var(--ts-ink)]/15 bg-white px-4 py-2.5 font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--ts-ink)]"
        >
          Back to rules
        </Link>
      </div>

      <InventorySubnav />

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 font-[family-name:var(--font-sora)] text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {fieldErrors.length > 0 ? (
        <ul className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 font-[family-name:var(--font-sora)] text-sm text-red-800">
          {fieldErrors.map((e) => (
            <li key={`${e.field}:${e.message}`}>
              {e.field}: {e.message}
            </li>
          ))}
        </ul>
      ) : null}
      {previewMsg ? (
        <p className="rounded-xl border border-[var(--ts-teal)]/20 bg-[var(--ts-teal)]/5 px-4 py-2 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-ink)]">
          {previewMsg}
        </p>
      ) : null}

      {products.length === 0 ? (
        <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
          Connect an integration and enable a product before creating auto-deal
          rules.{" "}
          <Link
            href="/account/settings/integrations"
            className="font-semibold text-[var(--ts-teal)]"
          >
            Integrations
          </Link>
        </p>
      ) : (
        <form
          onSubmit={(e) => void onSave(e)}
          className="space-y-4 rounded-2xl border border-[var(--ts-ink)]/10 bg-white p-5"
        >
          <label className="block space-y-1">
            <span className="font-[family-name:var(--font-sora)] text-xs font-semibold uppercase tracking-wide text-[var(--ts-muted)]">
              Name
            </span>
            <input
              required
              value={form.name}
              disabled={!canWrite}
              onChange={(e) => patchForm({ name: e.target.value })}
              className="w-full rounded-lg border border-[var(--ts-ink)]/15 px-3 py-2 font-[family-name:var(--font-sora)] text-sm"
              maxLength={120}
            />
          </label>

          <label className="block space-y-1">
            <span className="font-[family-name:var(--font-sora)] text-xs font-semibold uppercase tracking-wide text-[var(--ts-muted)]">
              Product
            </span>
            <select
              required
              value={form.external_product_id}
              disabled={!canWrite}
              onChange={(e) => void onProductChange(e.target.value)}
              className="w-full rounded-lg border border-[var(--ts-ink)]/15 px-3 py-2 font-[family-name:var(--font-sora)] text-sm"
            >
              <option value="">Select product…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.provider})
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className="font-[family-name:var(--font-sora)] text-xs font-semibold uppercase tracking-wide text-[var(--ts-muted)]">
              Template deal
            </span>
            <select
              required
              value={form.template_deal_id}
              disabled={!canWrite}
              onChange={(e) => void onTemplateChange(e.target.value)}
              className="w-full rounded-lg border border-[var(--ts-ink)]/15 px-3 py-2 font-[family-name:var(--font-sora)] text-sm"
            >
              <option value="">Select A Booking-System Deal…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
            <span className="block font-[family-name:var(--font-sora)] text-xs text-[var(--ts-muted)]">
              Content, images and booking destination are copied from this deal.
            </span>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="font-[family-name:var(--font-sora)] text-xs font-semibold uppercase tracking-wide text-[var(--ts-muted)]">
                Schedule
              </span>
              <select
                value={form.rule_type}
                disabled={!canWrite}
                onChange={(e) =>
                  patchForm({ rule_type: e.target.value as RuleType })
                }
                className="w-full rounded-lg border border-[var(--ts-ink)]/15 px-3 py-2 font-[family-name:var(--font-sora)] text-sm"
              >
                {(Object.keys(RULE_TYPE_LABELS) as RuleType[]).map((k) => (
                  <option key={k} value={k}>
                    {RULE_TYPE_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="font-[family-name:var(--font-sora)] text-xs font-semibold uppercase tracking-wide text-[var(--ts-muted)]">
                List hours before start
              </span>
              <input
                type="number"
                min={1}
                max={72}
                required
                value={form.list_hours_before_start}
                disabled={!canWrite}
                onChange={(e) =>
                  patchForm({
                    list_hours_before_start: Number(e.target.value),
                  })
                }
                className="w-full rounded-lg border border-[var(--ts-ink)]/15 px-3 py-2 font-[family-name:var(--font-sora)] text-sm"
              />
            </label>
          </div>

          {form.rule_type === "weekly" ? (
            <fieldset className="space-y-2">
              <legend className="font-[family-name:var(--font-sora)] text-xs font-semibold uppercase tracking-wide text-[var(--ts-muted)]">
                Days of week
              </legend>
              <div className="flex flex-wrap gap-2">
                {DAY_OF_WEEK_OPTIONS.map((d) => {
                  const on = form.days_of_week.includes(d.value);
                  return (
                    <button
                      key={d.value}
                      type="button"
                      disabled={!canWrite}
                      onClick={() => {
                        const next = on
                          ? form.days_of_week.filter((x) => x !== d.value)
                          : [...form.days_of_week, d.value];
                        patchForm({ days_of_week: next });
                      }}
                      className={`rounded-lg px-3 py-1.5 font-[family-name:var(--font-sora)] text-sm ${
                        on
                          ? "bg-[var(--ts-teal)] text-white"
                          : "border border-[var(--ts-ink)]/15 text-[var(--ts-ink)]"
                      }`}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ) : null}

          {form.rule_type === "specific_dates" ? (
            <label className="block space-y-1">
              <span className="font-[family-name:var(--font-sora)] text-xs font-semibold uppercase tracking-wide text-[var(--ts-muted)]">
                Specific dates (YYYY-MM-DD, comma-separated)
              </span>
              <input
                value={form.specific_dates}
                disabled={!canWrite}
                onChange={(e) => patchForm({ specific_dates: e.target.value })}
                className="w-full rounded-lg border border-[var(--ts-ink)]/15 px-3 py-2 font-[family-name:var(--font-sora)] text-sm"
                placeholder="2026-10-21, 2026-10-28"
              />
            </label>
          ) : null}

          <label className="block space-y-1">
            <span className="font-[family-name:var(--font-sora)] text-xs font-semibold uppercase tracking-wide text-[var(--ts-muted)]">
              Session times (HH:MM, empty = all)
            </span>
            <input
              value={form.session_times}
              disabled={!canWrite}
              onChange={(e) => patchForm({ session_times: e.target.value })}
              className="w-full rounded-lg border border-[var(--ts-ink)]/15 px-3 py-2 font-[family-name:var(--font-sora)] text-sm"
              placeholder="14:00, 09:00"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block space-y-1">
              <span className="font-[family-name:var(--font-sora)] text-xs font-semibold uppercase tracking-wide text-[var(--ts-muted)]">
                Min Unsold Seats
              </span>
              <input
                type="number"
                min={1}
                required
                value={form.min_unsold_seats}
                disabled={!canWrite}
                onChange={(e) =>
                  patchForm({ min_unsold_seats: Number(e.target.value) })
                }
                className="w-full rounded-lg border border-[var(--ts-ink)]/15 px-3 py-2 font-[family-name:var(--font-sora)] text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="font-[family-name:var(--font-sora)] text-xs font-semibold uppercase tracking-wide text-[var(--ts-muted)]">
                Seat Cap (Optional)
              </span>
              <input
                value={form.seat_cap}
                disabled={!canWrite}
                onChange={(e) => patchForm({ seat_cap: e.target.value })}
                className="w-full rounded-lg border border-[var(--ts-ink)]/15 px-3 py-2 font-[family-name:var(--font-sora)] text-sm"
                placeholder="e.g. 4"
              />
            </label>
            <label className="block space-y-1">
              <span className="font-[family-name:var(--font-sora)] text-xs font-semibold uppercase tracking-wide text-[var(--ts-muted)]">
                Discount %
              </span>
              <input
                type="number"
                min={50}
                max={100}
                required
                value={form.percentage}
                disabled={!canWrite}
                onChange={(e) =>
                  patchForm({ percentage: Number(e.target.value) })
                }
                className="w-full rounded-lg border border-[var(--ts-ink)]/15 px-3 py-2 font-[family-name:var(--font-sora)] text-sm"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="font-[family-name:var(--font-sora)] text-xs font-semibold uppercase tracking-wide text-[var(--ts-muted)]">
                Booking System Price Option Id
              </span>
              <input
                required
                value={form.external_price_option_id}
                disabled={!canWrite}
                onChange={(e) =>
                  patchForm({ external_price_option_id: e.target.value })
                }
                className="w-full rounded-lg border border-[var(--ts-ink)]/15 px-3 py-2 font-[family-name:var(--font-sora)] text-sm"
                placeholder="po-kayak-adult"
              />
            </label>
            <label className="block space-y-1">
              <span className="font-[family-name:var(--font-sora)] text-xs font-semibold uppercase tracking-wide text-[var(--ts-muted)]">
                Discount Code
              </span>
              <input
                value={form.promo_code}
                disabled={!canWrite || form.discount_mechanism !== "promo_code"}
                onChange={(e) => patchForm({ promo_code: e.target.value })}
                className="w-full rounded-lg border border-[var(--ts-ink)]/15 px-3 py-2 font-[family-name:var(--font-sora)] text-sm uppercase"
                placeholder="LASTMINUTE55"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="font-[family-name:var(--font-sora)] text-xs font-semibold uppercase tracking-wide text-[var(--ts-muted)]">
                Start date
              </span>
              <input
                type="date"
                required
                value={form.start_date}
                disabled={!canWrite}
                onChange={(e) => patchForm({ start_date: e.target.value })}
                className="w-full rounded-lg border border-[var(--ts-ink)]/15 px-3 py-2 font-[family-name:var(--font-sora)] text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="font-[family-name:var(--font-sora)] text-xs font-semibold uppercase tracking-wide text-[var(--ts-muted)]">
                End date (optional)
              </span>
              <input
                type="date"
                value={form.end_date}
                disabled={!canWrite}
                onChange={(e) => patchForm({ end_date: e.target.value })}
                className="w-full rounded-lg border border-[var(--ts-ink)]/15 px-3 py-2 font-[family-name:var(--font-sora)] text-sm"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-ink)]">
              <input
                type="checkbox"
                checked={form.auto_publish}
                disabled={!canWrite}
                onChange={(e) => patchForm({ auto_publish: e.target.checked })}
              />
              Auto-publish generated deals
            </label>
            <label className="flex items-center gap-2 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-ink)]">
              <input
                type="checkbox"
                checked={form.is_active}
                disabled={!canWrite}
                onChange={(e) => patchForm({ is_active: e.target.checked })}
              />
              Active
            </label>
          </div>

          {canWrite ? (
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-[var(--ts-teal)] px-4 py-2.5 font-[family-name:var(--font-sora)] text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving ? "Saving…" : isNew ? "Create rule" : "Save rule"}
              </button>
              {!isNew ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void onPreviewOnly()}
                  className="rounded-xl border border-[var(--ts-ink)]/15 px-4 py-2.5 font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--ts-ink)]"
                >
                  Preview
                </button>
              ) : null}
            </div>
          ) : (
            <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
              Staff can view rules but not edit them.
            </p>
          )}
        </form>
      )}
    </div>
  );
}
