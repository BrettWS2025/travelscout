"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { SettingsSubnav } from "@/components/settings/SettingsSubnav";
import {
  listMyOperators,
  type MyOperator,
} from "@/lib/marketplace/operator-deals-client";
import {
  OperatorProfileApiError,
  getOperatorPreviewApi,
  getOperatorProfileApi,
  patchOperatorProfileApi,
  uploadOperatorCoverApi,
  uploadOperatorLogoApi,
  type OperatorPreviewRow,
  type OperatorProfileRow,
} from "@/lib/marketplace/operator-profile-client";
import {
  COMMON_CURRENCIES,
  COMMON_LANGUAGES,
  COMMON_TIMEZONES,
  SOCIAL_LINK_KEYS,
  canEditBusinessProfile,
  fieldErrorMap,
  regionOptions,
  socialLinksFromRecord,
  socialLinksToPayload,
  type SocialLinkKey,
} from "@/lib/marketplace/operator-profile-ui";

function FieldLabel({
  children,
  htmlFor,
}: {
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="block font-[family-name:var(--font-sora)] text-xs font-semibold text-[var(--ts-muted)]"
    >
      {children}
    </label>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 font-[family-name:var(--font-sora)] text-xs text-red-600">
      {message}
    </p>
  );
}

function inputClass(readOnly: boolean) {
  return `mt-1 w-full rounded-xl border border-[var(--ts-ink)]/15 bg-white px-3 py-2.5 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-ink)] ${
    readOnly ? "opacity-70" : ""
  }`;
}

type FormState = {
  legal_name: string;
  trading_name: string;
  slug: string;
  short_description: string;
  long_description: string;
  website: string;
  public_email: string;
  public_phone: string;
  internal_email: string;
  internal_phone: string;
  address: string;
  regions_served: string[];
  timezone: string;
  currency: string;
  languages: string[];
  gst_number: string;
  nzbn: string;
  social: Record<SocialLinkKey, string>;
};

function formFromOperator(op: OperatorProfileRow): FormState {
  return {
    legal_name: op.legal_name ?? "",
    trading_name: op.trading_name ?? "",
    slug: op.slug ?? "",
    short_description: op.short_description ?? "",
    long_description: op.long_description ?? "",
    website: op.website ?? "",
    public_email: op.public_email ?? "",
    public_phone: op.public_phone ?? "",
    internal_email: op.internal_email ?? "",
    internal_phone: op.internal_phone ?? "",
    address: op.address ?? "",
    regions_served: [...(op.regions_served ?? [])],
    timezone: op.timezone ?? "Pacific/Auckland",
    currency: op.currency ?? "NZD",
    languages: [...(op.languages ?? [])],
    gst_number: op.gst_number ?? "",
    nzbn: op.nzbn ?? "",
    social: socialLinksFromRecord(op.social_links),
  };
}

