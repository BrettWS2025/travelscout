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
  getBookingDefaultsApi,
  patchBookingDefaultsApi,
  type BookingDefaultsRow,
} from "@/lib/marketplace/operator-profile-client";
import {
  BOOKING_DEFAULTS_NOTE,
  BOOKING_DESTINATION_LABELS,
  CANCELLATION_POLICY_LABELS,
  DISCOUNT_MECHANISM_LABELS,
  bookingDestinationOptions,
  canEditDealDefaults,
  cancellationPolicyOptions,
  discountMechanismOptions,
  fieldErrorMap,
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
  default_sales_cutoff_minutes: number;
  default_seat_cap: string;
  default_discount_pct: number;
  default_discount_mechanism: string;
  default_booking_destination_type: string;
  default_booking_url: string;
  default_booking_phone: string;
  default_booking_email: string;
  default_booking_instructions: string;
  default_cancellation_policy_type: string;
  default_cancellation_policy_text: string;
  default_attestation_reminder_hours: number;
};

function formFromDefaults(d: BookingDefaultsRow): FormState {
  return {
    default_sales_cutoff_minutes: d.default_sales_cutoff_minutes,
    default_seat_cap:
      d.default_seat_cap == null ? "" : String(d.default_seat_cap),
    default_discount_pct: d.default_discount_pct,
    default_discount_mechanism: d.default_discount_mechanism,
    default_booking_destination_type: d.default_booking_destination_type,
    default_booking_url: d.default_booking_url ?? "",
    default_booking_phone: d.default_booking_phone ?? "",
    default_booking_email: d.default_booking_email ?? "",
    default_booking_instructions: d.default_booking_instructions ?? "",
    default_cancellation_policy_type: d.default_cancellation_policy_type,
    default_cancellation_policy_text: d.default_cancellation_policy_text ?? "",
    default_attestation_reminder_hours: d.default_attestation_reminder_hours,
  };
}

