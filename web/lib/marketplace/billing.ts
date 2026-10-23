/**
 * Billing settings (deals platform Chunk 42).
 *
 * - GET /operators/:id/billing — plan, model, commission (read-only),
 *   billing_email, payment method summary, invoices, current-period usage
 * - PATCH billing_email only
 * - payment_method_ref never returned; invoices live from billing provider
 *   (stubbed when no provider is configured)
 *
 * Keep free of server-only imports (auth, permissions, next/headers) so
 * billing-ui / client components can import serializers and labels safely.
 */

import type { BillingModel } from "./enums";
import {
  type BillingAccount,
  type SettingsFieldError,
  validateBillingAccountFields,
} from "./settings";
import { localDateKey } from "./timezone";
import {
  BILLING_ACCOUNT_STATUS_LABELS,
  BILLING_MODEL_LABELS,
} from "./display-labels";

export { BILLING_ACCOUNT_STATUS_LABELS, BILLING_MODEL_LABELS };

// ---------------------------------------------------------------------------
// Labels (re-exported from display-labels above)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class BillingError extends Error {
  readonly status: number;
  readonly errors?: SettingsFieldError[];
  readonly code?: string;

  constructor(
    message: string,
    status = 400,
    extras?: { errors?: SettingsFieldError[]; code?: string }
  ) {
    super(message);
    this.name = "BillingError";
    this.status = status;
    this.errors = extras?.errors;
    this.code = extras?.code;
  }
}

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

export type BillingDealStore = {
  operators: {
    operators: Map<
      string,
      { id: string; timezone: string; currency: string }
    >;
  };
  deals: Map<string, { id: string; operatorId: string }>;
  billingAccounts?: Map<string, BillingAccount>;
  audit: {
    clicks: Map<
      string,
      { id: string; dealId: string; createdAt: string }
    >;
    metrics: Map<
      string,
      {
        id: string;
        dealId: string;
        date: string;
        attributedBookings: number;
        attributedRevenueMinor: number;
      }
    >;
  };
};

function ensureBillingMap(
  store: BillingDealStore
): Map<string, BillingAccount> {
  if (!store.billingAccounts) {
    store.billingAccounts = new Map();
  }
  return store.billingAccounts;
}

function requireOperator(
  store: BillingDealStore,
  operatorId: string
): { id: string; timezone: string; currency: string } {
  const op = store.operators.operators.get(operatorId);
  if (!op) {
    throw new BillingError("Operator not found", 404);
  }
  return op;
}

export function getBillingAccountForOperator(
  store: BillingDealStore,
  operatorId: string
): BillingAccount | null {
  for (const row of ensureBillingMap(store).values()) {
    if (row.operatorId === operatorId) return row;
  }
  return null;
}

function requireBillingAccount(
  store: BillingDealStore,
  operatorId: string
): BillingAccount {
  const account = getBillingAccountForOperator(store, operatorId);
  if (!account) {
    throw new BillingError("Billing account not found", 404, {
      code: "billing_not_found",
    });
  }
  return account;
}

/** Seed / upsert a billing account row (tests + HTTP store). */
export function upsertBillingAccount(
  store: BillingDealStore,
  account: BillingAccount
): BillingAccount {
  ensureBillingMap(store).set(account.id, account);
  return account;
}

export function seedBillingAccounts(
  store: BillingDealStore,
  accounts: BillingAccount[]
): void {
  const map = ensureBillingMap(store);
  for (const a of accounts) {
    map.set(a.id, a);
  }
}

// ---------------------------------------------------------------------------
// Billing provider stub
// ---------------------------------------------------------------------------

export type BillingInvoice = {
  id: string;
  number: string;
  status: "paid" | "open" | "void" | "draft";
  amount_minor: number;
  currency: string;
  period_start: string;
  period_end: string;
  issued_at: string;
  download_url: string;
};

export type PaymentMethodSummary = {
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
};

/** Module flag — real Stripe/etc. not wired yet. */
let billingProviderConfiguredOverride: boolean | null = null;

export function setBillingProviderConfigured(configured: boolean | null): void {
  billingProviderConfiguredOverride = configured;
}

export function isBillingProviderConfigured(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (billingProviderConfiguredOverride != null) {
    return billingProviderConfiguredOverride;
  }
  return env.BILLING_PROVIDER_CONFIGURED === "1";
}

