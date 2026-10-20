"use client";

import type { Deal } from "@/lib/marketplace/deal";
import type { DealMedia } from "@/lib/marketplace/deal-media";
import type { DealPriceOption, DealSession } from "@/lib/marketplace/deal-session";
import type { FieldError } from "@/lib/marketplace/deal";
import {
  CONTENT_COUNTERS,
  charCounter,
  clientDealPriceFromPercentage,
  clientPriceRowStatus,
  dollarsToMinor,
  formatMinorAsDollars,
  minorToDollarsInput,
} from "@/lib/marketplace/deal-editor";
import {
  BOOKING_DESTINATION_TYPES,
  CANCELLATION_POLICY_TYPES,
  CATEGORIES,
  FITNESS_LEVELS,
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

export function TypeStep({
  deal,
  creating,
  onCreate,
  onDuplicate,
  onCreateFromTemplate,
  templates,
  hasConnectedIntegration,
}: {
  deal: Deal | null;
  creating: boolean;
  onCreate: (dealType: DealType, duplicateOf?: string) => void;
  onDuplicate: () => void;
  onCreateFromTemplate?: (templateId: string) => void;
  templates?: TemplateChoice[];
  hasConnectedIntegration: boolean;
}) {
  return (
    <div className="space-y-4">
      <h3 className="font-[family-name:var(--font-instrument)] text-2xl text-[var(--ts-ink)]">
        Deal type
      </h3>
      <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
        Manual deals are available now. Integrated types need a connected
        booking system.
      </p>

      {deal ? (
        <div className="rounded-xl border border-[var(--ts-ink)]/10 bg-[var(--ts-mist)]/60 px-4 py-3">
          <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-ink)]">
            Type:{" "}
            <span className="font-semibold">
              {deal.dealType.replace(/_/g, " ")}
            </span>
          </p>
          <p className="mt-1 text-xs text-[var(--ts-muted)]">
            Source: {deal.sourceProvider}
          </p>
          <button
            type="button"
            onClick={onDuplicate}
            className="mt-3 rounded-lg border border-[var(--ts-ink)]/15 bg-white px-3 py-2 text-sm font-medium text-[var(--ts-ink)]"
          >
            Duplicate as new draft
          </button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              {
                type: "manual_session" as const,
                title: "Manual session",
                blurb: "Fixed departure times you enter yourself.",
                enabled: true,
              },
              {
                type: "manual_open_window" as const,
                title: "Manual open window",
                blurb: "Flexible days (rentals, accommodation).",
                enabled: true,
              },
              {
                type: "integrated_session" as const,
                title: "Integrated session",
                blurb: "Live from Rezdy or another provider.",
                enabled: hasConnectedIntegration,
              },
              {
                type: "integrated_multi_session" as const,
                title: "Integrated multi-session",
                blurb: "Several provider departures as one deal.",
                enabled: hasConnectedIntegration,
              },
            ] as const
          ).map((opt) => (
            <button
              key={opt.type}
              type="button"
              disabled={!opt.enabled || creating}
              onClick={() => onCreate(opt.type)}
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
                  Connect an integration in Settings
                </p>
              )}
            </button>
          ))}
        </div>
      )}

      {!deal && templates && templates.length > 0 && onCreateFromTemplate ? (
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
                      ({t.deal_type.replace(/_/g, " ")})
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
            href="/account/settings"
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

export function ContentStep({
  deal,
  errors,
  onChange,
}: {
  deal: Deal;
  errors: FieldError[];
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const title = deal.title ?? "";
  const summary = deal.summary ?? "";
  const description = deal.description ?? "";

  return (
    <div className="space-y-4">
      <h3 className="font-[family-name:var(--font-instrument)] text-2xl text-[var(--ts-ink)]">
        Content
      </h3>

      <div>
        <div className="flex items-center justify-between">
          <label className={labelClass} htmlFor="deal-title">
            Title
          </label>
          <Counter
            value={title}
            min={CONTENT_COUNTERS.title.min}
            max={CONTENT_COUNTERS.title.max}
          />
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
        <div className="flex items-center justify-between">
          <label className={labelClass} htmlFor="deal-summary">
            Summary
          </label>
          <Counter
            value={summary}
            min={CONTENT_COUNTERS.summary.min}
            max={CONTENT_COUNTERS.summary.max}
          />
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
        <div className="flex items-center justify-between">
          <label className={labelClass} htmlFor="deal-description">
            Description
          </label>
          <Counter
            value={description}
            min={CONTENT_COUNTERS.description.min}
            max={CONTENT_COUNTERS.description.max}
          />
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
                {c.replace(/_/g, " ")}
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
                {c.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="deal-fitness">
            Fitness level
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
                {f}
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
}: {
  media: DealMedia[];
  busy: boolean;
  onUpload: (files: FileList | null) => void;
  onEmbed: (url: string) => void;
  onSetCover: (mediaId: string) => void;
  onDelete: (mediaId: string) => void;
  onPatchAlt: (mediaId: string, alt: string) => void;
}) {
  return (
    <div className="space-y-4">
      <h3 className="font-[family-name:var(--font-instrument)] text-2xl text-[var(--ts-ink)]">
        Images
      </h3>
      <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
        JPG/PNG/WebP, min 1200×800, max 12 images. Exactly one cover.
      </p>

      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        disabled={busy}
        onChange={(e) => onUpload(e.target.files)}
        className="block w-full font-[family-name:var(--font-sora)] text-sm"
      />

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
  onPatchDeal,
  onAddOption,
  onUpdateOption,
  onDeleteOption,
}: {
  deal: Deal;
  options: DealPriceOption[];
  onPatchDeal: (patch: Record<string, unknown>) => void;
  onAddOption: (body: Record<string, unknown>) => void;
  onUpdateOption: (id: string, body: Record<string, unknown>) => void;
  onDeleteOption: (id: string) => void;
}) {
  const mode = (deal.discountInputMode ?? "deal_price") as DiscountInputMode;

  return (
    <div className="space-y-4">
      <h3 className="font-[family-name:var(--font-instrument)] text-2xl text-[var(--ts-ink)]">
        Pricing
      </h3>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Discount mechanism</label>
          <select
            className={fieldClass}
            value={deal.discountMechanism ?? "manual_price"}
            onChange={(e) =>
              onPatchDeal({
                discount_mechanism: e.target.value as DiscountMechanism,
              })
            }
          >
            {MANUAL_MECHANISMS.map((m) => (
              <option key={m} value={m}>
                {m.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Input mode</label>
          <select
            className={fieldClass}
            value={mode}
            onChange={(e) =>
              onPatchDeal({
                discount_input_mode: e.target.value as DiscountInputMode,
              })
            }
          >
            <option value="deal_price">Deal price</option>
            <option value="percentage">Percentage off</option>
          </select>
        </div>
      </div>

      {(deal.discountMechanism === "quote_code" ||
        deal.discountMechanism === "promo_code") && (
        <div>
          <label className={labelClass}>Promo / quote code</label>
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

      <div className="overflow-x-auto">
        <table className="min-w-full text-left font-[family-name:var(--font-sora)] text-sm">
          <thead>
            <tr className="border-b border-[var(--ts-ink)]/10 text-xs uppercase tracking-wide text-[var(--ts-muted)]">
              <th className="py-2 pr-2">Label</th>
              <th className="py-2 pr-2">Type</th>
              <th className="py-2 pr-2">Original</th>
              <th className="py-2 pr-2">
                {mode === "percentage" ? "% off" : "Deal"}
              </th>
              <th className="py-2 pr-2">Discount</th>
              <th className="py-2 pr-2">Evidence URL</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {options.map((opt) => {
              const status = clientPriceRowStatus(
                opt.originalPriceMinor,
                opt.dealPriceMinor
              );
              return (
                <tr key={opt.id} className="border-b border-[var(--ts-ink)]/5">
                  <td className="py-2 pr-2">
                    <input
                      className={fieldClass}
                      value={opt.label}
                      onChange={(e) =>
                        onUpdateOption(opt.id, { label: e.target.value })
                      }
                    />
                  </td>
                  <td className="py-2 pr-2">
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
                          {t}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-2">
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
                  </td>
                  <td className="py-2 pr-2">
                    {mode === "percentage" ? (
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
                  <td className="py-2">
                    <button
                      type="button"
                      className="text-xs font-semibold text-red-700"
                      onClick={() => onDeleteOption(opt.id)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 5 — Availability
// ---------------------------------------------------------------------------

export function AvailabilityStep({
  deal,
  sessions,
  onPatchDeal,
  onAddSession,
  onUpdateSession,
  onDeleteSession,
}: {
  deal: Deal;
  sessions: DealSession[];
  onPatchDeal: (patch: Record<string, unknown>) => void;
  onAddSession: (body: Record<string, unknown>) => void;
  onUpdateSession: (id: string, body: Record<string, unknown>) => void;
  onDeleteSession: (id: string) => void;
}) {
  const isOpenWindow = deal.dealType === "manual_open_window";

  return (
    <div className="space-y-4">
      <h3 className="font-[family-name:var(--font-instrument)] text-2xl text-[var(--ts-ink)]">
        Availability
      </h3>
      <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
        {isOpenWindow
          ? "Up to 3 days with seats per day."
          : "Add sessions with start time and seats."}
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className={labelClass}>Sales cutoff (minutes)</label>
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
              {t.replace(/_/g, " ")}
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
