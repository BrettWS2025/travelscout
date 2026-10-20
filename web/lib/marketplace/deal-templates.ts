/**
 * Deal templates (deals platform Chunk 25).
 *
 * Save deal content / media refs / price options as DealTemplate payloads;
 * list, rename, delete; create a new draft from a template (no sessions).
 *
 * Persistence uses the in-memory DealDraftStore / DealAuditStore (same as
 * Chunks 12–24) until Supabase persistence is wired.
 */

import {
  createDealTemplate,
  deleteDealTemplate,
  renameDealTemplate,
  type DealAuditStore,
  type DealTemplate,
  DealAuditValidationError,
} from "./deal-audit";
import {
  addDealMedia,
  listDealMedia,
  type DealMedia,
  type DealMediaStore,
} from "./deal-media";
import { DealNotFoundError, type DealActor } from "./deal-status";
import type { Deal, FieldError } from "./deal";
import {
  withDiscountPct,
  type DealPriceOption,
} from "./deal-session";
import {
  isDealType,
  isMediaSource,
  isMediaType,
  isOriginalPriceSource,
  isPriceOptionType,
  type DealType,
  type MediaSource,
  type MediaType,
  type OriginalPriceSource,
  type PriceOptionType,
} from "./enums";

/** Minimal store surface used by template helpers (avoids circular import with deal-draft). */
export type DealTemplateStore = {
  deals: Map<string, Deal>;
  audit: DealAuditStore;
  media: DealMediaStore;
  priceOptions: Map<string, DealPriceOption>;
};

export class DealTemplatesError extends Error {
  readonly status: number;
  readonly errors?: FieldError[];

  constructor(message: string, status = 400, errors?: FieldError[]) {
    super(message);
    this.name = "DealTemplatesError";
    this.status = status;
    this.errors = errors;
  }
}

// ---------------------------------------------------------------------------
// Payload shapes (JSON stored on DealTemplate.payload)
// ---------------------------------------------------------------------------

/** Serialized media reference inside a template (no deal_id / row ids). */
export type TemplateMediaPayload = {
  media_type: MediaType;
  source: MediaSource;
  url: string;
  alt_text: string;
  storage_key?: string | null;
  is_cover?: boolean;
  sort_order?: number;
  caption?: string | null;
  width?: number | null;
  height?: number | null;
  focal_x?: number | null;
  focal_y?: number | null;
  file_size_bytes?: number | null;
};

/** Serialized price option inside a template (no deal_id / row ids). */
export type TemplatePriceOptionPayload = {
  label: string;
  type: PriceOptionType;
  original_price_minor: number;
  deal_price_minor: number;
  /** Optional percentage used when discount_input_mode is percentage. */
  percentage?: number | null;
  original_price_source?: OriginalPriceSource | null;
  original_price_evidence_url?: string | null;
  external_price_option_id?: string | null;
  external_deal_price_option_id?: string | null;
  sort_order?: number;
};

/**
 * Template payload: content + booking fields, media refs, price options.
 * Never includes sessions or attestations.
 */
export type DealTemplatePayload = Record<string, unknown> & {
  deal_type?: DealType;
  media?: TemplateMediaPayload[];
  price_options?: TemplatePriceOptionPayload[];
};

const TEMPLATE_DEAL_FIELD_KEYS = [
  "dealType",
  "sourceProvider",
  "integrationId",
  "externalProductId",
  "title",
  "summary",
  "description",
  "category",
  "tags",
  "highlights",
  "inclusions",
  "exclusions",
  "whatToBring",
  "durationMinutes",
  "durationLabel",
  "locationName",
  "address",
  "latitude",
  "longitude",
  "region",
  "meetingPointNotes",
  "pickupAvailable",
  "pickupNotes",
  "minAge",
  "ageNotes",
  "fitnessLevel",
  "wheelchairAccessible",
  "accessibilityNotes",
  "languages",
  "weatherDependent",
  "weatherNotes",
  "cancellationPolicyType",
  "cancellationPolicyText",
  "importantInfo",
  "overriddenFields",
  "currency",
  "discountMechanism",
  "promoCode",
  "discountInputMode",
  "steppedDiscountEnabled",
  "capacityMode",
  "seatCap",
  "minBookingQty",
  "maxBookingQty",
  "bookingDestinationType",
  "bookingUrl",
  "bookingPhone",
  "bookingEmail",
  "bookingInstructions",
  "appendTrackingParams",
  "salesCutoffMinutes",
] as const satisfies ReadonlyArray<keyof Deal>;

function camelToSnake(key: string): string {
  return key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}

function mediaToPayload(m: DealMedia): TemplateMediaPayload {
  return {
    media_type: m.mediaType,
    source: m.source,
    url: m.url,
    alt_text: m.altText,
    storage_key: m.storageKey,
    is_cover: m.isCover,
    sort_order: m.sortOrder,
    caption: m.caption,
    width: m.width,
    height: m.height,
    focal_x: m.focalX,
    focal_y: m.focalY,
    file_size_bytes: m.fileSizeBytes,
  };
}

