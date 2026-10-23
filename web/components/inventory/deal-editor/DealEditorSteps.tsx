"use client";

import { useEffect, useState } from "react";
import type { Deal } from "@/lib/marketplace/deal";
import type { DealMedia } from "@/lib/marketplace/deal-media";
import type {
  DealPriceOption,
  DealSession,
  DiscountStep,
} from "@/lib/marketplace/deal-session";
import type { FieldError } from "@/lib/marketplace/deal";
import type { ProviderContentValues } from "@/lib/marketplace/deal-integrated";
import {
  CONTENT_COUNTERS,
  charCounter,
  clientDealPriceFromPercentage,
  clientPriceRowStatus,
  dollarsToMinor,
  formatMinorAsDollars,
  minorToDollarsInput,
} from "@/lib/marketplace/deal-editor";
import { isIntegratedDealType } from "@/lib/marketplace/enums";
import {
  BOOKING_DESTINATION_TYPES,
  CANCELLATION_POLICY_TYPES,
  CATEGORIES,
  FITNESS_LEVELS,
  INTEGRATED_MECHANISMS,
  MANUAL_MECHANISMS,
  PRICE_OPTION_TYPES,
  type BookingDestinationType,
  type Category,
  type DealType,
  type DiscountInputMode,
  type DiscountMechanism,
  type FitnessLevel,
  type PriceOptionType,
} from "@/lib/marketplace/enums";
import {
  BOOKING_DESTINATION_LABELS,
  CANCELLATION_POLICY_LABELS,
  CAPACITY_MODE_LABELS,
  CATEGORY_LABELS,
  DEAL_TYPE_LABELS,
  DISCOUNT_INPUT_MODE_LABELS,
  DISCOUNT_MECHANISM_LABELS,
  FITNESS_LEVEL_LABELS,
  PRICE_OPTION_TYPE_LABELS,
  dealTypeLabel,
} from "@/lib/marketplace/display-labels";
import {
  formatDiscountVerificationStatusText,
  formatSeparateProductRef,
  parseSeparateProductRef,
  type DiscountVerification,
} from "@/lib/marketplace/deal-integrated-pricing-shared";
import type { DealProductPickerItem } from "@/lib/marketplace/operator-deals-client";
import type { NormalisedPriceOption } from "@/lib/marketplace/providers/types";
import { PLATFORM_REGIONS } from "@/lib/marketplace/settings";
import type { PublishValidationCheckKeyed } from "@/lib/marketplace/deal-publish-validation";
import type { PublishButtonLabel } from "@/lib/marketplace/deal-publish";

const fieldClass =
  "mt-1 w-full rounded-xl border border-[var(--ts-ink)]/15 bg-white px-3 py-2.5 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-ink)] outline-none focus:border-[var(--ts-teal)]";
const labelClass =
  "font-[family-name:var(--font-sora)] text-xs font-semibold uppercase tracking-wide text-[var(--ts-muted)]";

