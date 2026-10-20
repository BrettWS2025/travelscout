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
  },
  accessToken?: string | null
) {
  return operatorDealsFetch<{ deal: Deal }>(
    `/api/marketplace/operators/${encodeURIComponent(operatorId)}/deals`,
    { method: "POST", body: input, accessToken }
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
