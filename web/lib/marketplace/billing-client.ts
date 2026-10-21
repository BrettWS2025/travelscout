/**
 * Browser client for Billing settings APIs (Chunk 42).
 */

export class BillingApiError extends Error {
  status: number;
  code?: string;
  errors: Array<{ field: string; message: string }>;

  constructor(
    message: string,
    status: number,
    extras?: {
      code?: string;
      errors?: Array<{ field: string; message: string }>;
    }
  ) {
    super(message);
    this.name = "BillingApiError";
    this.status = status;
    this.code = extras?.code;
    this.errors = extras?.errors ?? [];
  }
}

export type BillingPaymentMethod = {
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
};

export type BillingInvoiceRow = {
  id: string;
  number: string;
  status: string;
  amount_minor: number;
  currency: string;
  period_start: string;
  period_end: string;
  issued_at: string;
  download_url: string;
};

export type BillingUsageRow = {
  billing_model: string;
  period: { start: string; end: string; label: string };
  booking_clicks: number | null;
  attributed_bookings: number | null;
  attributed_revenue_minor: number | null;
};

export type BillingApiRow = {
  plan: string;
  billing_model: string;
  billing_model_label: string;
  commission_pct: number | null;
  billing_email: string | null;
  status: string;
  status_label: string;
  payment_method: BillingPaymentMethod | null;
  invoices: BillingInvoiceRow[];
  invoices_stubbed: boolean;
  billing_provider: {
    configured: boolean;
    message: string | null;
  };
  usage: BillingUsageRow;
  currency: string;
  updated_at: string;
};

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function throwApiError(
  data: Record<string, unknown>,
  status: number,
  fallback: string
): never {
  throw new BillingApiError(
    typeof data.error === "string" ? data.error : fallback,
    status,
    {
      code: typeof data.code === "string" ? data.code : undefined,
      errors: Array.isArray(data.errors)
        ? (data.errors as Array<{ field: string; message: string }>)
        : [],
    }
  );
}

export async function getBillingApi(
  operatorId: string,
  token: string
): Promise<{ billing: BillingApiRow }> {
  const res = await fetch(
    `/api/marketplace/operators/${encodeURIComponent(operatorId)}/billing`,
    { headers: authHeaders(token), cache: "no-store" }
  );
  const data = await parseJson(res);
  if (!res.ok) throwApiError(data, res.status, "Failed to load billing");
  return { billing: data.billing as BillingApiRow };
}

export async function patchBillingEmailApi(
  operatorId: string,
  token: string,
  billingEmail: string | null
): Promise<{ billing: BillingApiRow }> {
  const res = await fetch(
    `/api/marketplace/operators/${encodeURIComponent(operatorId)}/billing`,
    {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ billing_email: billingEmail }),
    }
  );
  const data = await parseJson(res);
  if (!res.ok) throwApiError(data, res.status, "Failed to update billing email");
  return { billing: data.billing as BillingApiRow };
}