function FieldErrorText({
  field,
  errors,
}: {
  field: string;
  errors: FieldError[];
}) {
  const msg = errors.find((e) => e.field === field || e.field === field.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`));
  if (!msg) return null;
  return (
    <p className="mt-1 font-[family-name:var(--font-sora)] text-xs text-red-600">
      {msg.message}
    </p>
  );
}

function Counter({
  value,
  min,
  max,
}: {
  value: string;
  min: number;
  max: number;
}) {
  const c = charCounter(value, min, max);
  return (
    <span
      className={`font-[family-name:var(--font-sora)] text-xs ${
        c.ok || value.length === 0 ? "text-[var(--ts-muted)]" : "text-red-600"
      }`}
    >
      {c.label}
      {min > 0 ? ` (min ${min})` : ""}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Type
// ---------------------------------------------------------------------------

export type TemplateChoice = {
  id: string;
  name: string;
  deal_type: DealType | null;
};

export type ProductPickerItem = {
  id: string;
  provider: string;
  name: string;
  thumbnail_url: string | null;
  price_min_minor: number | null;
  price_max_minor: number | null;
  currency: string | null;
  sessions_next_72h: number;
};

function formatPickerPrice(p: ProductPickerItem): string {
  if (p.price_min_minor == null) return "—";
  const cur = p.currency ?? "NZD";
  const min = (p.price_min_minor / 100).toFixed(2);
  if (p.price_max_minor != null && p.price_max_minor !== p.price_min_minor) {
    const max = (p.price_max_minor / 100).toFixed(2);
    return `${cur} ${min}–${max}`;
  }
  return `${cur} ${min}`;
}

export function TypeStep({
  deal,
  creating,
  onCreate,
  onCreateIntegrated,
  onDuplicate,
  onCreateFromTemplate,
  templates,
  hasConnectedIntegration,
  products,
  productsLoading,
}: {
  deal: Deal | null;
  creating: boolean;
  onCreate: (dealType: DealType) => void;
  onCreateIntegrated?: (
    dealType: "integrated_session" | "integrated_multi_session",
    productId: string
  ) => void;
  onDuplicate: () => void;
  onCreateFromTemplate?: (templateId: string) => void;
  templates?: TemplateChoice[];
  hasConnectedIntegration: boolean;
  products?: ProductPickerItem[];
  productsLoading?: boolean;
}) {
  const [pendingIntegrated, setPendingIntegrated] = useState<
    "integrated_session" | "integrated_multi_session" | null
  >(null);
  const [productSearch, setProductSearch] = useState("");

  const filteredProducts = (products ?? []).filter((p) => {
    if (!productSearch.trim()) return true;
    return p.name.toLowerCase().includes(productSearch.trim().toLowerCase());
  });

  return (
    <div className="space-y-4">
      <h3 className="font-[family-name:var(--font-instrument)] text-2xl text-[var(--ts-ink)]">
        Deal Type
      </h3>
      <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
        You can enter deals yourself today. Deals from a booking system need a
        connected system and an enabled product.
      </p>

      {deal ? (
        <div className="rounded-xl border border-[var(--ts-ink)]/10 bg-[var(--ts-mist)]/60 px-4 py-3">
          <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-ink)]">
            Type:{" "}
            <span className="font-semibold">
              {dealTypeLabel(deal.dealType)}
            </span>
          </p>
          <p className="mt-1 text-xs text-[var(--ts-muted)]">
            Source: {deal.sourceProvider}
            {deal.externalProductId ? " · linked product" : ""}
          </p>
          <button
            type="button"
            onClick={onDuplicate}
            className="mt-3 rounded-lg border border-[var(--ts-ink)]/15 bg-white px-3 py-2 text-sm font-medium text-[var(--ts-ink)]"
          >
            Duplicate As New Draft
          </button>
        </div>
      ) : pendingIntegrated ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--ts-ink)]">
              Choose A Product
              <span className="ml-2 font-normal text-[var(--ts-muted)]">
                ({dealTypeLabel(pendingIntegrated)})
              </span>
            </p>
            <button
              type="button"
              className="text-sm font-medium text-[var(--ts-teal)] underline"
              onClick={() => {
                setPendingIntegrated(null);
                setProductSearch("");
              }}
            >
              Back
            </button>
          </div>
          <input
            type="search"
            placeholder="Search products…"
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            className={fieldClass}
          />
          {productsLoading ? (
            <p className="text-sm text-[var(--ts-muted)]">Loading products…</p>
          ) : filteredProducts.length === 0 ? (
            <p className="text-sm text-[var(--ts-muted)]">
              No enabled products. Enable products in{" "}
              <a
                href="/account/settings/integrations"
                className="font-semibold text-[var(--ts-teal)] underline"
              >
                Integration settings
              </a>
              .
            </p>
          ) : (
            <ul className="max-h-80 space-y-2 overflow-y-auto">
              {filteredProducts.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={creating}
                    onClick={() =>
                      onCreateIntegrated?.(pendingIntegrated, p.id)
                    }
                    className="flex w-full items-center gap-3 rounded-xl border border-[var(--ts-ink)]/10 bg-white px-3 py-2.5 text-left hover:border-[var(--ts-teal)] disabled:opacity-60"
                  >
                    {p.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.thumbnail_url}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--ts-mist)] text-xs text-[var(--ts-muted)]">
                        —
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--ts-ink)]">
                        {p.name}
                      </p>
                      <p className="text-xs text-[var(--ts-muted)]">
                        {p.provider} · {formatPickerPrice(p)}
                        {p.sessions_next_72h > 0
                          ? ` · ${p.sessions_next_72h} sessions`
                          : ""}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              {
                type: "manual_session" as const,
                title: DEAL_TYPE_LABELS.manual_session,
                blurb: "Fixed departure times you enter yourself.",
                enabled: true,
              },
              {
                type: "manual_open_window" as const,
                title: DEAL_TYPE_LABELS.manual_open_window,
                blurb: "Flexible days (rentals, accommodation).",
                enabled: true,
              },
              {
                type: "integrated_session" as const,
                title: DEAL_TYPE_LABELS.integrated_session,
                blurb: "Live from Rezdy or another booking system.",
                enabled: hasConnectedIntegration,
              },
              {
                type: "integrated_multi_session" as const,
                title: DEAL_TYPE_LABELS.integrated_multi_session,
                blurb: "Several booking-system departures as one deal.",
                enabled: hasConnectedIntegration,
              },
            ] as const
          ).map((opt) => (
            <button
              key={opt.type}
              type="button"
              disabled={!opt.enabled || creating}
              onClick={() => {
                if (
                  opt.type === "integrated_session" ||
                  opt.type === "integrated_multi_session"
                ) {
                  setPendingIntegrated(opt.type);
                  return;
                }
                onCreate(opt.type);
              }}
              className={`rounded-2xl border px-4 py-4 text-left transition ${
                opt.enabled
                  ? "border-[var(--ts-ink)]/15 bg-white hover:border-[var(--ts-teal)]"
                  : "cursor-not-allowed border-dashed border-[var(--ts-ink)]/10 bg-[var(--ts-mist)]/40 opacity-70"
              }`}
            >
              <p className="font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--ts-ink)]">
                {opt.title}
              </p>
              <p className="mt-1 text-xs text-[var(--ts-muted)]">{opt.blurb}</p>
              {!opt.enabled && (
                <p className="mt-2 text-xs font-medium text-[var(--ts-teal)] underline">
                  Connect A Booking System In Settings
                </p>
              )}
            </button>
          ))}
        </div>
      )}

      {!deal && !pendingIntegrated && templates && templates.length > 0 && onCreateFromTemplate ? (
        <div className="space-y-2 rounded-2xl border border-[var(--ts-ink)]/10 bg-[var(--ts-mist)]/40 px-4 py-4">
          <p className="font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--ts-ink)]">
            Start from a template
          </p>
          <p className="font-[family-name:var(--font-sora)] text-xs text-[var(--ts-muted)]">
            Copies content, images, pricing and booking destination — not
            sessions.
          </p>
          <ul className="space-y-2">
            {templates.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-ink)]">
                  {t.name}
                  {t.deal_type ? (
                    <span className="ml-2 text-xs text-[var(--ts-muted)]">
                      ({dealTypeLabel(t.deal_type)})
                    </span>
                  ) : null}
                </span>
                <button
                  type="button"
                  disabled={creating}
                  onClick={() => onCreateFromTemplate(t.id)}
                  className="rounded-lg border border-[var(--ts-ink)]/15 bg-white px-3 py-1.5 text-sm font-medium text-[var(--ts-ink)] disabled:opacity-60"
                >
                  Use template
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!deal && !hasConnectedIntegration && (
        <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
          Need a booking system?{" "}
          <a
            href="/account/settings/integrations"
            className="font-semibold text-[var(--ts-teal)] underline"
          >
            Connect an integration in Settings
          </a>
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Content
// ---------------------------------------------------------------------------

function ProviderFieldBadge({
  field,
  providerLabel,
  overridden,
  providerValue,
  onRevert,
}: {
  field: string;
  providerLabel: string;
  overridden: boolean;
  providerValue: string | number | null | undefined;
  onRevert?: (field: string) => void;
}) {
  if (!overridden) {
    return (
      <span className="font-[family-name:var(--font-sora)] text-[10px] font-semibold uppercase tracking-wide text-[var(--ts-teal)]">
        From {providerLabel}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-[family-name:var(--font-sora)] text-[10px] font-semibold uppercase tracking-wide text-amber-700">
        Overridden
      </span>
      {onRevert ? (
        <button
          type="button"
          className="font-[family-name:var(--font-sora)] text-[10px] font-semibold text-[var(--ts-teal)] underline"
          title={
            providerValue != null && providerValue !== ""
              ? `Restore: ${String(providerValue).slice(0, 80)}`
              : "Restore provider value"
          }
          onClick={() => onRevert(field)}
        >
          Revert
        </button>
      ) : null}
    </span>
  );
}

export function ContentStep({
  deal,
  errors,
  onChange,
  providerValues,
  overriddenFields,
  onRevertField,
}: {
  deal: Deal;
  errors: FieldError[];
  onChange: (patch: Record<string, unknown>) => void;
  providerValues?: ProviderContentValues | null;
  overriddenFields?: string[];
  onRevertField?: (field: string) => void;
}) {
  const title = deal.title ?? "";
  const summary = deal.summary ?? "";
  const description = deal.description ?? "";
  const showProvider =
    isIntegratedDealType(deal.dealType) && providerValues != null;
  const overridden = new Set(overriddenFields ?? deal.overriddenFields ?? []);
  const providerLabel =
    deal.sourceProvider && deal.sourceProvider !== "manual"
      ? deal.sourceProvider.charAt(0).toUpperCase() +
        deal.sourceProvider.slice(1)
      : "provider";

  const badge = (
    field: keyof ProviderContentValues,
    value: string | number | null | undefined
  ) =>
    showProvider ? (
      <ProviderFieldBadge
        field={field}
        providerLabel={providerLabel}
        overridden={overridden.has(field)}
        providerValue={value}
        onRevert={onRevertField}
      />
    ) : null;

  return (
    <div className="space-y-4">
      <h3 className="font-[family-name:var(--font-instrument)] text-2xl text-[var(--ts-ink)]">
        Content
      </h3>
      {showProvider ? (
        <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
          Fields from {providerLabel} stay in sync until you edit them. Use
          Revert to restore the provider value.
        </p>
      ) : null}

      <div>
        <div className="flex items-center justify-between gap-2">
          <label className={labelClass} htmlFor="deal-title">
            Title
          </label>
          <div className="flex items-center gap-2">
            {badge("title", providerValues?.title)}
            <Counter
              value={title}
              min={CONTENT_COUNTERS.title.min}
              max={CONTENT_COUNTERS.title.max}
            />
          </div>
        </div>
        <input
          id="deal-title"
          className={fieldClass}
          value={title}
          maxLength={CONTENT_COUNTERS.title.max}
          onChange={(e) => onChange({ title: e.target.value })}
        />
        <FieldErrorText field="title" errors={errors} />
      </div>

      <div>
        <div className="flex items-center justify-between gap-2">
          <label className={labelClass} htmlFor="deal-summary">
            Summary
          </label>
          <div className="flex items-center gap-2">
            {badge("summary", providerValues?.summary)}
            <Counter
              value={summary}
              min={CONTENT_COUNTERS.summary.min}
              max={CONTENT_COUNTERS.summary.max}
            />
          </div>
        </div>
        <textarea
          id="deal-summary"
          className={fieldClass}
          rows={2}
          value={summary}
          maxLength={CONTENT_COUNTERS.summary.max}
          onChange={(e) => onChange({ summary: e.target.value })}
        />
        <FieldErrorText field="summary" errors={errors} />
      </div>

      <div>
        <div className="flex items-center justify-between gap-2">
          <label className={labelClass} htmlFor="deal-description">
            Description
          </label>
          <div className="flex items-center gap-2">
            {badge("description", providerValues?.description)}
            <Counter
              value={description}
              min={CONTENT_COUNTERS.description.min}
              max={CONTENT_COUNTERS.description.max}
            />
          </div>
        </div>
        <textarea
          id="deal-description"
          className={fieldClass}
          rows={6}
          value={description}
          onChange={(e) => onChange({ description: e.target.value })}
        />
        <FieldErrorText field="description" errors={errors} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="deal-category">
            Category
          </label>
          <select
            id="deal-category"
            className={fieldClass}
            value={deal.category ?? ""}
            onChange={(e) =>
              onChange({
                category: (e.target.value || null) as Category | null,
              })
            }
          >
            <option value="">Select…</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
          <FieldErrorText field="category" errors={errors} />
        </div>
        <div>
          <label className={labelClass} htmlFor="deal-region">
            Region
          </label>
          <select
            id="deal-region"
            className={fieldClass}
            value={deal.region ?? ""}
            onChange={(e) => onChange({ region: e.target.value || null })}
          >
            <option value="">Select…</option>
            {PLATFORM_REGIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <FieldErrorText field="region" errors={errors} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="deal-location">
            Location name
          </label>
          <input
            id="deal-location"
            className={fieldClass}
            value={deal.locationName ?? ""}
            onChange={(e) => onChange({ location_name: e.target.value })}
          />
          <FieldErrorText field="location_name" errors={errors} />
        </div>
        <div>
          <label className={labelClass} htmlFor="deal-address">
            Address
          </label>
          <input
            id="deal-address"
            className={fieldClass}
            value={deal.address ?? ""}
            onChange={(e) => onChange({ address: e.target.value })}
          />
          <FieldErrorText field="address" errors={errors} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="deal-lat">
            Latitude
          </label>
          <input
            id="deal-lat"
            type="number"
            step="any"
            className={fieldClass}
            value={deal.latitude ?? ""}
            onChange={(e) =>
              onChange({
                latitude: e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="deal-lng">
            Longitude
          </label>
          <input
            id="deal-lng"
            type="number"
            step="any"
            className={fieldClass}
            value={deal.longitude ?? ""}
            onChange={(e) =>
              onChange({
                longitude:
                  e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="deal-duration">
            Duration (minutes)
          </label>
          <input
            id="deal-duration"
            type="number"
            className={fieldClass}
            value={deal.durationMinutes ?? ""}
            onChange={(e) =>
              onChange({
                duration_minutes:
                  e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="deal-languages">
            Languages (comma-separated ISO codes)
          </label>
          <input
            id="deal-languages"
            className={fieldClass}
            value={(deal.languages ?? []).join(", ")}
            onChange={(e) =>
              onChange({
                languages: e.target.value
                  .split(",")
                  .map((s) => s.trim().toLowerCase())
                  .filter(Boolean),
              })
            }
            placeholder="en"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="deal-cancel-type">
            Cancellation policy
          </label>
          <select
            id="deal-cancel-type"
            className={fieldClass}
            value={deal.cancellationPolicyType ?? ""}
            onChange={(e) =>
              onChange({
                cancellation_policy_type: e.target.value || null,
              })
            }
          >
            <option value="">Select…</option>
            {CANCELLATION_POLICY_TYPES.map((c) => (
              <option key={c} value={c}>
                {CANCELLATION_POLICY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="deal-fitness">
            Fitness Level
          </label>
          <select
            id="deal-fitness"
            className={fieldClass}
            value={deal.fitnessLevel ?? ""}
            onChange={(e) =>
              onChange({
                fitness_level: (e.target.value ||
                  null) as FitnessLevel | null,
              })
            }
          >
            <option value="">Optional…</option>
            {FITNESS_LEVELS.map((f) => (
              <option key={f} value={f}>
                {FITNESS_LEVEL_LABELS[f]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {deal.cancellationPolicyType === "custom" && (
        <div>
          <label className={labelClass} htmlFor="deal-cancel-text">
            Custom cancellation text
          </label>
          <textarea
            id="deal-cancel-text"
            className={fieldClass}
            rows={3}
            value={deal.cancellationPolicyText ?? ""}
            onChange={(e) =>
              onChange({ cancellation_policy_text: e.target.value })
            }
          />
        </div>
      )}

      <label className="flex items-center gap-2 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-ink)]">
        <input
          type="checkbox"
          checked={deal.pickupAvailable === true}
          onChange={(e) => onChange({ pickup_available: e.target.checked })}
        />
        Pickup available
      </label>
      {deal.pickupAvailable && (
        <div>
          <label className={labelClass} htmlFor="deal-pickup">
            Pickup notes
          </label>
          <textarea
            id="deal-pickup"
            className={fieldClass}
            rows={2}
            value={deal.pickupNotes ?? ""}
            onChange={(e) => onChange({ pickup_notes: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Images
// ---------------------------------------------------------------------------

export function ImagesStep({
  media,
  busy,
  onUpload,
  onEmbed,
  onSetCover,
  onDelete,
  onPatchAlt,
  onImportProvider,
  canImportProvider,
}: {
  media: DealMedia[];
  busy: boolean;
  onUpload: (files: FileList | null) => void;
  onEmbed: (url: string) => void;
  onSetCover: (mediaId: string) => void;
  onDelete: (mediaId: string) => void;
  onPatchAlt: (mediaId: string, alt: string) => void;
  onImportProvider?: () => void;
  canImportProvider?: boolean;
}) {
  return (
    <div className="space-y-4">
      <h3 className="font-[family-name:var(--font-instrument)] text-2xl text-[var(--ts-ink)]">
        Images
      </h3>
      <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
        JPG/PNG/WebP, min 1200×800, max 12 images. Exactly one cover.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={busy}
          onChange={(e) => onUpload(e.target.files)}
          className="block font-[family-name:var(--font-sora)] text-sm"
        />
        {canImportProvider && onImportProvider ? (
          <button
            type="button"
            disabled={busy}
            onClick={onImportProvider}
            className="rounded-xl border border-[var(--ts-ink)]/15 bg-white px-3 py-2 text-sm font-medium disabled:opacity-60"
          >
            Import from provider
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          id="video-embed-url"
          placeholder="YouTube or Vimeo URL"
          className={`${fieldClass} max-w-md`}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const el = e.currentTarget;
              if (el.value.trim()) onEmbed(el.value.trim());
            }
          }}
        />
        <button
          type="button"
          disabled={busy}
          className="rounded-xl border border-[var(--ts-ink)]/15 bg-white px-3 py-2 text-sm font-medium"
          onClick={() => {
            const el = document.getElementById(
              "video-embed-url"
            ) as HTMLInputElement | null;
            if (el?.value.trim()) onEmbed(el.value.trim());
          }}
        >
          Add video
        </button>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {media.map((m) => (
          <li
            key={m.id}
            className="rounded-xl border border-[var(--ts-ink)]/10 bg-white p-3"
          >
            {m.mediaType === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={m.url}
                alt={m.altText || ""}
                className="h-32 w-full rounded-lg object-cover"
              />
            ) : (
              <p className="text-xs text-[var(--ts-muted)]">Video: {m.url}</p>
            )}
            <input
              className={`${fieldClass} mt-2`}
              value={m.altText ?? ""}
              placeholder="Alt text (5–150)"
              onChange={(e) => onPatchAlt(m.id, e.target.value)}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={m.isCover}
                onClick={() => onSetCover(m.id)}
                className="rounded-lg bg-[var(--ts-mist)] px-2 py-1 text-xs font-semibold disabled:opacity-50"
              >
                {m.isCover ? "Cover" : "Set cover"}
              </button>
              <button
                type="button"
                onClick={() => onDelete(m.id)}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-red-700"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — Pricing
// ---------------------------------------------------------------------------

export function PricingStep({
  deal,
  options,
  discountSteps = [],
  providerPriceOptions = null,
  discountVerification = null,
  separateProducts = [],
  onPatchDeal,
  onAddOption,
  onUpdateOption,
  onDeleteOption,
  onAddStep,
  onUpdateStep,
  onDeleteStep,
  onVerifyDiscount,
}: {
  deal: Deal;
  options: DealPriceOption[];
  discountSteps?: DiscountStep[];
  providerPriceOptions?: NormalisedPriceOption[] | null;
  discountVerification?: DiscountVerification | null;
  /** Other enabled products on the same integration (separate_product). */
  separateProducts?: DealProductPickerItem[];
  onPatchDeal: (patch: Record<string, unknown>) => void;
  onAddOption: (body: Record<string, unknown>) => void;
  onUpdateOption: (id: string, body: Record<string, unknown>) => void;
  onDeleteOption: (id: string) => void;
  onAddStep?: (body: Record<string, unknown>) => void;
  onUpdateStep?: (id: string, body: Record<string, unknown>) => void;
  onDeleteStep?: (id: string) => void;
  onVerifyDiscount?: (opts?: {
    promo_code_confirmed_by_operator?: boolean;
  }) => void;
}) {
  const integrated = isIntegratedDealType(deal.dealType);
  const mode = (deal.discountInputMode ?? "deal_price") as DiscountInputMode;
  const mechanisms = integrated ? INTEGRATED_MECHANISMS : MANUAL_MECHANISMS;
  const defaultMechanism = integrated ? "promo_code" : "manual_price";
  const verification =
    discountVerification ?? deal.discountVerification ?? null;
  const providerName = deal.sourceProvider === "manual" ? "provider" : deal.sourceProvider;
  const statusText = formatDiscountVerificationStatusText(
    providerName,
    verification?.status
  );

  const optionVerifyMsg = (optionId: string) =>
    verification?.options.find((o) => o.price_option_id === optionId);

  return (
    <div className="space-y-4">
      <h3 className="font-[family-name:var(--font-instrument)] text-2xl text-[var(--ts-ink)]">
        Pricing
      </h3>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>How The Discount Works</label>
          <select
            className={fieldClass}
            value={deal.discountMechanism ?? defaultMechanism}
            onChange={(e) =>
              onPatchDeal({
                discount_mechanism: e.target.value as DiscountMechanism,
              })
            }
          >
            {mechanisms.map((m) => (
              <option key={m} value={m}>
                {DISCOUNT_MECHANISM_LABELS[m]}
              </option>
            ))}
          </select>
        </div>
        {(deal.discountMechanism === "promo_code" ||
          deal.discountMechanism === "manual_price" ||
          deal.discountMechanism === "quote_code" ||
          !integrated) && (
          <div>
            <label className={labelClass}>How You Enter The Price</label>
            <select
              className={fieldClass}
              value={mode}
              onChange={(e) =>
                onPatchDeal({
                  discount_input_mode: e.target.value as DiscountInputMode,
                })
              }
            >
              <option value="deal_price">
                {DISCOUNT_INPUT_MODE_LABELS.deal_price}
              </option>
              <option value="percentage">
                {DISCOUNT_INPUT_MODE_LABELS.percentage}
              </option>
            </select>
          </div>
        )}
      </div>

      {(deal.discountMechanism === "quote_code" ||
        deal.discountMechanism === "promo_code") && (
        <div>
          <label className={labelClass}>Discount Or Quote Code</label>
          <input
            className={fieldClass}
            value={deal.promoCode ?? ""}
            onChange={(e) =>
              onPatchDeal({
                promo_code: e.target.value.toUpperCase().replace(/\s/g, ""),
              })
            }
          />
        </div>
      )}

      {integrated && (
        <div className="rounded-xl border border-[var(--ts-ink)]/10 bg-white/60 px-4 py-3">
          <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-ink)]">
            Verification:{" "}
            <span className="font-semibold">{statusText}</span>
          </p>
          {verification?.options.map((o) =>
            o.message ? (
              <p
                key={o.price_option_id}
                className="mt-1 text-xs text-[var(--ts-muted)]"
              >
                {o.message}
              </p>
            ) : null
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="rounded-xl bg-[var(--ts-teal)] px-4 py-2 text-sm font-semibold text-white"
              onClick={() => onVerifyDiscount?.()}
            >
              Verify discount
            </button>
            {verification?.status === "cannot_verify" && (
              <label className="flex items-center gap-2 text-sm text-[var(--ts-ink)]">
                <input
                  type="checkbox"
                  checked={deal.promoCodeConfirmedByOperator}
                  onChange={(e) => {
                    onPatchDeal({
                      promo_code_confirmed_by_operator: e.target.checked,
                    });
                    if (e.target.checked) {
                      onVerifyDiscount?.({
                        promo_code_confirmed_by_operator: true,
                      });
                    }
                  }}
                />
                This code exists in my booking system
              </label>
            )}
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full text-left font-[family-name:var(--font-sora)] text-sm">
          <thead>
            <tr className="border-b border-[var(--ts-ink)]/10 text-xs uppercase tracking-wide text-[var(--ts-muted)]">
              <th className="py-2 pr-2">Label</th>
              <th className="py-2 pr-2">Type</th>
              <th className="py-2 pr-2">Original</th>
              {integrated && deal.discountMechanism === "price_option" && (
                <th className="py-2 pr-2">Discounted option</th>
              )}
              {integrated && deal.discountMechanism === "separate_product" && (
                <th className="py-2 pr-2">Deal product</th>
              )}
              <th className="py-2 pr-2">
                {mode === "percentage" &&
                deal.discountMechanism === "promo_code"
                  ? "% off"
                  : "Deal"}
              </th>
              <th className="py-2 pr-2">Discount</th>
              {!integrated && <th className="py-2 pr-2">Evidence URL</th>}
              {integrated && <th className="py-2 pr-2">Status</th>}
              {!integrated && <th className="py-2" />}
            </tr>
          </thead>
          <tbody>
            {options.map((opt) => {
              const status = clientPriceRowStatus(
                opt.originalPriceMinor,
                opt.dealPriceMinor
              );
              const v = optionVerifyMsg(opt.id);
              const dealPriceReadOnly =
                integrated &&
                (deal.discountMechanism === "price_option" ||
                  deal.discountMechanism === "separate_product");
              return (
                <tr key={opt.id} className="border-b border-[var(--ts-ink)]/5">
                  <td className="py-2 pr-2">
                    {integrated ? (
                      <span>{opt.label}</span>
                    ) : (
                      <input
                        className={fieldClass}
                        value={opt.label}
                        onChange={(e) =>
                          onUpdateOption(opt.id, { label: e.target.value })
                        }
                      />
                    )}
                  </td>
                  <td className="py-2 pr-2">
                    {integrated ? (
                      <span>{opt.type}</span>
                    ) : (
                      <select
                        className={fieldClass}
                        value={opt.type}
                        onChange={(e) =>
                          onUpdateOption(opt.id, {
                            type: e.target.value as PriceOptionType,
                          })
                        }
                      >
                        {PRICE_OPTION_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {PRICE_OPTION_TYPE_LABELS[t]}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="py-2 pr-2">
                    {integrated ? (
                      <span className="text-[var(--ts-muted)]">
                        {minorToDollarsInput(opt.originalPriceMinor)}
                        <span className="ml-1 text-xs">(from provider)</span>
                      </span>
                    ) : (
                      <input
                        className={fieldClass}
                        value={minorToDollarsInput(opt.originalPriceMinor)}
                        onChange={(e) => {
                          const minor = dollarsToMinor(e.target.value);
                          if (minor == null) return;
                          onUpdateOption(opt.id, {
                            original_price_minor: minor,
                          });
                        }}
                      />
                    )}
                  </td>
                  {integrated && deal.discountMechanism === "price_option" && (
                    <td className="py-2 pr-2">
                      <select
                        className={fieldClass}
                        value={opt.externalDealPriceOptionId ?? ""}
                        onChange={(e) =>
                          onUpdateOption(opt.id, {
                            external_deal_price_option_id:
                              e.target.value || null,
                          })
                        }
                      >
                        <option value="">Select…</option>
                        {(providerPriceOptions ?? [])
                          .filter(
                            (p) => p.external_id !== opt.externalPriceOptionId
                          )
                          .map((p) => (
                            <option key={p.external_id} value={p.external_id}>
                              {p.label} ({formatMinorAsDollars(p.price_minor)})
                            </option>
                          ))}
                      </select>
                    </td>
                  )}
                  {integrated &&
                    deal.discountMechanism === "separate_product" && (
                      <td className="py-2 pr-2">
                        <select
                          className={fieldClass}
                          value={
                            parseSeparateProductRef(
                              opt.externalDealPriceOptionId
                            ) ?? ""
                          }
                          onChange={(e) =>
                            onUpdateOption(opt.id, {
                              external_deal_price_option_id: e.target.value
                                ? formatSeparateProductRef(e.target.value)
                                : null,
                            })
                          }
                        >
                          <option value="">Select…</option>
                          {separateProducts
                            .filter((p) => p.id !== deal.externalProductId)
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                        </select>
                      </td>
                    )}
                  <td className="py-2 pr-2">
                    {dealPriceReadOnly ? (
                      <span>{minorToDollarsInput(opt.dealPriceMinor)}</span>
                    ) : mode === "percentage" ? (
                      <input
                        className={fieldClass}
                        defaultValue={String(status.discountPct ?? 50)}
                        onBlur={(e) => {
                          const pct = Number(e.target.value);
                          if (!Number.isFinite(pct)) return;
                          onUpdateOption(opt.id, {
                            percentage: pct,
                            deal_price_minor: clientDealPriceFromPercentage(
                              opt.originalPriceMinor,
                              pct
                            ),
                          });
                        }}
                      />
                    ) : (
                      <input
                        className={fieldClass}
                        value={minorToDollarsInput(opt.dealPriceMinor)}
                        onChange={(e) => {
                          const minor = dollarsToMinor(e.target.value);
                          if (minor == null) return;
                          onUpdateOption(opt.id, {
                            deal_price_minor: minor,
                          });
                        }}
                      />
                    )}
                  </td>
                  <td className="py-2 pr-2">
                    <span
                      className={
                        status.passes
                          ? "font-semibold text-[var(--ts-teal)]"
                          : "font-semibold text-red-600"
                      }
                    >
                      {status.discountPct != null
                        ? `${status.discountPct}%`
                        : "—"}{" "}
                      {status.passes ? "✓" : "✗"}
                    </span>
                    {!status.passes && (
                      <p className="text-xs text-red-600">
                        Max {formatMinorAsDollars(status.maxDealPriceMinor)}
                      </p>
                    )}
                  </td>
                  {!integrated && (
                    <td className="py-2 pr-2">
                      <input
                        className={fieldClass}
                        value={opt.originalPriceEvidenceUrl ?? ""}
                        placeholder="https://…"
                        onChange={(e) =>
                          onUpdateOption(opt.id, {
                            original_price_evidence_url: e.target.value,
                          })
                        }
                      />
                    </td>
                  )}
                  {integrated && (
                    <td className="py-2 pr-2 text-xs text-[var(--ts-muted)]">
                      {v
                        ? formatDiscountVerificationStatusText(
                            providerName,
                            v.status
                          )
                        : "—"}
                    </td>
                  )}
                  {!integrated && (
                    <td className="py-2">
                      <button
                        type="button"
                        className="text-xs font-semibold text-red-700"
                        onClick={() => onDeleteOption(opt.id)}
                      >
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!integrated && (
        <button
          type="button"
          className="rounded-xl bg-[var(--ts-teal)] px-4 py-2.5 text-sm font-semibold text-white"
          onClick={() =>
            onAddOption({
              label: "Adult",
              type: "adult",
              original_price_minor: 20000,
              deal_price_minor: 9000,
              original_price_evidence_url: "https://example.com/prices",
            })
          }
        >
          Add price option
        </button>
      )}

      <div className="rounded-xl border border-[var(--ts-ink)]/10 bg-white/50 px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--ts-ink)]">
              Stepped discount timeline
            </h4>
            <p className="mt-1 text-xs text-[var(--ts-muted)]">
              Deepen the discount as departure approaches (still ≥50% off).
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-[var(--ts-ink)]">
            <input
              type="checkbox"
              checked={deal.steppedDiscountEnabled}
              onChange={(e) =>
                onPatchDeal({ stepped_discount_enabled: e.target.checked })
              }
            />
            Enable stepped discounts
          </label>
        </div>

        {deal.steppedDiscountEnabled &&
          options.map((opt) => {
            const optionSteps = discountSteps
              .filter((s) => s.priceOptionId === opt.id)
              .sort((a, b) => b.hoursBeforeStart - a.hoursBeforeStart);
            return (
              <div key={opt.id} className="mt-4 border-t border-[var(--ts-ink)]/10 pt-4">
                <p className="font-[family-name:var(--font-sora)] text-xs font-semibold uppercase tracking-wide text-[var(--ts-muted)]">
                  {opt.label || "Option"} — base{" "}
                  {formatMinorAsDollars(opt.dealPriceMinor)}
                </p>
                <ol className="mt-3 space-y-3">
                  {optionSteps.map((step) => {
                    const status = clientPriceRowStatus(
                      opt.originalPriceMinor,
                      step.dealPriceMinor
                    );
                    return (
                      <li
                        key={step.id}
                        className="grid gap-2 sm:grid-cols-[7rem_7rem_1fr_auto] sm:items-end"
                      >
                        <div>
                          <label className={labelClass}>Hours before</label>
                          <input
                            className={fieldClass}
                            type="number"
                            min={1}
                            max={72}
                            value={step.hoursBeforeStart}
                            onChange={(e) => {
                              const n = Number(e.target.value);
                              if (!Number.isInteger(n)) return;
                              onUpdateStep?.(step.id, {
                                hours_before_start: n,
                              });
                            }}
                          />
                        </div>
                        <div>
                          <label className={labelClass}>Deal price</label>
                          <input
                            className={fieldClass}
                            value={minorToDollarsInput(step.dealPriceMinor)}
                            onChange={(e) => {
                              const minor = dollarsToMinor(e.target.value);
                              if (minor == null) return;
                              onUpdateStep?.(step.id, {
                                deal_price_minor: minor,
                              });
                            }}
                          />
                        </div>
                        {(deal.discountMechanism === "promo_code" ||
                          deal.discountMechanism === "quote_code" ||
                          !integrated) && (
                          <div>
                            <label className={labelClass}>Step promo code</label>
                            <input
                              className={fieldClass}
                              value={step.promoCode ?? ""}
                              onChange={(e) =>
                                onUpdateStep?.(step.id, {
                                  promo_code: e.target.value
                                    .toUpperCase()
                                    .replace(/\s/g, ""),
                                })
                              }
                            />
                          </div>
                        )}
                        {integrated &&
                          deal.discountMechanism === "price_option" && (
                            <div>
                              <label className={labelClass}>
                                Provider discounted option
                              </label>
                              <select
                                className={fieldClass}
                                value={step.externalDealPriceOptionId ?? ""}
                                onChange={(e) => {
                                  const extId = e.target.value || null;
                                  const provider = (
                                    providerPriceOptions ?? []
                                  ).find((p) => p.external_id === extId);
                                  onUpdateStep?.(step.id, {
                                    external_deal_price_option_id: extId,
                                    ...(provider
                                      ? {
                                          deal_price_minor: provider.price_minor,
                                        }
                                      : {}),
                                  });
                                }}
                              >
                                <option value="">Select…</option>
                                {(providerPriceOptions ?? []).map((p) => (
                                  <option key={p.external_id} value={p.external_id}>
                                    {p.label} — {formatMinorAsDollars(p.price_minor)}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        <div className="flex items-center gap-3 pb-2">
                          <span
                            className={`text-xs font-semibold ${
                              status.passes
                                ? "text-emerald-700"
                                : "text-red-700"
                            }`}
                          >
                            {status.discountPct != null
                              ? `${status.discountPct}%`
                              : "—"}
                          </span>
                          <button
                            type="button"
                            className="text-xs font-semibold text-red-700"
                            onClick={() => onDeleteStep?.(step.id)}
                          >
                            Remove
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ol>
                <button
                  type="button"
                  className="mt-3 rounded-xl border border-[var(--ts-ink)]/15 bg-white px-3 py-2 text-xs font-semibold text-[var(--ts-ink)]"
                  onClick={() => {
                    const deeper =
                      optionSteps.length > 0
                        ? Math.max(
                            1,
                            Math.min(
                              ...optionSteps.map((s) => s.hoursBeforeStart)
                            ) - 6
                          )
                        : 72;
                    const nextPrice =
                      optionSteps.length > 0
                        ? Math.max(
                            0,
                            Math.min(...optionSteps.map((s) => s.dealPriceMinor)) -
                              Math.floor(opt.originalPriceMinor * 0.1)
                          )
                        : opt.dealPriceMinor;
                    onAddStep?.({
                      price_option_id: opt.id,
                      hours_before_start: deeper,
                      deal_price_minor: nextPrice,
                      promo_code:
                        deal.discountMechanism === "promo_code" ||
                        deal.discountMechanism === "quote_code"
                          ? `${(deal.promoCode ?? "STEP").slice(0, 20)}${deeper}`
                          : undefined,
                      external_deal_price_option_id:
                        deal.discountMechanism === "price_option"
                          ? opt.externalDealPriceOptionId
                          : undefined,
                    });
                  }}
                >
                  Add step
                </button>
              </div>
            );
          })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 5 — Availability
// ---------------------------------------------------------------------------

export type AvailableSessionRow = {
  id: string;
  external_id: string;
  start_at: string;
  end_at: string | null;
  seats_available: number | null;
  status: string;
  last_synced_at: string | null;
  selected: boolean;
  deal_session_id: string | null;
  seat_cap: number | null;
  seats_displayed: number | null;
};

export function AvailabilityStep({
  deal,
  sessions,
  availableSessions = null,
  capacityNote = null,
  onPatchDeal,
  onAddSession,
  onUpdateSession,
  onDeleteSession,
  onSelectIntegratedSessions,
}: {
  deal: Deal;
  sessions: DealSession[];
  availableSessions?: AvailableSessionRow[] | null;
  capacityNote?: string | null;
  onPatchDeal: (patch: Record<string, unknown>) => void;
  onAddSession: (body: Record<string, unknown>) => void;
  onUpdateSession: (id: string, body: Record<string, unknown>) => void;
  onDeleteSession: (id: string) => void;
  onSelectIntegratedSessions?: (body: {
    external_session_ids: string[];
    capacity_mode?: "live_provider" | "live_provider_capped";
    seat_cap?: number | null;
    session_seat_caps?: Record<string, number | null>;
  }) => void;
}) {
  const integrated = isIntegratedDealType(deal.dealType);
  const isOpenWindow = deal.dealType === "manual_open_window";
  const isMulti = deal.dealType === "integrated_multi_session";
  const capped = deal.capacityMode === "live_provider_capped";

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sessionCaps, setSessionCaps] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!availableSessions) return;
    setSelectedIds(availableSessions.filter((s) => s.selected).map((s) => s.id));
    const caps: Record<string, string> = {};
    for (const s of availableSessions) {
      if (s.seat_cap != null) caps[s.id] = String(s.seat_cap);
    }
    setSessionCaps(caps);
  }, [availableSessions]);

  const toggleSession = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (!isMulti) return [id];
      return [...prev, id];
    });
  };

  const applySelection = () => {
    if (!onSelectIntegratedSessions) return;
    const caps: Record<string, number | null> = {};
    for (const id of selectedIds) {
      const raw = sessionCaps[id];
      if (raw != null && raw !== "") {
        caps[id] = Number(raw);
      }
    }
    onSelectIntegratedSessions({
      external_session_ids: selectedIds,
      capacity_mode:
        deal.capacityMode === "live_provider_capped"
          ? "live_provider_capped"
          : "live_provider",
      seat_cap: capped ? deal.seatCap : null,
      session_seat_caps: Object.keys(caps).length > 0 ? caps : undefined,
    });
  };

  return (
    <div className="space-y-4">
      <h3 className="font-[family-name:var(--font-instrument)] text-2xl text-[var(--ts-ink)]">
        Availability
      </h3>
      <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
        {integrated
          ? isMulti
            ? "Select one or more provider sessions in the next 72 hours."
            : "Select exactly one provider session in the next 72 hours."
          : isOpenWindow
            ? "Up to 3 days with seats per day."
            : "Add sessions with start time and seats."}
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className={labelClass}>
            Stop Selling This Many Minutes Before Start
          </label>
          <input
            type="number"
            className={fieldClass}
            value={deal.salesCutoffMinutes ?? 0}
            onChange={(e) =>
              onPatchDeal({
                sales_cutoff_minutes: Number(e.target.value),
              })
            }
          />
        </div>
        <div>
          <label className={labelClass}>Publish at (UTC, optional)</label>
          <input
            type="datetime-local"
            className={fieldClass}
            value={
              deal.publishAt
                ? deal.publishAt.slice(0, 16)
                : ""
            }
            onChange={(e) =>
              onPatchDeal({
                publish_at: e.target.value
                  ? new Date(e.target.value).toISOString()
                  : null,
              })
            }
          />
        </div>
        <div>
          <label className={labelClass}>Min / max group</label>
          <div className="mt-1 flex gap-2">
            <input
              type="number"
              className={fieldClass}
              placeholder="Min"
              value={deal.minBookingQty ?? ""}
              onChange={(e) =>
                onPatchDeal({
                  min_booking_qty:
                    e.target.value === "" ? null : Number(e.target.value),
                })
              }
            />
            <input
              type="number"
              className={fieldClass}
              placeholder="Max"
              value={deal.maxBookingQty ?? ""}
              onChange={(e) =>
                onPatchDeal({
                  max_booking_qty:
                    e.target.value === "" ? null : Number(e.target.value),
                })
              }
            />
          </div>
        </div>
      </div>

      {integrated && (
        <div className="space-y-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Capacity mode</label>
              <select
                className={fieldClass}
                value={deal.capacityMode ?? "live_provider"}
                onChange={(e) => {
                  const mode = e.target.value as
                    | "live_provider"
                    | "live_provider_capped";
                  onPatchDeal({
                    capacity_mode: mode,
                    seat_cap:
                      mode === "live_provider_capped"
                        ? deal.seatCap ?? 4
                        : null,
                  });
                }}
              >
                <option value="live_provider">
                  {CAPACITY_MODE_LABELS.live_provider}
                </option>
                <option value="live_provider_capped">
                  {CAPACITY_MODE_LABELS.live_provider_capped}
                </option>
              </select>
            </div>
            {capped && (
              <div>
                <label className={labelClass}>Deal seat cap (1–999)</label>
                <input
                  type="number"
                  className={fieldClass}
                  min={1}
                  max={999}
                  value={deal.seatCap ?? ""}
                  onChange={(e) =>
                    onPatchDeal({
                      seat_cap:
                        e.target.value === ""
                          ? null
                          : Number(e.target.value),
                    })
                  }
                />
              </div>
            )}
          </div>
          {capped && capacityNote && (
            <p className="font-[family-name:var(--font-sora)] text-xs text-[var(--ts-muted)]">
              {capacityNote}
            </p>
          )}

          <ul className="space-y-2">
            {(availableSessions ?? []).length === 0 && (
              <li className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
                No provider sessions in the next 72 hours. Sync the integration
                and try again.
              </li>
            )}
            {(availableSessions ?? []).map((s) => {
              const checked = selectedIds.includes(s.id);
              return (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--ts-ink)]/10 bg-white p-3"
                >
                  <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                    <input
                      type={isMulti ? "checkbox" : "radio"}
                      name="integrated-session"
                      className="mt-1"
                      checked={checked}
                      onChange={() => toggleSession(s.id)}
                    />
                    <span className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-ink)]">
                      <span className="font-semibold">
                        {new Date(s.start_at).toUTCString()}
                      </span>
                      <span className="mt-0.5 block text-xs text-[var(--ts-muted)]">
                        {s.seats_available ?? 0} seats · {s.status}
                        {s.last_synced_at
                          ? ` · synced ${new Date(s.last_synced_at).toUTCString()}`
                          : ""}
                        {s.seats_displayed != null
                          ? ` · showing ${s.seats_displayed}`
                          : ""}
                      </span>
                    </span>
                  </label>
                  {capped && checked && (
                    <div className="w-28">
                      <label className={labelClass}>Session cap</label>
                      <input
                        type="number"
                        className={fieldClass}
                        min={1}
                        max={999}
                        placeholder="Override"
                        value={sessionCaps[s.id] ?? ""}
                        onChange={(e) =>
                          setSessionCaps((prev) => ({
                            ...prev,
                            [s.id]: e.target.value,
                          }))
                        }
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <button
            type="button"
            disabled={
              selectedIds.length === 0 ||
              (!isMulti && selectedIds.length !== 1) ||
              !onSelectIntegratedSessions
            }
            className="rounded-xl bg-[var(--ts-teal)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            onClick={applySelection}
          >
            Save session selection
          </button>

          {sessions.length > 0 && (
            <p className="font-[family-name:var(--font-sora)] text-xs text-[var(--ts-muted)]">
              {sessions.length} session{sessions.length === 1 ? "" : "s"} linked
              on this deal.
            </p>
          )}
        </div>
      )}

      {!integrated && (
        <>
          <ul className="space-y-3">
            {sessions.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--ts-ink)]/10 bg-white p-3"
              >
                <div>
                  <label className={labelClass}>Start</label>
                  <input
                    type="datetime-local"
                    className={fieldClass}
                    value={s.startAt.slice(0, 16)}
                    onChange={(e) =>
                      onUpdateSession(s.id, {
                        start_at: new Date(e.target.value).toISOString(),
                      })
                    }
                  />
                </div>
                {isOpenWindow && (
                  <div>
                    <label className={labelClass}>End</label>
                    <input
                      type="datetime-local"
                      className={fieldClass}
                      value={(s.endAt ?? s.startAt).slice(0, 16)}
                      onChange={(e) =>
                        onUpdateSession(s.id, {
                          end_at: new Date(e.target.value).toISOString(),
                        })
                      }
                    />
                  </div>
                )}
                <div>
                  <label className={labelClass}>Seats</label>
                  <input
                    type="number"
                    className={fieldClass}
                    value={s.manualSeatsAvailable ?? 0}
                    onChange={(e) =>
                      onUpdateSession(s.id, {
                        manual_seats_available: Number(e.target.value),
                      })
                    }
                  />
                </div>
                <button
                  type="button"
                  className="text-xs font-semibold text-red-700"
                  onClick={() => onDeleteSession(s.id)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>

          <button
            type="button"
            disabled={isOpenWindow && sessions.length >= 3}
            className="rounded-xl bg-[var(--ts-teal)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            onClick={() => {
              const start = new Date();
              start.setHours(start.getHours() + 24);
              start.setMinutes(0, 0, 0);
              if (isOpenWindow) {
                const day = start.toISOString().slice(0, 10);
                onAddSession({
                  local_date: day,
                  manual_seats_available: 4,
                });
              } else {
                onAddSession({
                  start_at: start.toISOString(),
                  manual_seats_available: 4,
                });
              }
            }}
          >
            {isOpenWindow ? "Add day" : "Add session"}
          </button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 6 — Destination
// ---------------------------------------------------------------------------

export function DestinationStep({
  deal,
  onPatchDeal,
  onTestLink,
  testing,
}: {
  deal: Deal;
  onPatchDeal: (patch: Record<string, unknown>) => void;
  onTestLink: () => void;
  testing: boolean;
}) {
  const dest = deal.bookingDestinationType as BookingDestinationType | null;
  return (
    <div className="space-y-4">
      <h3 className="font-[family-name:var(--font-instrument)] text-2xl text-[var(--ts-ink)]">
        Booking destination
      </h3>

      <div>
        <label className={labelClass}>Type</label>
        <select
          className={fieldClass}
          value={dest ?? ""}
          onChange={(e) =>
            onPatchDeal({
              booking_destination_type: e.target.value || null,
            })
          }
        >
          <option value="">Select…</option>
          {BOOKING_DESTINATION_TYPES.map((t) => (
            <option key={t} value={t}>
              {BOOKING_DESTINATION_LABELS[t]}
            </option>
          ))}
        </select>
      </div>

      {(dest === "operator_website" || dest === "provider_booking_page") && (
        <div>
          <label className={labelClass}>Booking URL (https)</label>
          <input
            className={fieldClass}
            value={deal.bookingUrl ?? ""}
            onChange={(e) => onPatchDeal({ booking_url: e.target.value })}
          />
        </div>
      )}
      {dest === "phone" && (
        <div>
          <label className={labelClass}>Phone (E.164)</label>
          <input
            className={fieldClass}
            value={deal.bookingPhone ?? ""}
            placeholder="+6421234567"
            onChange={(e) => onPatchDeal({ booking_phone: e.target.value })}
          />
        </div>
      )}
      {dest === "email" && (
        <div>
          <label className={labelClass}>Email</label>
          <input
            className={fieldClass}
            value={deal.bookingEmail ?? ""}
            onChange={(e) => onPatchDeal({ booking_email: e.target.value })}
          />
        </div>
      )}

      <div>
        <div className="flex items-center justify-between">
          <label className={labelClass}>Instructions</label>
          <Counter
            value={deal.bookingInstructions ?? ""}
            min={0}
            max={CONTENT_COUNTERS.bookingInstructions.max}
          />
        </div>
        <textarea
          className={fieldClass}
          rows={3}
          value={deal.bookingInstructions ?? ""}
          maxLength={CONTENT_COUNTERS.bookingInstructions.max}
          onChange={(e) =>
            onPatchDeal({ booking_instructions: e.target.value })
          }
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-[var(--ts-ink)]">
        <input
          type="checkbox"
          checked={deal.appendTrackingParams !== false}
          onChange={(e) =>
            onPatchDeal({ append_tracking_params: e.target.checked })
          }
        />
        Append tracking params to booking URL
      </label>

      {(dest === "operator_website" || dest === "provider_booking_page") && (
        <button
          type="button"
          disabled={testing}
          onClick={onTestLink}
          className="rounded-xl border border-[var(--ts-ink)]/15 bg-white px-4 py-2.5 text-sm font-semibold text-[var(--ts-ink)]"
        >
          {testing ? "Testing…" : "Test link"}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 7 — Review
// ---------------------------------------------------------------------------

export function ReviewStep({
  deal,
  checks,
  publishButton,
  attest,
  onAttestChange,
  onFix,
  onPublish,
  publishing,
}: {
  deal: Deal;
  checks: PublishValidationCheckKeyed[];
  publishButton: PublishButtonLabel;
  attest: boolean;
  onAttestChange: (v: boolean) => void;
  onFix: (step: string) => void;
  onPublish: () => void;
  publishing: boolean;
}) {
  return (
    <div className="space-y-4">
      <h3 className="font-[family-name:var(--font-instrument)] text-2xl text-[var(--ts-ink)]">
        Review &amp; publish
      </h3>

      <div className="rounded-xl border border-[var(--ts-ink)]/10 bg-[var(--ts-mist)]/50 p-4">
        <p className="font-[family-name:var(--font-sora)] text-lg font-semibold text-[var(--ts-ink)]">
          {deal.title || "Untitled deal"}
        </p>
        <p className="mt-1 text-sm text-[var(--ts-muted)]">
          {deal.summary || "No summary yet."}
        </p>
      </div>

      <ul className="space-y-2">
        {checks.map((c) => (
          <li
            key={c.key}
            className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-[var(--ts-ink)]/10 bg-white px-3 py-2"
          >
            <div>
              <p className="text-sm font-semibold text-[var(--ts-ink)]">
                {c.passed ? "✓" : "✗"} {c.label}
              </p>
              {c.message && (
                <p className="text-xs text-[var(--ts-muted)]">{c.message}</p>
              )}
            </div>
            {!c.passed && (
              <button
                type="button"
                className="text-xs font-semibold text-[var(--ts-teal)]"
                onClick={() => onFix(c.editorStep)}
              >
                Fix
              </button>
            )}
          </li>
        ))}
      </ul>

      <label className="flex items-start gap-2 text-sm text-[var(--ts-ink)]">
        <input
          type="checkbox"
          className="mt-1"
          checked={attest}
          onChange={(e) => onAttestChange(e.target.checked)}
        />
        <span>
          These seats are available and I will honour this price (required for
          manual deals).
        </span>
      </label>

      <button
        type="button"
        disabled={publishing || !attest}
        onClick={onPublish}
        className="rounded-xl bg-[var(--ts-teal)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        {publishing ? "Working…" : publishButton}
      </button>
    </div>
  );
}