export function BusinessProfile() {
  const { session } = useAuth();
  const token = session?.access_token;

  const [operator, setOperator] = useState<MyOperator | null>(null);
  const [profile, setProfile] = useState<OperatorProfileRow | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [preview, setPreview] = useState<OperatorPreviewRow | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [readOnly, setReadOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"logo" | "cover" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const canEdit = canEditBusinessProfile(operator?.role) && !readOnly;

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

  const loadProfile = useCallback(async () => {
    if (!operator) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await getOperatorProfileApi(operator.id, token);
      setProfile(res.operator);
      setForm(formFromOperator(res.operator));
      setReadOnly(res.read_only);
    } catch (err) {
      setError(
        err instanceof OperatorProfileApiError
          ? err.message
          : "Failed to load business profile"
      );
    } finally {
      setLoading(false);
    }
  }, [operator, token]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const toggleRegion = (region: string) => {
    setForm((prev) => {
      if (!prev) return prev;
      const has = prev.regions_served.includes(region);
      return {
        ...prev,
        regions_served: has
          ? prev.regions_served.filter((r) => r !== region)
          : [...prev.regions_served, region],
      };
    });
  };

  const toggleLanguage = (code: string) => {
    setForm((prev) => {
      if (!prev) return prev;
      const has = prev.languages.includes(code);
      return {
        ...prev,
        languages: has
          ? prev.languages.filter((l) => l !== code)
          : [...prev.languages, code],
      };
    });
  };

  const onSave = async () => {
    if (!operator || !form || !canEdit) return;
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      const body: Record<string, unknown> = {
        legal_name: form.legal_name,
        trading_name: form.trading_name,
        slug: form.slug,
        short_description: form.short_description || null,
        long_description: form.long_description || null,
        website: form.website || null,
        public_email: form.public_email || null,
        public_phone: form.public_phone || null,
        internal_email: form.internal_email || null,
        internal_phone: form.internal_phone || null,
        address: form.address || null,
        regions_served: form.regions_served,
        timezone: form.timezone,
        currency: form.currency,
        languages: form.languages,
        gst_number: form.gst_number || null,
        nzbn: form.nzbn || null,
        social_links: socialLinksToPayload(form.social),
      };
      const res = await patchOperatorProfileApi(operator.id, body, token);
      setProfile(res.operator);
      setForm(formFromOperator(res.operator));
      setSavedAt(new Date().toISOString());
    } catch (err) {
      if (err instanceof OperatorProfileApiError) {
        setError(err.message);
        setFieldErrors(fieldErrorMap(err.errors));
      } else {
        setError("Failed to save business profile");
      }
    } finally {
      setSaving(false);
    }
  };

  const onUpload = async (kind: "logo" | "cover", file: File | null) => {
    if (!operator || !file || !canEdit) return;
    setUploading(kind);
    setError(null);
    try {
      const res =
        kind === "logo"
          ? await uploadOperatorLogoApi(operator.id, file, token)
          : await uploadOperatorCoverApi(operator.id, file, token);
      setProfile(res.operator);
      setForm(formFromOperator(res.operator));
    } catch (err) {
      if (err instanceof OperatorProfileApiError) {
        setError(err.message);
        setFieldErrors(fieldErrorMap(err.errors));
      } else {
        setError(`Failed to upload ${kind}`);
      }
    } finally {
      setUploading(null);
    }
  };

  const onPreview = async () => {
    if (!operator) return;
    setError(null);
    try {
      const res = await getOperatorPreviewApi(operator.id, token);
      setPreview(res.preview);
      setShowPreview(true);
    } catch (err) {
      setError(
        err instanceof OperatorProfileApiError
          ? err.message
          : "Failed to load preview"
      );
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-instrument)] text-3xl text-[var(--ts-ink)]">
            Settings
          </h2>
          {operator ? (
            <p className="mt-1 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
              {operator.tradingName}
              {!canEditBusinessProfile(operator.role)
                ? " · business profile is read-only for staff"
                : ""}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void onPreview()}
            className="rounded-xl border border-[var(--ts-ink)]/15 bg-white px-4 py-2.5 font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--ts-ink)]"
          >
            Preview operator page
          </button>
          {canEdit ? (
            <button
              type="button"
              onClick={() => void onSave()}
              disabled={saving || !form}
              className="rounded-xl bg-[var(--ts-teal)] px-4 py-2.5 font-[family-name:var(--font-sora)] text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save profile"}
            </button>
          ) : null}
        </div>
      </div>

      <SettingsSubnav />

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-[family-name:var(--font-sora)] text-sm text-red-700"
        >
          {error}
        </p>
      ) : null}
      {savedAt ? (
        <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-teal)]">
          Profile saved.
        </p>
      ) : null}

      {loading || !form || !profile ? (
        <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
          {operator ? "Loading profile…" : "No operator found for this account."}
        </p>
      ) : (
        <div className="space-y-5">
          <section className="rounded-2xl border border-[var(--ts-ink)]/10 bg-white px-5 py-5">
            <h3 className="font-[family-name:var(--font-sora)] text-sm font-semibold uppercase tracking-wide text-[var(--ts-teal)]">
              Branding
            </h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <FieldLabel>Logo</FieldLabel>
                {profile.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.logo}
                    alt="Operator logo"
                    className="mt-2 h-20 w-20 rounded-xl object-cover"
                  />
                ) : (
                  <p className="mt-2 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
                    No logo yet
                  </p>
                )}
                {canEdit ? (
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={uploading === "logo"}
                    className="mt-2 block w-full font-[family-name:var(--font-sora)] text-sm"
                    onChange={(e) =>
                      void onUpload("logo", e.target.files?.[0] ?? null)
                    }
                  />
                ) : null}
                <FieldError message={fieldErrors.logo} />
              </div>
              <div>
                <FieldLabel>Cover image</FieldLabel>
                {profile.cover_image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.cover_image}
                    alt="Operator cover"
                    className="mt-2 h-24 w-full max-w-md rounded-xl object-cover"
                  />
                ) : (
                  <p className="mt-2 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
                    No cover yet
                  </p>
                )}
                {canEdit ? (
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={uploading === "cover"}
                    className="mt-2 block w-full font-[family-name:var(--font-sora)] text-sm"
                    onChange={(e) =>
                      void onUpload("cover", e.target.files?.[0] ?? null)
                    }
                  />
                ) : null}
                <FieldError message={fieldErrors.cover_image} />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--ts-ink)]/10 bg-white px-5 py-5">
            <h3 className="font-[family-name:var(--font-sora)] text-sm font-semibold uppercase tracking-wide text-[var(--ts-teal)]">
              Identity
            </h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <FieldLabel htmlFor="legal_name">Legal name</FieldLabel>
                <input
                  id="legal_name"
                  readOnly={!canEdit}
                  className={inputClass(!canEdit)}
                  value={form.legal_name}
                  onChange={(e) => setField("legal_name", e.target.value)}
                />
                <FieldError message={fieldErrors.legal_name} />
              </div>
              <div>
                <FieldLabel htmlFor="trading_name">Trading name</FieldLabel>
                <input
                  id="trading_name"
                  readOnly={!canEdit}
                  className={inputClass(!canEdit)}
                  value={form.trading_name}
                  onChange={(e) => setField("trading_name", e.target.value)}
                />
                <FieldError message={fieldErrors.trading_name} />
              </div>
              <div>
                <FieldLabel htmlFor="slug">Slug</FieldLabel>
                <input
                  id="slug"
                  readOnly={!canEdit}
                  className={inputClass(!canEdit)}
                  value={form.slug}
                  onChange={(e) => setField("slug", e.target.value)}
                />
                <FieldError message={fieldErrors.slug} />
              </div>
              <div>
                <FieldLabel htmlFor="website">Website</FieldLabel>
                <input
                  id="website"
                  readOnly={!canEdit}
                  className={inputClass(!canEdit)}
                  value={form.website}
                  placeholder="https://"
                  onChange={(e) => setField("website", e.target.value)}
                />
                <FieldError message={fieldErrors.website} />
              </div>
            </div>
            <div className="mt-4">
              <FieldLabel htmlFor="short_description">
                Short description ({form.short_description.length}/160)
              </FieldLabel>
              <textarea
                id="short_description"
                readOnly={!canEdit}
                rows={2}
                maxLength={160}
                className={inputClass(!canEdit)}
                value={form.short_description}
                onChange={(e) => setField("short_description", e.target.value)}
              />
              <FieldError message={fieldErrors.short_description} />
            </div>
            <div className="mt-4">
              <FieldLabel htmlFor="long_description">
                Long description ({form.long_description.length}/3000)
              </FieldLabel>
              <textarea
                id="long_description"
                readOnly={!canEdit}
                rows={6}
                maxLength={3000}
                className={inputClass(!canEdit)}
                value={form.long_description}
                onChange={(e) => setField("long_description", e.target.value)}
              />
              <FieldError message={fieldErrors.long_description} />
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--ts-ink)]/10 bg-white px-5 py-5">
            <h3 className="font-[family-name:var(--font-sora)] text-sm font-semibold uppercase tracking-wide text-[var(--ts-teal)]">
              Contact & location
            </h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {(
                [
                  ["public_email", "Public email"],
                  ["public_phone", "Public phone"],
                  ["internal_email", "Internal email"],
                  ["internal_phone", "Internal phone"],
                  ["address", "Address"],
                  ["gst_number", "GST number"],
                  ["nzbn", "NZBN"],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <FieldLabel htmlFor={key}>{label}</FieldLabel>
                  <input
                    id={key}
                    readOnly={!canEdit}
                    className={inputClass(!canEdit)}
                    value={form[key]}
                    onChange={(e) => setField(key, e.target.value)}
                  />
                  <FieldError message={fieldErrors[key]} />
                </div>
              ))}
              <div>
                <FieldLabel htmlFor="timezone">Timezone</FieldLabel>
                <select
                  id="timezone"
                  disabled={!canEdit}
                  className={inputClass(!canEdit)}
                  value={form.timezone}
                  onChange={(e) => setField("timezone", e.target.value)}
                >
                  {COMMON_TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                  {!COMMON_TIMEZONES.includes(
                    form.timezone as (typeof COMMON_TIMEZONES)[number]
                  ) ? (
                    <option value={form.timezone}>{form.timezone}</option>
                  ) : null}
                </select>
                <FieldError message={fieldErrors.timezone} />
              </div>
              <div>
                <FieldLabel htmlFor="currency">Currency</FieldLabel>
                <select
                  id="currency"
                  disabled={!canEdit}
                  className={inputClass(!canEdit)}
                  value={form.currency}
                  onChange={(e) => setField("currency", e.target.value)}
                >
                  {COMMON_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  {!COMMON_CURRENCIES.includes(
                    form.currency as (typeof COMMON_CURRENCIES)[number]
                  ) ? (
                    <option value={form.currency}>{form.currency}</option>
                  ) : null}
                </select>
                <FieldError message={fieldErrors.currency} />
              </div>
            </div>

            <div className="mt-4">
              <FieldLabel>Regions served</FieldLabel>
              <div className="mt-2 flex flex-wrap gap-2">
                {regionOptions().map((region) => {
                  const on = form.regions_served.includes(region);
                  return (
                    <button
                      key={region}
                      type="button"
                      disabled={!canEdit}
                      onClick={() => toggleRegion(region)}
                      className={`rounded-lg px-3 py-1.5 font-[family-name:var(--font-sora)] text-xs font-medium ${
                        on
                          ? "bg-[var(--ts-mist)] text-[var(--ts-ink)]"
                          : "border border-[var(--ts-ink)]/10 text-[var(--ts-muted)]"
                      }`}
                    >
                      {region}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4">
              <FieldLabel>Languages</FieldLabel>
              <div className="mt-2 flex flex-wrap gap-2">
                {COMMON_LANGUAGES.map(({ code, label }) => {
                  const on = form.languages.includes(code);
                  return (
                    <button
                      key={code}
                      type="button"
                      disabled={!canEdit}
                      onClick={() => toggleLanguage(code)}
                      className={`rounded-lg px-3 py-1.5 font-[family-name:var(--font-sora)] text-xs font-medium ${
                        on
                          ? "bg-[var(--ts-mist)] text-[var(--ts-ink)]"
                          : "border border-[var(--ts-ink)]/10 text-[var(--ts-muted)]"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--ts-ink)]/10 bg-white px-5 py-5">
            <h3 className="font-[family-name:var(--font-sora)] text-sm font-semibold uppercase tracking-wide text-[var(--ts-teal)]">
              Social links
            </h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {SOCIAL_LINK_KEYS.map((key) => (
                <div key={key}>
                  <FieldLabel htmlFor={`social_${key}`}>{key}</FieldLabel>
                  <input
                    id={`social_${key}`}
                    readOnly={!canEdit}
                    className={inputClass(!canEdit)}
                    value={form.social[key]}
                    placeholder="https://"
                    onChange={(e) =>
                      setField("social", {
                        ...form.social,
                        [key]: e.target.value,
                      })
                    }
                  />
                  <FieldError message={fieldErrors[`social_links.${key}`]} />
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--ts-ink)]/10 bg-[var(--ts-mist)]/40 px-5 py-5">
            <h3 className="font-[family-name:var(--font-sora)] text-sm font-semibold uppercase tracking-wide text-[var(--ts-teal)]">
              Account (read-only)
            </h3>
            <p className="mt-2 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
              Status: {profile.account_status}
              {profile.requires_manual_review
                ? " · manual review required (admin)"
                : ""}
            </p>
          </section>
        </div>
      )}

      {showPreview && preview ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onClick={() => setShowPreview(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-[family-name:var(--font-instrument)] text-2xl text-[var(--ts-ink)]">
                {preview.trading_name}
              </h3>
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]"
              >
                Close
              </button>
            </div>
            {preview.cover_image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview.cover_image}
                alt=""
                className="mt-3 h-36 w-full rounded-xl object-cover"
              />
            ) : null}
            <p className="mt-3 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
              {preview.short_description || "No short description yet."}
            </p>
            {preview.long_description ? (
              <p className="mt-3 whitespace-pre-wrap font-[family-name:var(--font-sora)] text-sm text-[var(--ts-ink)]">
                {preview.long_description}
              </p>
            ) : null}
            <dl className="mt-4 space-y-1 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
              {preview.website ? (
                <div>
                  <dt className="inline font-semibold">Website: </dt>
                  <dd className="inline">{preview.website}</dd>
                </div>
              ) : null}
              {preview.public_email ? (
                <div>
                  <dt className="inline font-semibold">Email: </dt>
                  <dd className="inline">{preview.public_email}</dd>
                </div>
              ) : null}
              {preview.public_phone ? (
                <div>
                  <dt className="inline font-semibold">Phone: </dt>
                  <dd className="inline">{preview.public_phone}</dd>
                </div>
              ) : null}
              {preview.regions_served.length ? (
                <div>
                  <dt className="inline font-semibold">Regions: </dt>
                  <dd className="inline">
                    {preview.regions_served.join(", ")}
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>
        </div>
      ) : null}
    </div>
  );
}