const STUB_INVOICES: BillingInvoice[] = [
  {
    id: "inv_stub_001",
    number: "INV-STUB-001",
    status: "paid",
    amount_minor: 0,
    currency: "NZD",
    period_start: "2026-09-01T00:00:00.000Z",
    period_end: "2026-09-30T23:59:59.999Z",
    issued_at: "2026-10-01T00:00:00.000Z",
    download_url: "https://billing.example/invoices/inv_stub_001.pdf",
  },
  {
    id: "inv_stub_002",
    number: "INV-STUB-002",
    status: "open",
    amount_minor: 0,
    currency: "NZD",
    period_start: "2026-10-01T00:00:00.000Z",
    period_end: "2026-10-31T23:59:59.999Z",
    issued_at: "2026-10-21T00:00:00.000Z",
    download_url: "https://billing.example/invoices/inv_stub_002.pdf",
  },
];

/**
 * Resolve a display-only payment method summary from payment_method_ref.
 * Never returns card PAN / CVV — brand + last4 + expiry only.
 */
export function paymentMethodSummaryFromRef(
  paymentMethodRef: string | null
): PaymentMethodSummary | null {
  if (!paymentMethodRef || paymentMethodRef.trim().length === 0) {
    return null;
  }
  // Stub provider: known test refs decode to a Visa; anything else still
  // returns a safe placeholder so the UI can show "on file".
  if (paymentMethodRef === "pm_test_visa_4242") {
    return {
      brand: "Visa",
      last4: "4242",
      exp_month: 12,
      exp_year: 2028,
    };
  }
  return {
    brand: "Card",
    last4: "0000",
    exp_month: 1,
    exp_year: 2030,
  };
}

/**
 * Live invoice fetch. When no billing provider is configured, returns
 * stubbed invoices (callers should surface that in the response).
 */
export function fetchBillingInvoices(options?: {
  operatorId?: string;
  currency?: string;
}): { invoices: BillingInvoice[]; stubbed: boolean } {
  const configured = isBillingProviderConfigured();
  if (!configured) {
    const currency = options?.currency ?? "NZD";
    return {
      stubbed: true,
      invoices: STUB_INVOICES.map((inv) => ({
        ...inv,
        currency,
      })),
    };
  }
  // Real provider hook would go here (Stripe list invoices, etc.).
  return { stubbed: false, invoices: [] };
}

// ---------------------------------------------------------------------------
// Current-period usage
// ---------------------------------------------------------------------------

export type BillingPeriod = {
  start: string;
  end: string;
  /** Local YYYY-MM in operator timezone */
  label: string;
};

export type BillingUsage = {
  billing_model: BillingModel;
  period: BillingPeriod;
  /** per_click: booking clicks in period */
  booking_clicks: number | null;
  /** commission: attributed bookings in period */
  attributed_bookings: number | null;
  /** commission: attributed revenue (minor units) in period */
  attributed_revenue_minor: number | null;
};

