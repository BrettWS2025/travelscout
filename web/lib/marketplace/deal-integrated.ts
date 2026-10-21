/**
 * Integrated deal creation and content overrides (Chunk 32).
 *
 * Pure helpers + store mutations used by deal-draft, integration-sync and
 * deal-media-api. Does not import deal-draft (avoids cycles).
 */

import {
  addDealMedia,
  listDealMedia,
  type DealMedia,
  type DealMediaStore,
} from "./deal-media";
import type { Deal, DealFieldInput } from "./deal";
import type { DealPriceOption } from "./deal-session";
import {
  applyClientDealFieldPatch,
  DealNotFoundError,
  logDealEvent,
  type DealActor,
} from "./deal-status";
import type { DealAuditStore } from "./deal-audit";
import type { ExternalProduct, Integration } from "./integration";
import {
  isIntegratedDealType,
  isPriceOptionType,
  type DealStatus,
  type PriceOptionType,
  type SourceProvider,
} from "./enums";
import { withDiscountPct } from "./pricing";
import { getAdapter } from "./providers";
import type { NormalisedPriceOption } from "./providers/types";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class IntegratedDealError extends Error {
  readonly status: number;
  readonly errors?: { field: string; message: string }[];

  constructor(
    message: string,
    status = 400,
    errors?: { field: string; message: string }[]
  ) {
    super(message);
    this.name = "IntegratedDealError";
    this.status = status;
    this.errors = errors;
  }
}

// ---------------------------------------------------------------------------
// Minimal store shape (subset of DealDraftStore)
// ---------------------------------------------------------------------------

export type IntegratedDealStore = {
  deals: Map<string, Deal>;
  audit: DealAuditStore;
  media: DealMediaStore;
  priceOptions: Map<string, DealPriceOption>;
  integrations?: Map<string, Integration>;
  externalProducts?: Map<string, ExternalProduct>;
};

// ---------------------------------------------------------------------------
// Content fields that sync may overwrite unless listed in overridden_fields
// ---------------------------------------------------------------------------

/** Snake_case names stored in Deal.overriddenFields / API. */
export const INTEGRATED_CONTENT_OVERRIDE_FIELDS = [
  "title",
  "summary",
  "description",
  "duration_minutes",
  "location_name",
  "address",
  "latitude",
  "longitude",
  "region",
] as const;

export type IntegratedContentOverrideField =
  (typeof INTEGRATED_CONTENT_OVERRIDE_FIELDS)[number];

const OVERRIDE_FIELD_SET = new Set<string>(INTEGRATED_CONTENT_OVERRIDE_FIELDS);

/** Map snake_case override field → Deal camelCase key. */
export const OVERRIDE_FIELD_TO_DEAL_KEY: Record<
  IntegratedContentOverrideField,
  keyof Deal
> = {
  title: "title",
  summary: "summary",
  description: "description",
  duration_minutes: "durationMinutes",
  location_name: "locationName",
  address: "address",
  latitude: "latitude",
  longitude: "longitude",
  region: "region",
};

/** Deal camelCase → snake override field. */
export const DEAL_KEY_TO_OVERRIDE_FIELD: Partial<
  Record<keyof Deal, IntegratedContentOverrideField>
> = {
  title: "title",
  summary: "summary",
  description: "description",
  durationMinutes: "duration_minutes",
  locationName: "location_name",
  address: "address",
  latitude: "latitude",
  longitude: "longitude",
  region: "region",
};

const CONTENT_REFRESH_STATUSES: ReadonlySet<DealStatus> = new Set([
  "draft",
  "scheduled",
  "live",
]);

const SUMMARY_MAX = 160;

// ---------------------------------------------------------------------------
// Provider value extraction
// ---------------------------------------------------------------------------

export type ProviderContentValues = {
  title: string | null;
  summary: string | null;
  description: string | null;
  duration_minutes: number | null;
  location_name: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  region: string | null;
};