function priceOptionToPayload(opt: DealPriceOption): TemplatePriceOptionPayload {
  return {
    label: opt.label,
    type: opt.type,
    original_price_minor: opt.originalPriceMinor,
    deal_price_minor: opt.dealPriceMinor,
    original_price_source: opt.originalPriceSource,
    original_price_evidence_url: opt.originalPriceEvidenceUrl,
    external_price_option_id: opt.externalPriceOptionId,
    external_deal_price_option_id: opt.externalDealPriceOptionId,
    sort_order: opt.sortOrder,
  };
}

/**
 * Build a reusable template payload from a deal. Excludes sessions,
 * attestations, status and other system fields.
 */
export function buildTemplatePayload(
  store: DealTemplateStore,
  dealId: string
): DealTemplatePayload {
  const deal = store.deals.get(dealId);
  if (!deal) throw new DealNotFoundError(dealId);

  const payload: DealTemplatePayload = {};

  for (const key of TEMPLATE_DEAL_FIELD_KEYS) {
    const value = deal[key];
    const snake = camelToSnake(key);
    if (Array.isArray(value)) {
      payload[snake] = [...value];
    } else {
      payload[snake] = value;
    }
  }

  payload.media = listDealMedia(store.media, dealId).map(mediaToPayload);
  payload.price_options = [...store.priceOptions.values()]
    .filter((p) => p.dealId === dealId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(priceOptionToPayload);

  return payload;
}

export type SaveDealAsTemplateOptions = {
  actor: DealActor;
  now?: string;
  id?: string;
};

/**
 * POST /deals/:id/save-as-template — persist content/media/prices as a template.
 */
export function saveDealAsTemplate(
  store: DealTemplateStore,
  dealId: string,
  name: string,
  options: SaveDealAsTemplateOptions
): DealTemplate {
  const deal = store.deals.get(dealId);
  if (!deal) throw new DealNotFoundError(dealId);

  const trimmed = name?.trim() ?? "";
  if (!trimmed) {
    throw new DealTemplatesError("name is required", 400, [
      { field: "name", message: "name is required" },
    ]);
  }

  const payload = buildTemplatePayload(store, dealId);
  return createDealTemplate(
    store.audit,
    {
      operatorId: deal.operatorId,
      name: trimmed,
      payload,
    },
    { id: options.id, now: options.now }
  );
}

export function listOperatorTemplates(
  store: DealTemplateStore,
  operatorId: string
): DealTemplate[] {
  return [...store.audit.templates.values()]
    .filter((t) => t.operatorId === operatorId)
    .sort((a, b) => a.name.localeCompare(b.name) || a.createdAt.localeCompare(b.createdAt));
}

export function getOperatorTemplate(
  store: DealTemplateStore,
  operatorId: string,
  templateId: string
): DealTemplate {
  const template = store.audit.templates.get(templateId);
  if (!template || template.operatorId !== operatorId) {
    throw new DealTemplatesError("Template not found", 404, [
      { field: "template_id", message: "not found" },
    ]);
  }
  return template;
}

export function renameOperatorTemplate(
  store: DealTemplateStore,
  operatorId: string,
  templateId: string,
  name: string,
  options?: { now?: string }
): DealTemplate {
  getOperatorTemplate(store, operatorId, templateId);
  try {
    return renameDealTemplate(store.audit, templateId, name, options);
  } catch (err) {
    if (err instanceof DealAuditValidationError) {
      throw new DealTemplatesError(err.message, 400, err.errors);
    }
    throw err;
  }
}

export function deleteOperatorTemplate(
  store: DealTemplateStore,
  operatorId: string,
  templateId: string
): void {
  getOperatorTemplate(store, operatorId, templateId);
  try {
    deleteDealTemplate(store.audit, templateId);
  } catch (err) {
    if (err instanceof DealAuditValidationError) {
      throw new DealTemplatesError(err.message, 400, err.errors);
    }
    throw err;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value != null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function parseMediaItem(raw: unknown): TemplateMediaPayload | null {
  const row = asRecord(raw);
  if (!row) return null;
  const mediaType = row.media_type ?? row.mediaType;
  const source = row.source;
  const url = row.url;
  const altText = row.alt_text ?? row.altText;
  if (
    !isMediaType(mediaType) ||
    !isMediaSource(source) ||
    typeof url !== "string" ||
    typeof altText !== "string"
  ) {
    return null;
  }
  return {
    media_type: mediaType,
    source,
    url,
    alt_text: altText,
    storage_key: (row.storage_key ?? row.storageKey ?? null) as string | null,
    is_cover: Boolean(row.is_cover ?? row.isCover ?? false),
    sort_order:
      typeof (row.sort_order ?? row.sortOrder) === "number"
        ? Number(row.sort_order ?? row.sortOrder)
        : 0,
    caption: (row.caption ?? null) as string | null,
    width: (row.width as number | null | undefined) ?? null,
    height: (row.height as number | null | undefined) ?? null,
    focal_x: (row.focal_x ?? row.focalX ?? null) as number | null,
    focal_y: (row.focal_y ?? row.focalY ?? null) as number | null,
    file_size_bytes: (row.file_size_bytes ??
      row.fileSizeBytes ??
      null) as number | null,
  };
}

function parsePriceOptionItem(
  raw: unknown
): TemplatePriceOptionPayload | null {
  const row = asRecord(raw);
  if (!row) return null;
  const label = row.label;
  const type = row.type;
  const original = row.original_price_minor ?? row.originalPriceMinor;
  const dealPrice = row.deal_price_minor ?? row.dealPriceMinor;
  if (
    typeof label !== "string" ||
    !isPriceOptionType(type) ||
    typeof original !== "number" ||
    typeof dealPrice !== "number"
  ) {
    return null;
  }
  const sourceRaw =
    row.original_price_source ?? row.originalPriceSource ?? "operator_entered";
  const originalPriceSource = isOriginalPriceSource(sourceRaw)
    ? sourceRaw
    : "operator_entered";
  return {
    label,
    type,
    original_price_minor: original,
    deal_price_minor: dealPrice,
    percentage:
      typeof (row.percentage ?? row.pct) === "number"
        ? Number(row.percentage ?? row.pct)
        : null,
    original_price_source: originalPriceSource,
    original_price_evidence_url: (row.original_price_evidence_url ??
      row.originalPriceEvidenceUrl ??
      null) as string | null,
    external_price_option_id: (row.external_price_option_id ??
      row.externalPriceOptionId ??
      null) as string | null,
    external_deal_price_option_id: (row.external_deal_price_option_id ??
      row.externalDealPriceOptionId ??
      null) as string | null,
    sort_order:
      typeof (row.sort_order ?? row.sortOrder) === "number"
        ? Number(row.sort_order ?? row.sortOrder)
        : 0,
  };
}

/**
 * Apply media + price_options from a template payload onto a newly created deal.
 * Called by createDraftDeal after the deal row exists.
 */
export function applyTemplateChildren(
  store: DealTemplateStore,
  dealId: string,
  payload: Record<string, unknown>,
  now: string
): void {
  const mediaRaw = payload.media;
  if (Array.isArray(mediaRaw)) {
    for (const item of mediaRaw) {
      const parsed = parseMediaItem(item);
      if (!parsed) continue;
      try {
        addDealMedia(
          store.media,
          {
            dealId,
            mediaType: parsed.media_type,
            source: parsed.source,
            url: parsed.url,
            altText: parsed.alt_text,
            storageKey: parsed.storage_key,
            isCover: parsed.is_cover,
            sortOrder: parsed.sort_order,
            caption: parsed.caption,
            width: parsed.width,
            height: parsed.height,
            focalX: parsed.focal_x,
            focalY: parsed.focal_y,
            fileSizeBytes: parsed.file_size_bytes,
          },
          { now }
        );
      } catch {
        // Skip invalid media rows rather than failing the whole create.
      }
    }
  }

  const pricesRaw = payload.price_options ?? payload.priceOptions;
  if (Array.isArray(pricesRaw)) {
    for (const item of pricesRaw) {
      const parsed = parsePriceOptionItem(item);
      if (!parsed) continue;
      const base = {
        originalPriceMinor: parsed.original_price_minor,
        dealPriceMinor: parsed.deal_price_minor,
      };
      const withPct = withDiscountPct(base);
      const option: DealPriceOption = {
        id: crypto.randomUUID(),
        dealId,
        label: parsed.label,
        type: parsed.type,
        externalPriceOptionId: parsed.external_price_option_id ?? null,
        externalDealPriceOptionId:
          parsed.external_deal_price_option_id ?? null,
        originalPriceMinor: parsed.original_price_minor,
        originalPriceSource:
          parsed.original_price_source ?? "operator_entered",
        originalPriceEvidenceUrl:
          parsed.original_price_evidence_url ?? null,
        dealPriceMinor: parsed.deal_price_minor,
        discountPct: withPct.discountPct,
        sortOrder: parsed.sort_order ?? 0,
        createdAt: now,
        updatedAt: now,
      };
      store.priceOptions.set(option.id, option);
    }
  }
}

/** Resolve deal_type stored on a template payload (snake or camel). */
export function dealTypeFromTemplatePayload(
  payload: Record<string, unknown>
): DealType | null {
  const raw = payload.deal_type ?? payload.dealType;
  return isDealType(raw) ? raw : null;
}

/** Client-facing template row (snake_case fields for API consistency). */
export function serializeDealTemplate(template: DealTemplate): {
  id: string;
  operator_id: string;
  name: string;
  payload: Record<string, unknown>;
  deal_type: DealType | null;
  created_at: string;
  updated_at: string;
} {
  const payload = template.payload ?? {};
  const dealTypeRaw = payload.deal_type ?? payload.dealType;
  return {
    id: template.id,
    operator_id: template.operatorId,
    name: template.name,
    payload,
    deal_type: isDealType(dealTypeRaw) ? dealTypeRaw : null,
    created_at: template.createdAt,
    updated_at: template.updatedAt,
  };
}
