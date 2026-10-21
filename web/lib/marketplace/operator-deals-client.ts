/**
 * Browser client for inventory operator-deals APIs (Chunks 12–17, 19, 21–23).
 * Distinct from the legacy /api/marketplace/deals helpers in client.ts.
 */

import type { Deal } from "./deal";
import type { DealDetail } from "./deal-draft";
import type { DealMedia } from "./deal-media";
import type { DealPriceOption, DealSession } from "./deal-session";
import type { DealType, UserRole } from "./enums";
import type { PublishValidationOutcome } from "./deal-publish-validation";
import type { PublishButtonLabel } from "./deal-publish";
import type { FieldError } from "./deal";
import type {
  BulkDealAction,
  DealCalendarResult,
  ListOperatorDealsResult,
} from "./deal-list-shared";

export class OperatorDealsApiError extends Error {
  status: number;
  errors: FieldError[];
  needsConfirm: boolean;
  warnings: string[];
  validation: PublishValidationOutcome | null;
  maxDealPriceMinor: number | null;
  checks: PublishValidationOutcome["checks"] | null;

  constructor(
    message: string,
    status: number,
    extras?: {
      errors?: FieldError[];
      needs_confirm?: boolean;
      warnings?: string[];
      validation?: PublishValidationOutcome | null;
      max_deal_price_minor?: number | null;
      checks?: PublishValidationOutcome["checks"] | null;
    }
  ) {
    super(message);
    this.name = "OperatorDealsApiError";
    this.status = status;
    this.errors = extras?.errors ?? [];
    this.needsConfirm = extras?.needs_confirm === true;
    this.warnings = extras?.warnings ?? [];
    this.validation = extras?.validation ?? null;
    this.maxDealPriceMinor =
      extras?.max_deal_price_minor != null
        ? Number(extras.max_deal_price_minor)
        : null;
    this.checks = extras?.checks ?? null;
  }
}

export type MyOperator = {
  id: string;
  tradingName: string;
  slug: string;
  role: UserRole;
  timezone: string;
  currency: string;
};