function locString(
  location: Record<string, unknown>,
  ...keys: string[]
): string | null {
  for (const k of keys) {
    const v = location[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function locNumber(
  location: Record<string, unknown>,
  ...keys: string[]
): number | null {
  for (const k of keys) {
    const v = location[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

export function deriveSummaryFromDescription(
  description: string | null | undefined
): string | null {
  if (description == null) return null;
  const trimmed = description.trim();
  if (!trimmed) return null;
  if (trimmed.length <= SUMMARY_MAX) return trimmed;
  return trimmed.slice(0, SUMMARY_MAX);
}

/** Current provider content values for a product (snake_case keys for API). */
export function providerValuesFromProduct(
  product: ExternalProduct
): ProviderContentValues {
  const location =
    product.location && typeof product.location === "object"
      ? product.location
      : {};
  const description = product.description?.trim() || null;
  const title = product.name?.trim() || null;
  return {
    title,
    summary: deriveSummaryFromDescription(description),
    description,
    duration_minutes: product.durationMinutes,
    location_name: locString(location, "name", "location_name", "locationName"),
    address: locString(location, "address"),
    latitude: locNumber(location, "latitude", "lat"),
    longitude: locNumber(location, "longitude", "lng", "lon"),
    region: locString(location, "region"),
  };
}

export function providerValuesAsDealPatch(
  values: ProviderContentValues
): DealFieldInput {
  return {
    title: values.title,
    summary: values.summary,
    description: values.description,
    durationMinutes: values.duration_minutes,
    locationName: values.location_name,
    address: values.address,
    latitude: values.latitude,
    longitude: values.longitude,
    region: values.region,
  };
}

// ---------------------------------------------------------------------------
// Product / integration resolution
// ---------------------------------------------------------------------------

function ensureExternalProducts(
  store: IntegratedDealStore
): Map<string, ExternalProduct> {
  if (!store.externalProducts) store.externalProducts = new Map();
  return store.externalProducts;
}

function ensureIntegrations(
  store: IntegratedDealStore
): Map<string, Integration> {
  if (!store.integrations) store.integrations = new Map();
  return store.integrations;
}

export function findExternalProduct(
  store: IntegratedDealStore,
  productId: string
): ExternalProduct | null {
  return ensureExternalProducts(store).get(productId) ?? null;
}

export function requireEnabledProductForDeal(
  store: IntegratedDealStore,
  operatorId: string,
  externalProductId: string
): { product: ExternalProduct; integration: Integration } {
  const product = findExternalProduct(store, externalProductId);
  if (!product) {
    throw new IntegratedDealError("external_product_id not found", 404, [
      { field: "external_product_id", message: "not found" },
    ]);
  }
  if (product.archivedInProvider) {
    throw new IntegratedDealError(
      "Product is archived in the provider and cannot be used for deals",
      400,
      [{ field: "external_product_id", message: "archived in provider" }]
    );
  }
  if (!product.isEnabledForDeals) {
    throw new IntegratedDealError(
      "Product is not enabled for deals. Enable it in Integration settings.",
      400,
      [{ field: "external_product_id", message: "not enabled for deals" }]
    );
  }

  const integration = ensureIntegrations(store).get(product.integrationId);
  if (!integration || integration.operatorId !== operatorId) {
    throw new IntegratedDealError(
      "Product does not belong to this operator",
      400,
      [{ field: "external_product_id", message: "wrong operator" }]
    );
  }
  if (
    integration.status !== "connected" &&
    integration.status !== "degraded"
  ) {
    throw new IntegratedDealError(
      "Integration must be connected to create an integrated deal",
      400,
      [{ field: "integration_id", message: "not connected" }]
    );
  }

  return { product, integration };
}

// ---------------------------------------------------------------------------
// Prefill helpers (media + price options)
// ---------------------------------------------------------------------------

function productImageUrls(product: ExternalProduct): string[] {
  const out: string[] = [];
  for (const raw of product.images ?? []) {
    if (typeof raw === "string" && raw.trim()) {
      out.push(raw.trim());
      continue;
    }
    if (raw && typeof raw === "object") {
      const o = raw as Record<string, unknown>;
      const url = o.url ?? o.src ?? o.href;
      if (typeof url === "string" && url.trim()) out.push(url.trim());
    }
  }
  return out;
}

function parseProviderPriceOptions(
  product: ExternalProduct
): NormalisedPriceOption[] {
  const out: NormalisedPriceOption[] = [];
  for (const raw of product.priceOptions ?? []) {
    if (!raw || typeof raw !== "object") continue;
    const po = raw as Record<string, unknown>;
    const externalId =
      typeof po.external_id === "string"
        ? po.external_id
        : typeof po.externalId === "string"
          ? po.externalId
          : null;
    const label =
      typeof po.label === "string" && po.label.trim()
        ? po.label.trim()
        : "Option";
    const typeRaw = po.type;
    const type: PriceOptionType = isPriceOptionType(typeRaw)
      ? typeRaw
      : "adult";
    const priceMinor =
      typeof po.price_minor === "number"
        ? po.price_minor
        : typeof po.priceMinor === "number"
          ? po.priceMinor
          : null;
    const currency =
      typeof po.currency === "string" && po.currency.trim()
        ? po.currency.trim()
        : "NZD";
    if (!externalId || priceMinor == null || !Number.isFinite(priceMinor)) {
      continue;
    }
    out.push({
      external_id: externalId,
      label,
      type,
      price_minor: Math.round(priceMinor),
      currency,
    });
  }
  return out;
}

function altTextForProviderImage(productName: string, index: number): string {
  const base = productName.trim() || "Product";
  const suffix = ` image ${index + 1}`;
  const max = 150;
  if (base.length + suffix.length <= max) return `${base}${suffix}`;
  return `${base.slice(0, max - suffix.length)}${suffix}`;
}

/**
 * Import provider images onto a deal (source=provider). First image is cover
 * when no images exist. Skips URLs already present. Respects the 12-image limit.
 */
export function importProviderImagesFromProduct(
  store: IntegratedDealStore,
  dealId: string,
  product: ExternalProduct,
  options?: { now?: string; clearExistingProvider?: boolean }
): { imported: number; media: DealMedia[] } {
  const deal = store.deals.get(dealId);
  if (!deal) throw new DealNotFoundError(dealId);

  const now = options?.now ?? new Date().toISOString();

  if (options?.clearExistingProvider) {
    for (const m of listDealMedia(store.media, dealId)) {
      if (m.source === "provider") {
        store.media.media.delete(m.id);
      }
    }
  }

  const existingUrls = new Set(
    listDealMedia(store.media, dealId).map((m) => m.url)
  );
  let imported = 0;
  const urls = productImageUrls(product);

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]!;
    if (existingUrls.has(url)) continue;
    try {
      const imageCount = listDealMedia(store.media, dealId).filter(
        (m) => m.mediaType === "image"
      ).length;
      addDealMedia(
        store.media,
        {
          dealId,
          mediaType: "image",
          source: "provider",
          url,
          altText: altTextForProviderImage(product.name, i),
          isCover: imageCount === 0,
          sortOrder: imageCount,
        },
        { now }
      );
      existingUrls.add(url);
      imported += 1;
    } catch {
      break;
    }
  }

  return { imported, media: listDealMedia(store.media, dealId) };
}

function seedPriceOptionsFromProduct(
  store: IntegratedDealStore,
  dealId: string,
  product: ExternalProduct,
  now: string
): DealPriceOption[] {
  const created: DealPriceOption[] = [];
  const options = parseProviderPriceOptions(product);
  options.forEach((po, index) => {
    const base = {
      originalPriceMinor: po.price_minor,
      // Placeholder until Chunk 33 sets the deal price / mechanism.
      dealPriceMinor: po.price_minor,
    };
    const withPct = withDiscountPct(base);
    const option: DealPriceOption = {
      id: crypto.randomUUID(),
      dealId,
      label: po.label,
      type: po.type,
      externalPriceOptionId: po.external_id,
      externalDealPriceOptionId: null,
      originalPriceMinor: po.price_minor,
      originalPriceSource: "provider",
      originalPriceEvidenceUrl: null,
      dealPriceMinor: po.price_minor,
      discountPct: withPct.discountPct,
      sortOrder: index,
      createdAt: now,
      updatedAt: now,
    };
    store.priceOptions.set(option.id, option);
    created.push(option);
  });
  return created;
}

export function buildDefaultBookingUrl(
  integration: Integration,
  product: ExternalProduct
): string | null {
  try {
    const adapter = getAdapter(integration.provider);
    return adapter.buildBookingUrl(integration, {
      external_id: product.externalId,
      name: product.name,
    });
  } catch {
    if (integration.bookingBaseUrl) {
      return `${integration.bookingBaseUrl.replace(/\/$/, "")}/book/${product.externalId}`;
    }
    return null;
  }
}

/**
 * Content + booking fields to merge onto a new integrated deal from a product.
 * Caller sets slug and persists; then call applyIntegratedProductChildren.
 */
export function integratedPrefillDealFields(
  product: ExternalProduct,
  integration: Integration
): DealFieldInput {
  const values = providerValuesFromProduct(product);
  const contentPatch = providerValuesAsDealPatch(values);
  const bookingType =
    integration.defaultBookingDestinationType ?? "provider_booking_page";
  const bookingUrl =
    bookingType === "provider_booking_page" ||
    bookingType === "operator_website"
      ? buildDefaultBookingUrl(integration, product) ??
        integration.bookingBaseUrl
      : null;

  return {
    ...contentPatch,
    integrationId: integration.id,
    externalProductId: product.id,
    sourceProvider: integration.provider as SourceProvider,
    capacityMode: "live_provider",
    overriddenFields: [],
    bookingDestinationType: bookingType,
    ...(bookingUrl ? { bookingUrl } : {}),
  };
}

/** Seed provider media + price options after the deal row exists. */
export function applyIntegratedProductChildren(
  store: IntegratedDealStore,
  dealId: string,
  product: ExternalProduct,
  options?: { now?: string }
): void {
  const now = options?.now ?? new Date().toISOString();
  importProviderImagesFromProduct(store, dealId, product, { now });
  seedPriceOptionsFromProduct(store, dealId, product, now);
}

// ---------------------------------------------------------------------------
// Override tracking on PATCH
// ---------------------------------------------------------------------------

export function normalizeOverrideFieldName(
  raw: string
): IntegratedContentOverrideField | null {
  if (OVERRIDE_FIELD_SET.has(raw)) {
    return raw as IntegratedContentOverrideField;
  }
  const snake = raw.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
  if (OVERRIDE_FIELD_SET.has(snake)) {
    return snake as IntegratedContentOverrideField;
  }
  return null;
}

/**
 * Given a validated client patch on an integrated deal, return the new
 * overriddenFields list (union of existing + any content fields in the patch).
 */
export function mergeOverriddenFieldsFromPatch(
  deal: Deal,
  patch: DealFieldInput
): string[] {
  if (!isIntegratedDealType(deal.dealType) || !deal.externalProductId) {
    return deal.overriddenFields ?? [];
  }
  const next = new Set(deal.overriddenFields ?? []);
  for (const [key, value] of Object.entries(patch) as Array<
    [keyof DealFieldInput, unknown]
  >) {
    if (value === undefined) continue;
    const field = DEAL_KEY_TO_OVERRIDE_FIELD[key as keyof Deal];
    if (field) next.add(field);
  }
  return [...next];
}

/** Strip client attempts to set overridden_fields directly. */
export function stripOverriddenFieldsFromPatch(
  patch: DealFieldInput
): DealFieldInput {
  const { overriddenFields: _ignored, ...rest } = patch;
  return rest;
}

// ---------------------------------------------------------------------------
// Revert field
// ---------------------------------------------------------------------------

export function revertDealContentField(
  store: IntegratedDealStore,
  dealId: string,
  fieldRaw: string,
  options: { actor: DealActor; now?: string }
): { deal: Deal; field: IntegratedContentOverrideField; titleChanged: boolean } {
  const deal = store.deals.get(dealId);
  if (!deal) throw new DealNotFoundError(dealId);

  if (!isIntegratedDealType(deal.dealType) || !deal.externalProductId) {
    throw new IntegratedDealError(
      "Only integrated deals linked to a product support field revert",
      400,
      [{ field: "field", message: "not an integrated product deal" }]
    );
  }

  const field = normalizeOverrideFieldName(fieldRaw);
  if (!field) {
    throw new IntegratedDealError(
      `Unknown or non-revertable field: ${fieldRaw}`,
      400,
      [{ field: "field", message: "invalid content field" }]
    );
  }

  const product = findExternalProduct(store, deal.externalProductId);
  if (!product) {
    throw new IntegratedDealError("Linked external product not found", 404, [
      { field: "external_product_id", message: "not found" },
    ]);
  }

  const values = providerValuesFromProduct(product);
  const dealKey = OVERRIDE_FIELD_TO_DEAL_KEY[field];
  const providerPatch = providerValuesAsDealPatch(values);
  const restoreValue = providerPatch[dealKey as keyof DealFieldInput];

  const now = options.now ?? new Date().toISOString();
  const overriddenFields = (deal.overriddenFields ?? []).filter(
    (f) => f !== field
  );

  let updated = applyClientDealFieldPatch(
    deal,
    {
      [dealKey]: restoreValue,
      overriddenFields,
    } as DealFieldInput,
    { now }
  );
  updated = {
    ...updated,
    overriddenFields,
    updatedBy: options.actor.id ?? updated.updatedBy,
  };

  const titleChanged =
    field === "title" &&
    deal.status === "draft" &&
    updated.title != null &&
    updated.title !== deal.title;

  store.deals.set(dealId, updated);
  logDealEvent(
    store.audit,
    dealId,
    "updated",
    options.actor,
    { fields: [field], reverted: true },
    { now }
  );
  return { deal: updated, field, titleChanged };
}

// ---------------------------------------------------------------------------
// Sync content refresh
// ---------------------------------------------------------------------------

/**
 * After a product upsert, refresh non-overridden content on linked deals
 * that are draft, scheduled, or live.
 */
export function refreshDealsFromExternalProduct(
  store: IntegratedDealStore,
  product: ExternalProduct,
  options?: { now?: string }
): string[] {
  const now = options?.now ?? new Date().toISOString();
  const values = providerValuesFromProduct(product);
  const fullPatch = providerValuesAsDealPatch(values);
  const affected: string[] = [];

  for (const [id, deal] of store.deals) {
    if (deal.externalProductId !== product.id) continue;
    if (!CONTENT_REFRESH_STATUSES.has(deal.status)) continue;
    if (!isIntegratedDealType(deal.dealType)) continue;

    const overridden = new Set(deal.overriddenFields ?? []);
    const patch: DealFieldInput = {};
    for (const field of INTEGRATED_CONTENT_OVERRIDE_FIELDS) {
      if (overridden.has(field)) continue;
      const dealKey = OVERRIDE_FIELD_TO_DEAL_KEY[field];
      const v = fullPatch[dealKey as keyof DealFieldInput];
      if (v !== undefined) {
        (patch as Record<string, unknown>)[dealKey] = v;
      }
    }

    if (Object.keys(patch).length === 0) continue;

    const updated = applyClientDealFieldPatch(deal, patch, { now });
    store.deals.set(id, updated);
    affected.push(id);

    logDealEvent(
      store.audit,
      id,
      "updated",
      { type: "system" },
      {
        fields: Object.keys(patch).map(
          (k) => DEAL_KEY_TO_OVERRIDE_FIELD[k as keyof Deal] ?? k
        ),
        synced_from_product: product.externalId,
      },
      { now }
    );
  }

  return affected;
}

// ---------------------------------------------------------------------------
// GET detail enrichment
// ---------------------------------------------------------------------------

export function providerValuesForDeal(
  store: IntegratedDealStore,
  deal: Deal
): ProviderContentValues | null {
  if (!deal.externalProductId) return null;
  const product = findExternalProduct(store, deal.externalProductId);
  if (!product) return null;
  return providerValuesFromProduct(product);
}

/** Enabled, non-archived products for the deal editor picker. */
export type IntegratedProductPickerItem = {
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

function priceRangeFromProduct(product: ExternalProduct): {
  min: number | null;
  max: number | null;
  currency: string | null;
} {
  const options = parseProviderPriceOptions(product);
  if (options.length === 0) {
    return { min: null, max: null, currency: null };
  }
  let min = options[0]!.price_minor;
  let max = options[0]!.price_minor;
  for (const po of options) {
    min = Math.min(min, po.price_minor);
    max = Math.max(max, po.price_minor);
  }
  return { min, max, currency: options[0]!.currency };
}

export function listIntegratedProductsForPicker(
  store: IntegratedDealStore,
  operatorId: string,
  options?: {
    now?: string | Date;
    sessionsInNextLeadHours?: (
      productId: string,
      now: Date,
      leadHours: number
    ) => number;
    leadHours?: number;
  }
): IntegratedProductPickerItem[] {
  const integrations = [...ensureIntegrations(store).values()].filter(
    (i) =>
      i.operatorId === operatorId &&
      (i.status === "connected" || i.status === "degraded")
  );
  if (integrations.length === 0) return [];

  const nowDate =
    options?.now instanceof Date
      ? options.now
      : options?.now
        ? new Date(options.now)
        : new Date();
  const lead = options?.leadHours ?? 72;
  const out: IntegratedProductPickerItem[] = [];

  for (const integration of integrations) {
    for (const product of ensureExternalProducts(store).values()) {
      if (product.integrationId !== integration.id) continue;
      if (!product.isEnabledForDeals || product.archivedInProvider) continue;
      const range = priceRangeFromProduct(product);
      const urls = productImageUrls(product);
      out.push({
        id: product.id,
        integration_id: integration.id,
        provider: integration.provider,
        external_id: product.externalId,
        name: product.name,
        thumbnail_url: urls[0] ?? null,
        price_min_minor: range.min,
        price_max_minor: range.max,
        currency: range.currency,
        sessions_next_72h: options?.sessionsInNextLeadHours
          ? options.sessionsInNextLeadHours(product.id, nowDate, lead)
          : 0,
      });
    }
  }

  return out.sort((a, b) => a.name.localeCompare(b.name));
}
