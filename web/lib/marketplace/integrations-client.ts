/**
 * Browser client for operator Integrations settings APIs (Chunks 27–29, 37).
 */

import type {
  BookingDestinationType,
  ConversionTrackingMethod,
  IntegrationProvider,
  SyncMode,
  SyncType,
} from "./enums";
import type { IntegrationProviderCard } from "./integration-connect";
import type { SyncLogStatus } from "./integration";
import type { ProviderCapabilities } from "./providers";

export class IntegrationsApiError extends Error {
  status: number;
  code: string | null;

  constructor(message: string, status: number, code?: string | null) {
    super(message);
    this.name = "IntegrationsApiError";
    this.status = status;
    this.code = code ?? null;
  }
}

export type PublicIntegrationRow = {
  id: string;
  operator_id: string;
  provider: IntegrationProvider;
  status: string;
  auth_type: string;
  external_account_id: string | null;
  external_account_name: string | null;
  sync_mode: SyncMode | null;
  poll_interval_seconds: number | null;
  webhook_last_received_at: string | null;
  last_sync_at: string | null;
  last_successful_sync_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  default_booking_destination_type: BookingDestinationType | null;
  booking_base_url: string | null;
  conversion_tracking_method: ConversionTrackingMethod;
  booking_source_label: string | null;
  auto_enable_new_products: boolean;
  connected_at: string | null;
  connected_by: string | null;
  created_at: string;
  updated_at: string;
};

export type IntegrationProductRow = {
  id: string;
  external_id: string;
  name: string;
  price_min_minor: number | null;
  price_max_minor: number | null;
  currency: string | null;
  sessions_next_72h: number;
  is_enabled_for_deals: boolean;
  archived_in_provider: boolean;
  last_synced_at: string | null;
};

export type SyncLogRow = {
  id: string;
  integration_id: string;
  sync_type: SyncType;
  status: SyncLogStatus;
  started_at: string;
  finished_at: string | null;
  items_processed: number;
  error_code: string | null;
  error_message: string | null;
  error_message_readable?: string | null;
  affected_deal_ids: string[];
  affected_deals?: Array<{
    id: string;
    title: string | null;
    status: string | null;
  }>;
  created_at: string;
  updated_at: string;
};

export type IntegrationDetailResponse = {
  card: IntegrationProviderCard;
  integration: PublicIntegrationRow | null;
};

async function integrationsFetch<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    accessToken?: string | null;
  } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (options.accessToken) {
    headers.Authorization = `Bearer ${options.accessToken}`;
  }

  const res = await fetch(path, {
    method: options.method || "GET",
    headers,
    body:
      options.body !== undefined ? JSON.stringify(options.body) : undefined,
    credentials: "same-origin",
  });

  const text = await res.text();
  let data: Record<string, unknown> | null = null;
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      data = { error: text };
    }
  }

  if (!res.ok) {
    const message =
      (data?.error as string | undefined) ||
      (data?.message as string | undefined) ||
      `Request failed (${res.status})`;
    throw new IntegrationsApiError(
      message,
      res.status,
      (data?.code as string | undefined) ?? null
    );
  }

  return data as T;
}

function base(operatorId: string, provider?: string) {
  const root = `/api/marketplace/operators/${encodeURIComponent(operatorId)}/integrations`;
  if (!provider) return root;
  return `${root}/${encodeURIComponent(provider)}`;
}

export function listIntegrationsApi(
  operatorId: string,
  accessToken?: string | null
) {
  return integrationsFetch<{ integrations: IntegrationProviderCard[] }>(
    base(operatorId),
    { accessToken }
  );
}

export function getIntegrationDetailApi(
  operatorId: string,
  provider: string,
  accessToken?: string | null
) {
  return integrationsFetch<IntegrationDetailResponse>(
    base(operatorId, provider),
    { accessToken }
  );
}

export function connectIntegrationApi(
  operatorId: string,
  provider: string,
  credentials: Record<string, unknown>,
  accessToken?: string | null
) {
  return integrationsFetch<{
    integration: PublicIntegrationRow;
    sync_log: SyncLogRow;
    sync_started: boolean;
    resumed_deal_ids: string[];
  }>(`${base(operatorId, provider)}/connect`, {
    method: "POST",
    body: credentials,
    accessToken,
  });
}

