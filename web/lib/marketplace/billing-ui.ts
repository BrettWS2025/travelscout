/**
 * Pure helpers for Billing settings UI (Chunk 42).
 * Labels duplicated here so client components do not import billing.ts
 * (store + usage helpers).
 */

import type { BillingModel } from "./enums";
import type { UserRole } from "./enums";

export const BILLING_MODEL_LABELS: Record<BillingModel, string> = {
  subscription: "Subscription",
  per_click: "Per booking click",
  commission: "Commission",
};

export const BILLING_ACCOUNT_STATUS_LABELS: Record<string, string> = {
  active: "Active",
  past_due: "Past due",
  cancelled: "Cancelled",
  none: "None",
};

export function canManageBilling(
  role: string | null | undefined
): boolean {
  return role === "owner";
}

export function fieldErrorMap(
  errors: Array<{ field: string; message: string }> | undefined
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of errors ?? []) {
    out[e.field] = e.message;
  }
  return out;
}

export function formatMoneyMinor(
  amountMinor: number,
  currency: string
): string {
  try {
    return new Intl.NumberFormat("en-NZ", {
      style: "currency",
      currency: currency || "NZD",
    }).format(amountMinor / 100);
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${currency}`;
  }
}

export function formatPaymentMethod(
  method: {
    brand: string;
    last4: string;
    exp_month: number;
    exp_year: number;
  } | null
): string {
  if (!method) return "No payment method on file";
  return `${method.brand} ···· ${method.last4} (exp ${String(method.exp_month).padStart(2, "0")}/${method.exp_year})`;
}

export function usageSummaryText(usage: {
  billing_model: string;
  booking_clicks: number | null;
  attributed_bookings: number | null;
  attributed_revenue_minor: number | null;
  period: { label: string };
}, currency: string): string {
  if (usage.billing_model === "per_click") {
    return `${usage.booking_clicks ?? 0} booking clicks in ${usage.period.label}`;
  }
  if (usage.billing_model === "commission") {
    const bookings = usage.attributed_bookings ?? 0;
    const revenue = formatMoneyMinor(
      usage.attributed_revenue_minor ?? 0,
      currency
    );
    return `${bookings} attributed bookings (${revenue}) in ${usage.period.label}`;
  }
  return `Subscription plan — usage not metered (${usage.period.label})`;
}

export function ownerOnlyHint(role: UserRole | null): string | null {
  if (!role) return null;
  if (role === "owner") return null;
  return "Only the account owner can view billing.";
}