/** First and last instant of the local calendar month containing `now`. */
export function currentBillingPeriod(
  nowIso: string,
  timeZone: string
): BillingPeriod {
  const dayKey = localDateKey(nowIso, timeZone);
  const [y, m] = dayKey.split("-").map(Number) as [number, number];
  const label = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`;
  // Approximate UTC bounds for the local month via noon midpoints — good
  // enough for click/metric date filtering which uses localDateKey.
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0)).toISOString();
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999)).toISOString();
  return { start, end, label };
}

function dealIdsForOperator(
  store: BillingDealStore,
  operatorId: string
): Set<string> {
  const ids = new Set<string>();
  for (const deal of store.deals.values()) {
    if (deal.operatorId === operatorId) ids.add(deal.id);
  }
  return ids;
}

export function computeBillingUsage(
  store: BillingDealStore,
  operatorId: string,
  account: BillingAccount,
  options?: { now?: string }
): BillingUsage {
  const op = requireOperator(store, operatorId);
  const now = options?.now ?? new Date().toISOString();
  const period = currentBillingPeriod(now, op.timezone);
  const dealIds = dealIdsForOperator(store, operatorId);
  const model = account.billingModel;

  let bookingClicks: number | null = null;
  let attributedBookings: number | null = null;
  let attributedRevenue: number | null = null;

  if (model === "per_click") {
    let count = 0;
    for (const click of store.audit.clicks.values()) {
      if (!dealIds.has(click.dealId)) continue;
      const key = localDateKey(click.createdAt, op.timezone);
      if (key.startsWith(period.label)) count += 1;
    }
    bookingClicks = count;
  } else if (model === "commission") {
    let bookings = 0;
    let revenue = 0;
    for (const metric of store.audit.metrics.values()) {
      if (!dealIds.has(metric.dealId)) continue;
      if (!metric.date.startsWith(period.label)) continue;
      bookings += metric.attributedBookings;
      revenue += metric.attributedRevenueMinor;
    }
    attributedBookings = bookings;
    attributedRevenue = revenue;
  }

  return {
    billing_model: model,
    period,
    booking_clicks: bookingClicks,
    attributed_bookings: attributedBookings,
    attributed_revenue_minor: attributedRevenue,
  };
}

// ---------------------------------------------------------------------------
// Serialize / GET / PATCH
// ---------------------------------------------------------------------------

export type BillingApiResponse = {
  plan: string;
  billing_model: BillingModel;
  billing_model_label: string;
  commission_pct: number | null;
  billing_email: string | null;
  status: BillingAccount["status"];
  status_label: string;
  payment_method: PaymentMethodSummary | null;
  invoices: BillingInvoice[];
  invoices_stubbed: boolean;
  billing_provider: {
    configured: boolean;
    message: string | null;
  };
  usage: BillingUsage;
  currency: string;
  updated_at: string;
};

export function serializeBillingResponse(
  store: BillingDealStore,
  operatorId: string,
  options?: { now?: string }
): BillingApiResponse {
  const op = requireOperator(store, operatorId);
  const account = requireBillingAccount(store, operatorId);
  const configured = isBillingProviderConfigured();
  const { invoices, stubbed } = fetchBillingInvoices({
    operatorId,
    currency: op.currency,
  });
  const usage = computeBillingUsage(store, operatorId, account, {
    now: options?.now,
  });

  return {
    plan: account.plan,
    billing_model: account.billingModel,
    billing_model_label: BILLING_MODEL_LABELS[account.billingModel],
    commission_pct: account.commissionPct,
    billing_email: account.billingEmail,
    status: account.status,
    status_label: BILLING_ACCOUNT_STATUS_LABELS[account.status],
    payment_method: paymentMethodSummaryFromRef(account.paymentMethodRef),
    invoices,
    invoices_stubbed: stubbed || !configured,
    billing_provider: {
      configured,
      message: configured
        ? null
        : "No billing provider is configured yet; invoices below are stubs.",
    },
    usage,
    currency: op.currency,
    updated_at: account.updatedAt,
  };
}

export function getOperatorBilling(
  store: BillingDealStore,
  operatorId: string,
  options?: { now?: string }
): BillingApiResponse {
  return serializeBillingResponse(store, operatorId, options);
}

export function patchBillingEmail(
  store: BillingDealStore,
  operatorId: string,
  input: { billing_email?: unknown },
  options?: { now?: string }
): BillingApiResponse {
  requireOperator(store, operatorId);
  const account = requireBillingAccount(store, operatorId);

  if (!("billing_email" in input)) {
    throw new BillingError("billing_email is required", 400, {
      code: "billing_email_required",
      errors: [{ field: "billing_email", message: "required" }],
    });
  }

  const raw = input.billing_email;
  let billingEmail: string | null;
  if (raw === null || raw === "") {
    billingEmail = null;
  } else if (typeof raw === "string") {
    billingEmail = raw.trim();
  } else {
    throw new BillingError("billing_email must be a string or null", 400, {
      errors: [{ field: "billing_email", message: "invalid email" }],
    });
  }

  const errors = validateBillingAccountFields({
    billingEmail,
  });
  if (errors.length) {
    throw new BillingError("Invalid billing email", 400, { errors });
  }

  const now = options?.now ?? new Date().toISOString();
  const updated: BillingAccount = {
    ...account,
    billingEmail,
    updatedAt: now,
  };
  ensureBillingMap(store).set(updated.id, updated);
  return serializeBillingResponse(store, operatorId, { now });
}
