/**
 * Browser client for Business profile and Deal defaults APIs (Chunk 38).
 */

export class OperatorProfileApiError extends Error {
  status: number;
  errors: Array<{ field: string; message: string }>;

  constructor(
    message: string,
    status: number,
    errors?: Array<{ field: string; message: string }>
  ) {
    super(message);
    this.name = "OperatorProfileApiError";
    this.status = status;
    this.errors = errors ?? [];
  }
}

export type OperatorProfileRow = {
  id: string;
  legal_name: string;
  trading_name: string;
  slug: string;
  logo: string | null;
  cover_image: string | null;
  short_description: string | null;
  long_description: string | null;
  website: string | null;
  public_email: string | null;
  public_phone: string | null;
  internal_email: string | null;
  internal_phone: string | null;
  address: string | null;
  regions_served: string[];
  timezone: string;
  currency: string;
  languages: string[];
  gst_number: string | null;
  nzbn: string | null;
  social_links: Record<string, unknown>;
  account_status: string;
  requires_manual_review: boolean;
  created_at: string;
  updated_at: string;
};

export type OperatorPreviewRow = {
  id: string;
  trading_name: string;
  slug: string;
  logo: string | null;
  cover_image: string | null;
  short_description: string | null;
  long_description: string | null;
  website: string | null;
  public_email: string | null;
  public_phone: string | null;
  address: string | null;
  regions_served: string[];
  timezone: string;
  currency: string;
  languages: string[];
  social_links: Record<string, unknown>;
};

export type BookingDefaultsRow = {
  id: string;
  operator_id: string;
  default_sales_cutoff_minutes: number;
  default_seat_cap: number | null;
  default_discount_pct: number;
  default_discount_mechanism: string;
  default_booking_destination_type: string;
  default_booking_url: string | null;
  default_booking_phone: string | null;
  default_booking_email: string | null;
  default_booking_instructions: string | null;
  default_cancellation_policy_type: string;
  default_cancellation_policy_text: string | null;
  default_attestation_reminder_hours: number;
  created_at: string;
  updated_at: string;
  note?: string;
};

async function profileFetch<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    formData?: FormData;
    accessToken?: string | null;
  } = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.accessToken) {
    headers.Authorization = `Bearer ${options.accessToken}`;
  }
  if (options.body !== undefined && !options.formData) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(path, {
    method: options.method ?? (options.body || options.formData ? "POST" : "GET"),
    headers,
    body: options.formData
      ? options.formData
      : options.body !== undefined
        ? JSON.stringify(options.body)
        : undefined,
  });

  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    errors?: Array<{ field: string; message: string }>;
  } & T;

  if (!res.ok) {
    throw new OperatorProfileApiError(
      data.error ?? `Request failed (${res.status})`,
      res.status,
      data.errors
    );
  }
  return data;
}

export async function getOperatorProfileApi(
  operatorId: string,
  accessToken?: string | null
): Promise<{ operator: OperatorProfileRow; read_only: boolean }> {
  return profileFetch(
    `/api/marketplace/operators/${encodeURIComponent(operatorId)}/profile`,
    { accessToken }
  );
}

export async function patchOperatorProfileApi(
  operatorId: string,
  body: Record<string, unknown>,
  accessToken?: string | null
): Promise<{ operator: OperatorProfileRow }> {
  return profileFetch(
    `/api/marketplace/operators/${encodeURIComponent(operatorId)}/profile`,
    { method: "PATCH", body, accessToken }
  );
}

export async function getOperatorPreviewApi(
  operatorId: string,
  accessToken?: string | null
): Promise<{ preview: OperatorPreviewRow }> {
  return profileFetch(
    `/api/marketplace/operators/${encodeURIComponent(operatorId)}/preview`,
    { accessToken }
  );
}

export async function uploadOperatorLogoApi(
  operatorId: string,
  file: File,
  accessToken?: string | null
): Promise<{ operator: OperatorProfileRow }> {
  const form = new FormData();
  form.append("file", file);
  return profileFetch(
    `/api/marketplace/operators/${encodeURIComponent(operatorId)}/profile/logo`,
    { method: "POST", formData: form, accessToken }
  );
}

export async function uploadOperatorCoverApi(
  operatorId: string,
  file: File,
  accessToken?: string | null
): Promise<{ operator: OperatorProfileRow }> {
  const form = new FormData();
  form.append("file", file);
  return profileFetch(
    `/api/marketplace/operators/${encodeURIComponent(operatorId)}/profile/cover`,
    { method: "POST", formData: form, accessToken }
  );
}

export async function getBookingDefaultsApi(
  operatorId: string,
  accessToken?: string | null
): Promise<{ defaults: BookingDefaultsRow }> {
  return profileFetch(
    `/api/marketplace/operators/${encodeURIComponent(operatorId)}/booking-defaults`,
    { accessToken }
  );
}

export async function patchBookingDefaultsApi(
  operatorId: string,
  body: Record<string, unknown>,
  accessToken?: string | null
): Promise<{ defaults: BookingDefaultsRow }> {
  return profileFetch(
    `/api/marketplace/operators/${encodeURIComponent(operatorId)}/booking-defaults`,
    { method: "PATCH", body, accessToken }
  );
}