export function DealDefaults() {
  const { session } = useAuth();
  const token = session?.access_token;

  const [operator, setOperator] = useState<MyOperator | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [note, setNote] = useState<string>(BOOKING_DEFAULTS_NOTE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const canEdit = canEditDealDefaults(operator?.role);

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

  const loadDefaults = useCallback(async () => {
    if (!operator) {
      setLoading(false);
      return;
    }
    if (!canEdit) {
      setLoading(false);
      setForm(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await getBookingDefaultsApi(operator.id, token);
      setForm(formFromDefaults(res.defaults));
      setNote(res.defaults.note ?? BOOKING_DEFAULTS_NOTE);
    } catch (err) {
      setError(
        err instanceof OperatorProfileApiError
          ? err.message
          : "Failed to load deal defaults"
      );
    } finally {
      setLoading(false);
    }
  }, [operator, token, canEdit]);

  useEffect(() => {
    void loadDefaults();
  }, [loadDefaults]);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const onSave = async () => {
    if (!operator || !form || !canEdit) return;
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      const seatCapTrim = form.default_seat_cap.trim();
      const body: Record<string, unknown> = {
        default_sales_cutoff_minutes: Number(
          form.default_sales_cutoff_minutes
        ),
        default_seat_cap:
          seatCapTrim === "" ? null : Number.parseInt(seatCapTrim, 10),
        default_discount_pct: Number(form.default_discount_pct),
        default_discount_mechanism: form.default_discount_mechanism,
        default_booking_destination_type:
          form.default_booking_destination_type,
        default_booking_url: form.default_booking_url || null,
        default_booking_phone: form.default_booking_phone || null,
        default_booking_email: form.default_booking_email || null,
        default_booking_instructions:
          form.default_booking_instructions || null,
        default_cancellation_policy_type:
          form.default_cancellation_policy_type,
        default_cancellation_policy_text:
          form.default_cancellation_policy_text || null,
        default_attestation_reminder_hours: Number(
          form.default_attestation_reminder_hours
        ),
      };
      const res = await patchBookingDefaultsApi(operator.id, body, token);
      setForm(formFromDefaults(res.defaults));
      setNote(res.defaults.note ?? BOOKING_DEFAULTS_NOTE);
      setSavedAt(new Date().toISOString());
    } catch (err) {
      if (err instanceof OperatorProfileApiError) {
        setError(err.message);
        setFieldErrors(fieldErrorMap(err.errors));
      } else {
        setError("Failed to save deal defaults");
      }
    } finally {
      setSaving(false);
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
              {!canEdit ? " · deal defaults require owner or manager" : ""}
            </p>
          ) : null}
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={saving || !form}
            className="rounded-xl bg-[var(--ts-teal)] px-4 py-2.5 font-[family-name:var(--font-sora)] text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save defaults"}
          </button>
        ) : null}
      </div>

      <SettingsSubnav />

      <p className="rounded-xl border border-[var(--ts-ink)]/10 bg-[var(--ts-mist)]/50 px-4 py-3 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-ink)]">
        {note}
      </p>

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
          Defaults saved. Existing deals were not changed.
        </p>
      ) : null}

      {!canEdit ? (
        <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
          Staff cannot view or edit deal defaults.
        </p>
      ) : loading || !form ? (
        <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
          {operator ? "Loading defaults…" : "No operator found for this account."}
        </p>
      ) : (
        <section className="rounded-2xl border border-[var(--ts-ink)]/10 bg-white px-5 py-5">
          <h3 className="font-[family-name:var(--font-sora)] text-sm font-semibold uppercase tracking-wide text-[var(--ts-teal)]">
            Deal defaults
          </h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <FieldLabel htmlFor="default_sales_cutoff_minutes">
                Sales cutoff (minutes)
              </FieldLabel>
              <input
                id="default_sales_cutoff_minutes"
                type="number"
                min={0}
                max={1440}
                className={inputClass(false)}
                value={form.default_sales_cutoff_minutes}
                onChange={(e) =>
                  setField(
                    "default_sales_cutoff_minutes",
                    Number(e.target.value)
                  )
                }
              />
              <FieldError
                message={fieldErrors.default_sales_cutoff_minutes}
              />
            </div>
            <div>
              <FieldLabel htmlFor="default_seat_cap">
                Seat cap (blank = none)
              </FieldLabel>
              <input
                id="default_seat_cap"
                type="number"
                min={1}
                max={999}
                className={inputClass(false)}
                value={form.default_seat_cap}
                onChange={(e) => setField("default_seat_cap", e.target.value)}
              />
              <FieldError message={fieldErrors.default_seat_cap} />
            </div>
            <div>
              <FieldLabel htmlFor="default_discount_pct">
                Default discount %
              </FieldLabel>
              <input
                id="default_discount_pct"
                type="number"
                min={0}
                max={100}
                step={0.1}
                className={inputClass(false)}
                value={form.default_discount_pct}
                onChange={(e) =>
                  setField("default_discount_pct", Number(e.target.value))
                }
              />
              <FieldError message={fieldErrors.default_discount_pct} />
            </div>
            <div>
              <FieldLabel htmlFor="default_discount_mechanism">
                Discount mechanism
              </FieldLabel>
              <select
                id="default_discount_mechanism"
                className={inputClass(false)}
                value={form.default_discount_mechanism}
                onChange={(e) =>
                  setField("default_discount_mechanism", e.target.value)
                }
              >
                {discountMechanismOptions().map((m) => (
                  <option key={m} value={m}>
                    {DISCOUNT_MECHANISM_LABELS[m]}
                  </option>
                ))}
              </select>
              <FieldError message={fieldErrors.default_discount_mechanism} />
            </div>
            <div>
              <FieldLabel htmlFor="default_booking_destination_type">
                Booking destination
              </FieldLabel>
              <select
                id="default_booking_destination_type"
                className={inputClass(false)}
                value={form.default_booking_destination_type}
                onChange={(e) =>
                  setField("default_booking_destination_type", e.target.value)
                }
              >
                {bookingDestinationOptions().map((t) => (
                  <option key={t} value={t}>
                    {BOOKING_DESTINATION_LABELS[t]}
                  </option>
                ))}
              </select>
              <FieldError
                message={fieldErrors.default_booking_destination_type}
              />
            </div>
            <div>
              <FieldLabel htmlFor="default_attestation_reminder_hours">
                Attestation reminder (hours)
              </FieldLabel>
              <input
                id="default_attestation_reminder_hours"
                type="number"
                min={1}
                max={24}
                className={inputClass(false)}
                value={form.default_attestation_reminder_hours}
                onChange={(e) =>
                  setField(
                    "default_attestation_reminder_hours",
                    Number(e.target.value)
                  )
                }
              />
              <FieldError
                message={fieldErrors.default_attestation_reminder_hours}
              />
            </div>
            <div>
              <FieldLabel htmlFor="default_booking_url">Booking URL</FieldLabel>
              <input
                id="default_booking_url"
                className={inputClass(false)}
                value={form.default_booking_url}
                placeholder="https://"
                onChange={(e) =>
                  setField("default_booking_url", e.target.value)
                }
              />
              <FieldError message={fieldErrors.default_booking_url} />
            </div>
            <div>
              <FieldLabel htmlFor="default_booking_phone">
                Booking phone
              </FieldLabel>
              <input
                id="default_booking_phone"
                className={inputClass(false)}
                value={form.default_booking_phone}
                placeholder="+6421234567"
                onChange={(e) =>
                  setField("default_booking_phone", e.target.value)
                }
              />
              <FieldError message={fieldErrors.default_booking_phone} />
            </div>
            <div>
              <FieldLabel htmlFor="default_booking_email">
                Booking email
              </FieldLabel>
              <input
                id="default_booking_email"
                className={inputClass(false)}
                value={form.default_booking_email}
                onChange={(e) =>
                  setField("default_booking_email", e.target.value)
                }
              />
              <FieldError message={fieldErrors.default_booking_email} />
            </div>
            <div>
              <FieldLabel htmlFor="default_cancellation_policy_type">
                Cancellation policy
              </FieldLabel>
              <select
                id="default_cancellation_policy_type"
                className={inputClass(false)}
                value={form.default_cancellation_policy_type}
                onChange={(e) =>
                  setField("default_cancellation_policy_type", e.target.value)
                }
              >
                {cancellationPolicyOptions().map((t) => (
                  <option key={t} value={t}>
                    {CANCELLATION_POLICY_LABELS[t]}
                  </option>
                ))}
              </select>
              <FieldError
                message={fieldErrors.default_cancellation_policy_type}
              />
            </div>
          </div>
          <div className="mt-4">
            <FieldLabel htmlFor="default_booking_instructions">
              Booking instructions ({form.default_booking_instructions.length}
              /300)
            </FieldLabel>
            <textarea
              id="default_booking_instructions"
              rows={3}
              maxLength={300}
              className={inputClass(false)}
              value={form.default_booking_instructions}
              onChange={(e) =>
                setField("default_booking_instructions", e.target.value)
              }
            />
            <FieldError message={fieldErrors.default_booking_instructions} />
          </div>
          {form.default_cancellation_policy_type === "custom" ? (
            <div className="mt-4">
              <FieldLabel htmlFor="default_cancellation_policy_text">
                Custom cancellation text (
                {form.default_cancellation_policy_text.length}/1000)
              </FieldLabel>
              <textarea
                id="default_cancellation_policy_text"
                rows={4}
                maxLength={1000}
                className={inputClass(false)}
                value={form.default_cancellation_policy_text}
                onChange={(e) =>
                  setField("default_cancellation_policy_text", e.target.value)
                }
              />
              <FieldError
                message={fieldErrors.default_cancellation_policy_text}
              />
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}