async function operatorDealsFetch<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    accessToken?: string | null;
    formData?: FormData;
  } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (options.formData === undefined && options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (options.accessToken) {
    headers.Authorization = `Bearer ${options.accessToken}`;
  }

  const res = await fetch(path, {
    method: options.method || "GET",
    headers,
    body:
      options.formData !== undefined
        ? options.formData
        : options.body !== undefined
          ? JSON.stringify(options.body)
          : undefined,
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
    throw new OperatorDealsApiError(message, res.status, {
      errors: (data?.errors as FieldError[] | undefined) ?? [],
      needs_confirm: data?.needs_confirm === true,
      warnings: (data?.warnings as string[] | undefined) ?? [],
      validation: (data?.validation as PublishValidationOutcome | null) ?? null,
      max_deal_price_minor:
        (data?.max_deal_price_minor as number | undefined) ?? null,
      checks:
        (data?.checks as PublishValidationOutcome["checks"] | undefined) ??
        null,
    });
  }

  return data as T;
}

export function listMyOperators(accessToken?: string | null) {
  return operatorDealsFetch<{ operators: MyOperator[] }>(
    "/api/marketplace/operators/me",
    { accessToken }
  );
}

export function createOperatorDeal(
  operatorId: string,
  input: {
    deal_type: DealType;
    template_id?: string | null;
    duplicate_of?: string | null;
    /** Required for integrated deal types (Chunk 32). */
    external_product_id?: string | null;
    source_provider?: string | null;
  },
  accessToken?: string | null
) {
  return operatorDealsFetch<{ deal: Deal }>(
    `/api/marketplace/operators/${encodeURIComponent(operatorId)}/deals`,
    { method: "POST", body: input, accessToken }
  );
}

export type DealProductPickerItem = {
  id: string;
  integration_id: string;
  provider: string;
  external_id: string;
  name: string;
  thumbnail_url: string | null;
  price_min_minor: number | null;
  price_max_minor: number | null;
  currency: string | null;
  sessions_next_72h: number;
};

export function listDealProductsApi(
  operatorId: string,
  accessToken?: string | null
) {
  return operatorDealsFetch<{
    products: DealProductPickerItem[];
    has_connected_integration: boolean;
  }>(
    `/api/marketplace/operators/${encodeURIComponent(operatorId)}/deal-products`,
    { accessToken }
  );
}

export function revertDealFieldApi(
  dealId: string,
  field: string,
  accessToken?: string | null
) {
  return operatorDealsFetch<{ deal: Deal }>(
    `/api/marketplace/operator-deals/${encodeURIComponent(dealId)}/revert-field`,
    { method: "POST", body: { field }, accessToken }
  );
}

export function importProviderImagesApi(
  dealId: string,
  accessToken?: string | null
) {
  return operatorDealsFetch<{ imported: number; media: unknown[] }>(
    `/api/marketplace/operator-deals/${encodeURIComponent(dealId)}/media/import-provider`,
    { method: "POST", body: {}, accessToken }
  );
}

export function getOperatorDeal(dealId: string, accessToken?: string | null) {
  return operatorDealsFetch<DealDetail>(
    `/api/marketplace/operator-deals/${encodeURIComponent(dealId)}`,
    { accessToken }
  );
}

export function updateOperatorDeal(
  dealId: string,
  patch: Record<string, unknown>,
  accessToken?: string | null
) {
  return operatorDealsFetch<{ deal: Deal }>(
    `/api/marketplace/operator-deals/${encodeURIComponent(dealId)}`,
    { method: "PATCH", body: patch, accessToken }
  );
}

export function deleteOperatorDeal(
  dealId: string,
  accessToken?: string | null
) {
  return operatorDealsFetch<{ ok: boolean }>(
    `/api/marketplace/operator-deals/${encodeURIComponent(dealId)}`,
    { method: "DELETE", accessToken }
  );
}

export function duplicateOperatorDeal(
  dealId: string,
  accessToken?: string | null
) {
  return operatorDealsFetch<{ deal: Deal }>(
    `/api/marketplace/operator-deals/${encodeURIComponent(dealId)}/duplicate`,
    { method: "POST", body: {}, accessToken }
  );
}

export function createDealSessionApi(
  dealId: string,
  body: Record<string, unknown>,
  accessToken?: string | null
) {
  return operatorDealsFetch<{
    session: DealSession;
    validation: PublishValidationOutcome | null;
  }>(
    `/api/marketplace/operator-deals/${encodeURIComponent(dealId)}/sessions`,
    { method: "POST", body, accessToken }
  );
}

export function updateDealSessionApi(
  dealId: string,
  sessionId: string,
  body: Record<string, unknown>,
  accessToken?: string | null
) {
  return operatorDealsFetch<{
    session: DealSession;
    validation: PublishValidationOutcome | null;
  }>(
    `/api/marketplace/operator-deals/${encodeURIComponent(dealId)}/sessions/${encodeURIComponent(sessionId)}`,
    { method: "PATCH", body, accessToken }
  );
}

export function deleteDealSessionApi(
  dealId: string,
  sessionId: string,
  body: Record<string, unknown> = {},
  accessToken?: string | null
) {
  return operatorDealsFetch<{ ok: boolean }>(
    `/api/marketplace/operator-deals/${encodeURIComponent(dealId)}/sessions/${encodeURIComponent(sessionId)}`,
    { method: "DELETE", body, accessToken }
  );
}

export function createDealPriceOptionApi(
  dealId: string,
  body: Record<string, unknown>,
  accessToken?: string | null
) {
  return operatorDealsFetch<{
    price_option: DealPriceOption;
    validation: PublishValidationOutcome | null;
  }>(
    `/api/marketplace/operator-deals/${encodeURIComponent(dealId)}/price-options`,
    { method: "POST", body, accessToken }
  );
}

export function updateDealPriceOptionApi(
  dealId: string,
  optionId: string,
  body: Record<string, unknown>,
  accessToken?: string | null
) {
  return operatorDealsFetch<{
    price_option: DealPriceOption;
    validation: PublishValidationOutcome | null;
  }>(
    `/api/marketplace/operator-deals/${encodeURIComponent(dealId)}/price-options/${encodeURIComponent(optionId)}`,
    { method: "PATCH", body, accessToken }
  );
}

export function deleteDealPriceOptionApi(
  dealId: string,
  optionId: string,
  body: Record<string, unknown> = {},
  accessToken?: string | null
) {
  return operatorDealsFetch<{ ok: boolean }>(
    `/api/marketplace/operator-deals/${encodeURIComponent(dealId)}/price-options/${encodeURIComponent(optionId)}`,
    { method: "DELETE", body, accessToken }
  );
}

export function createDiscountStepApi(
  dealId: string,
  body: Record<string, unknown>,
  accessToken?: string | null
) {
  return operatorDealsFetch<{
    discount_step: import("./deal-session").DiscountStep;
    validation: PublishValidationOutcome | null;
  }>(
    `/api/marketplace/operator-deals/${encodeURIComponent(dealId)}/discount-steps`,
    { method: "POST", body, accessToken }
  );
}

export function updateDiscountStepApi(
  dealId: string,
  stepId: string,
  body: Record<string, unknown>,
  accessToken?: string | null
) {
  return operatorDealsFetch<{
    discount_step: import("./deal-session").DiscountStep;
    validation: PublishValidationOutcome | null;
  }>(
    `/api/marketplace/operator-deals/${encodeURIComponent(dealId)}/discount-steps/${encodeURIComponent(stepId)}`,
    { method: "PATCH", body, accessToken }
  );
}

export function deleteDiscountStepApi(
  dealId: string,
  stepId: string,
  body: Record<string, unknown> = {},
  accessToken?: string | null
) {
  return operatorDealsFetch<{ ok: boolean }>(
    `/api/marketplace/operator-deals/${encodeURIComponent(dealId)}/discount-steps/${encodeURIComponent(stepId)}`,
    { method: "DELETE", body, accessToken }
  );
}

export function verifyDealDiscountApi(
  dealId: string,
  body: { promo_code_confirmed_by_operator?: boolean } = {},
  accessToken?: string | null
) {
  return operatorDealsFetch<{
    deal: Deal;
    verification: {
      status: "verified" | "not_found" | "cannot_verify" | "failed";
      checked_at: string;
      options: Array<{
        price_option_id: string;
        status: "verified" | "not_found" | "cannot_verify" | "failed";
        message?: string;
        actual_price_minor?: number;
      }>;
    };
    status: "verified" | "not_found" | "cannot_verify" | "failed";
  }>(
    `/api/marketplace/operator-deals/${encodeURIComponent(dealId)}/verify-discount`,
    { method: "POST", body, accessToken }
  );
}

export type AvailableExternalSessionRow = {
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

export function listAvailableSessionsApi(
  dealId: string,
  accessToken?: string | null
) {
  return operatorDealsFetch<{
    sessions: AvailableExternalSessionRow[];
    capacity_mode: string | null;
    seat_cap: number | null;
    note: string;
    max_lead_hours: number;
  }>(
    `/api/marketplace/operator-deals/${encodeURIComponent(dealId)}/available-sessions`,
    { method: "GET", accessToken }
  );
}

export function selectIntegratedSessionsApi(
  dealId: string,
  body: {
    external_session_ids: string[];
    capacity_mode?: "live_provider" | "live_provider_capped";
    seat_cap?: number | null;
    session_seat_caps?: Record<string, number | null>;
    confirm?: boolean;
  },
  accessToken?: string | null
) {
  return operatorDealsFetch<{
    deal: Deal;
    sessions: DealSession[];
    validation: PublishValidationOutcome | null;
    note: string;
  }>(
    `/api/marketplace/operator-deals/${encodeURIComponent(dealId)}/available-sessions`,
    { method: "PUT", body, accessToken }
  );
}

export function uploadDealMediaApi(
  dealId: string,
  files: File[],
  accessToken?: string | null,
  altText?: string
) {
  const form = new FormData();
  for (const file of files) {
    form.append("files", file);
  }
  if (altText) form.append("alt_text", altText);
  return operatorDealsFetch<{ media: DealMedia[] }>(
    `/api/marketplace/operator-deals/${encodeURIComponent(dealId)}/media`,
    { method: "POST", formData: form, accessToken }
  );
}

export function addDealVideoEmbedApi(
  dealId: string,
  body: { url: string; alt_text?: string },
  accessToken?: string | null
) {
  return operatorDealsFetch<{ media: DealMedia }>(
    `/api/marketplace/operator-deals/${encodeURIComponent(dealId)}/media/video-embed`,
    { method: "POST", body, accessToken }
  );
}

export function updateDealMediaApi(
  dealId: string,
  mediaId: string,
  body: Record<string, unknown>,
  accessToken?: string | null
) {
  return operatorDealsFetch<{ media: DealMedia }>(
    `/api/marketplace/operator-deals/${encodeURIComponent(dealId)}/media/${encodeURIComponent(mediaId)}`,
    { method: "PATCH", body, accessToken }
  );
}

export function setDealMediaCoverApi(
  dealId: string,
  mediaId: string,
  accessToken?: string | null
) {
  return operatorDealsFetch<{ media: DealMedia[] }>(
    `/api/marketplace/operator-deals/${encodeURIComponent(dealId)}/media/${encodeURIComponent(mediaId)}/cover`,
    { method: "POST", body: {}, accessToken }
  );
}

export function deleteDealMediaApi(
  dealId: string,
  mediaId: string,
  accessToken?: string | null
) {
  return operatorDealsFetch<{ ok: boolean }>(
    `/api/marketplace/operator-deals/${encodeURIComponent(dealId)}/media/${encodeURIComponent(mediaId)}`,
    { method: "DELETE", accessToken }
  );
}

export function testDealLinkApi(dealId: string, accessToken?: string | null) {
  return operatorDealsFetch<{
    url: string;
    tracked: boolean;
    click_id: string;
    check: { ok: boolean; status: number | null; error: string | null };
  }>(
    `/api/marketplace/operator-deals/${encodeURIComponent(dealId)}/test-link`,
    { method: "POST", body: {}, accessToken }
  );
}

export function publishOperatorDeal(
  dealId: string,
  body: { attest?: boolean },
  accessToken?: string | null
) {
  return operatorDealsFetch<{
    deal: Deal;
    validation: PublishValidationOutcome;
    publish_button: PublishButtonLabel;
    target_status: string;
  }>(
    `/api/marketplace/operator-deals/${encodeURIComponent(dealId)}/publish`,
    { method: "POST", body, accessToken }
  );
}

export function listOperatorDealsApi(
  operatorId: string,
  query: string,
  accessToken?: string | null
) {
  const qs = query ? `?${query}` : "";
  return operatorDealsFetch<ListOperatorDealsResult>(
    `/api/marketplace/operators/${encodeURIComponent(operatorId)}/deals${qs}`,
    { accessToken }
  );
}

export function getOperatorDealsCalendarApi(
  operatorId: string,
  from?: string | null,
  accessToken?: string | null
) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  const qs = params.toString();
  return operatorDealsFetch<DealCalendarResult>(
    `/api/marketplace/operators/${encodeURIComponent(operatorId)}/deals/calendar${qs ? `?${qs}` : ""}`,
    { accessToken }
  );
}

export function pauseOperatorDealApi(
  dealId: string,
  body: { detail?: string } = {},
  accessToken?: string | null
) {
  return operatorDealsFetch<{ deal: Deal }>(
    `/api/marketplace/operator-deals/${encodeURIComponent(dealId)}/pause`,
    { method: "POST", body, accessToken }
  );
}

export function resumeOperatorDealApi(
  dealId: string,
  body: { attest?: boolean } = {},
  accessToken?: string | null
) {
  return operatorDealsFetch<{
    deal: Deal;
    validation?: PublishValidationOutcome | null;
    checks?: PublishValidationOutcome["checks"] | null;
  }>(
    `/api/marketplace/operator-deals/${encodeURIComponent(dealId)}/resume`,
    { method: "POST", body, accessToken }
  );
}

export function endOperatorDealApi(
  dealId: string,
  accessToken?: string | null
) {
  return operatorDealsFetch<{ deal: Deal }>(
    `/api/marketplace/operator-deals/${encodeURIComponent(dealId)}/end`,
    { method: "POST", body: {}, accessToken }
  );
}

export function updateOperatorDealSeatsApi(
  dealId: string,
  seats: Record<string, number>,
  accessToken?: string | null
) {
  return operatorDealsFetch<{ deal: Deal; sessions: DealSession[] }>(
    `/api/marketplace/operator-deals/${encodeURIComponent(dealId)}/seats`,
    { method: "POST", body: seats, accessToken }
  );
}

export function markOperatorDealSoldOutApi(
  dealId: string,
  accessToken?: string | null
) {
  return operatorDealsFetch<{ deal: Deal; sessions: DealSession[] }>(
    `/api/marketplace/operator-deals/${encodeURIComponent(dealId)}/mark-sold-out`,
    { method: "POST", body: {}, accessToken }
  );
}

export function bulkOperatorDealsApi(
  operatorId: string,
  body: {
    action: BulkDealAction;
    deal_ids: string[];
    confirm?: boolean;
    attest?: boolean;
  },
  accessToken?: string | null
) {
  return operatorDealsFetch<{
    results: Array<{ id: string; ok: boolean; error?: string }>;
  }>(
    `/api/marketplace/operators/${encodeURIComponent(operatorId)}/deals/bulk`,
    { method: "POST", body, accessToken }
  );
}

// ---------------------------------------------------------------------------
// Templates (Chunk 25)
// ---------------------------------------------------------------------------

export type OperatorDealTemplate = {
  id: string;
  operator_id: string;
  name: string;
  payload: Record<string, unknown>;
  deal_type: DealType | null;
  created_at: string;
  updated_at: string;
};

export function saveOperatorDealAsTemplateApi(
  dealId: string,
  name: string,
  accessToken?: string | null
) {
  return operatorDealsFetch<{ template: OperatorDealTemplate }>(
    `/api/marketplace/operator-deals/${encodeURIComponent(dealId)}/save-as-template`,
    { method: "POST", body: { name }, accessToken }
  );
}

export function listOperatorTemplatesApi(
  operatorId: string,
  accessToken?: string | null
) {
  return operatorDealsFetch<{ templates: OperatorDealTemplate[] }>(
    `/api/marketplace/operators/${encodeURIComponent(operatorId)}/templates`,
    { accessToken }
  );
}

export function renameOperatorTemplateApi(
  operatorId: string,
  templateId: string,
  name: string,
  accessToken?: string | null
) {
  return operatorDealsFetch<{ template: OperatorDealTemplate }>(
    `/api/marketplace/operators/${encodeURIComponent(operatorId)}/templates/${encodeURIComponent(templateId)}`,
    { method: "PATCH", body: { name }, accessToken }
  );
}

export function deleteOperatorTemplateApi(
  operatorId: string,
  templateId: string,
  accessToken?: string | null
) {
  return operatorDealsFetch<{ ok: boolean }>(
    `/api/marketplace/operators/${encodeURIComponent(operatorId)}/templates/${encodeURIComponent(templateId)}`,
    { method: "DELETE", accessToken }
  );
}

export function createDealFromTemplateApi(
  operatorId: string,
  templateId: string,
  body: { deal_type?: DealType } = {},
  accessToken?: string | null
) {
  return operatorDealsFetch<{ deal: Deal }>(
    `/api/marketplace/operators/${encodeURIComponent(operatorId)}/templates/${encodeURIComponent(templateId)}/create-deal`,
    { method: "POST", body, accessToken }
  );
}

// ---------------------------------------------------------------------------
// Auto-deal rules (Chunk 44)
// ---------------------------------------------------------------------------

export type OperatorDealRuleListRow = {
  id: string;
  name: string;
  product: { id: string; name: string; external_id: string } | null;
  integration_id: string;
  provider: string | null;
  schedule_summary: string;
  discount_summary: string;
  is_active: boolean;
  auto_publish: boolean;
  deals_generated_last_7_days: number;
  next_run_at: string | null;
  last_run_at: string | null;
  rule_type: string;
  list_hours_before_start: number;
  min_unsold_seats: number;
  start_date: string;
  end_date: string | null;
};

export type OperatorDealRule = {
  id: string;
  operator_id: string;
  integration_id: string;
  external_product_id: string;
  name: string;
  is_active: boolean;
  rule_type: string;
  days_of_week: number[];
  specific_dates: string[];
  session_times: string[];
  list_hours_before_start: number;
  min_unsold_seats: number;
  seat_cap: number | null;
  price_config: Record<string, unknown>;
  discount_mechanism: string;
  promo_code: string | null;
  template_deal_id: string;
  auto_publish: boolean;
  start_date: string;
  end_date: string | null;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DealRulePreviewResponse = {
  message: string;
  would_create: number;
  provider: string;
  sessions: Array<{
    external_session_id: string;
    external_id: string;
    start_at: string;
    local_start: string;
    seats_available: number;
    hours_until_start: number;
  }>;
};

export function listOperatorDealRulesApi(
  operatorId: string,
  accessToken?: string | null
) {
  return operatorDealsFetch<{ rules: OperatorDealRuleListRow[] }>(
    `/api/marketplace/operators/${encodeURIComponent(operatorId)}/deal-rules`,
    { accessToken }
  );
}

export function getOperatorDealRuleApi(
  operatorId: string,
  ruleId: string,
  accessToken?: string | null
) {
  return operatorDealsFetch<{ rule: OperatorDealRule }>(
    `/api/marketplace/operators/${encodeURIComponent(operatorId)}/deal-rules/${encodeURIComponent(ruleId)}`,
    { accessToken }
  );
}

export function createOperatorDealRuleApi(
  operatorId: string,
  body: Record<string, unknown>,
  accessToken?: string | null
) {
  return operatorDealsFetch<{ rule: OperatorDealRule }>(
    `/api/marketplace/operators/${encodeURIComponent(operatorId)}/deal-rules`,
    { method: "POST", body, accessToken }
  );
}

export function updateOperatorDealRuleApi(
  operatorId: string,
  ruleId: string,
  body: Record<string, unknown>,
  accessToken?: string | null
) {
  return operatorDealsFetch<{ rule: OperatorDealRule }>(
    `/api/marketplace/operators/${encodeURIComponent(operatorId)}/deal-rules/${encodeURIComponent(ruleId)}`,
    { method: "PATCH", body, accessToken }
  );
}

export function deleteOperatorDealRuleApi(
  operatorId: string,
  ruleId: string,
  accessToken?: string | null
) {
  return operatorDealsFetch<{ ok: boolean }>(
    `/api/marketplace/operators/${encodeURIComponent(operatorId)}/deal-rules/${encodeURIComponent(ruleId)}`,
    { method: "DELETE", accessToken }
  );
}

export function previewOperatorDealRuleApi(
  operatorId: string,
  ruleId: string,
  accessToken?: string | null
) {
  return operatorDealsFetch<DealRulePreviewResponse>(
    `/api/marketplace/operators/${encodeURIComponent(operatorId)}/deal-rules/${encodeURIComponent(ruleId)}/preview`,
    { accessToken }
  );
}