export function testIntegrationApi(
  operatorId: string,
  provider: string,
  accessToken?: string | null
) {
  return integrationsFetch<{ ok: true } | { ok: false; error: string }>(
    `${base(operatorId, provider)}/test`,
    { method: "POST", body: {}, accessToken }
  );
}

export function getDisconnectPreviewApi(
  operatorId: string,
  provider: string,
  accessToken?: string | null
) {
  return integrationsFetch<{
    provider: IntegrationProvider;
    integration_id: string;
    deals_to_pause: number;
    account_name: string | null;
  }>(`${base(operatorId, provider)}/disconnect-preview`, { accessToken });
}

export function disconnectIntegrationApi(
  operatorId: string,
  provider: string,
  accessToken?: string | null
) {
  return integrationsFetch<{
    integration: PublicIntegrationRow;
    paused_deal_ids: string[];
    paused_count: number;
  }>(`${base(operatorId, provider)}/disconnect`, {
    method: "POST",
    body: { confirm: true },
    accessToken,
  });
}

export type IntegrationSettingsPatchBody = {
  sync_mode?: SyncMode | null;
  poll_interval_seconds?: number | null;
  default_booking_destination_type?: BookingDestinationType | null;
  booking_base_url?: string | null;
  conversion_tracking_method?: ConversionTrackingMethod;
  booking_source_label?: string | null;
  auto_enable_new_products?: boolean;
};

export function patchIntegrationSettingsApi(
  operatorId: string,
  provider: string,
  patch: IntegrationSettingsPatchBody,
  accessToken?: string | null
) {
  return integrationsFetch<{ integration: PublicIntegrationRow }>(
    `${base(operatorId, provider)}/settings`,
    { method: "PATCH", body: patch, accessToken }
  );
}

export function listIntegrationProductsApi(
  operatorId: string,
  provider: string,
  accessToken?: string | null
) {
  return integrationsFetch<{ products: IntegrationProductRow[] }>(
    `${base(operatorId, provider)}/products`,
    { accessToken }
  );
}

export function setIntegrationProductEnabledApi(
  operatorId: string,
  provider: string,
  productId: string,
  isEnabled: boolean,
  accessToken?: string | null
) {
  return integrationsFetch<{
    product: {
      id: string;
      external_id: string;
      name: string;
      is_enabled_for_deals: boolean;
      archived_in_provider: boolean;
      last_synced_at: string | null;
    };
  }>(`${base(operatorId, provider)}/products/${encodeURIComponent(productId)}`, {
    method: "PATCH",
    body: { is_enabled_for_deals: isEnabled },
    accessToken,
  });
}

export function refreshIntegrationProductsApi(
  operatorId: string,
  provider: string,
  accessToken?: string | null
) {
  return integrationsFetch<{
    sync_log: SyncLogRow;
    items_processed: number;
    affected_deal_ids: string[];
  }>(`${base(operatorId, provider)}/products/refresh`, {
    method: "POST",
    body: {},
    accessToken,
  });
}

export function resyncIntegrationApi(
  operatorId: string,
  provider: string,
  accessToken?: string | null
) {
  return integrationsFetch<{
    sync_log: SyncLogRow;
    items_processed: number;
    affected_deal_ids: string[];
    resumed_deal_ids: string[];
  }>(`${base(operatorId, provider)}/resync`, {
    method: "POST",
    body: {},
    accessToken,
  });
}

export function listSyncLogsApi(
  operatorId: string,
  provider: string,
  query: {
    status?: SyncLogStatus | "";
    sync_type?: SyncType | "";
    limit?: number;
  } = {},
  accessToken?: string | null
) {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.sync_type) params.set("sync_type", query.sync_type);
  if (query.limit != null) params.set("limit", String(query.limit));
  const qs = params.toString();
  return integrationsFetch<{ sync_logs: SyncLogRow[] }>(
    `${base(operatorId, provider)}/sync-log${qs ? `?${qs}` : ""}`,
    { accessToken }
  );
}

export function testIntegrationBookingLinkApi(
  operatorId: string,
  provider: string,
  url?: string | null,
  accessToken?: string | null
) {
  return integrationsFetch<{
    ok: boolean;
    url: string;
    status: number | null;
    error: string | null;
  }>(`${base(operatorId, provider)}/test-booking-link`, {
    method: "POST",
    body: url != null ? { url } : {},
    accessToken,
  });
}

export type { IntegrationProviderCard, ProviderCapabilities };
