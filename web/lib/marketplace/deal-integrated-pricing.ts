/**
 * Integrated pricing and discount verification (Chunk 33).
 *
 * - original_price_minor is read-only and always mirrors the provider price
 * - discount_mechanism: promo_code | price_option | separate_product
 * - separate_product refs stored as external_deal_price_option_id = `product:<uuid>`
 * - POST verify-discount → adapter.verifyDiscount per option (+ 50% rule)
 */

import type { Deal } from "./deal";
import { DealDraftError, type DealDraftStore } from "./deal-draft";
import {
  parseProviderPriceOptions,
  type IntegratedDealStore,
} from "./deal-integrated";
import {
  validateDealPriceOptionFields,
  type DealPriceOption,
} from "./deal-session";
import {
  DealNotFoundError,
  logDealEvent,
  type DealActor,
  type PublishValidationResult,
  type ValidateForPublishFn,
} from "./deal-status";
import type { ExternalProduct, Integration } from "./integration";
import {
  INTEGRATED_MECHANISMS,
  isIntegratedDealType,
  type DiscountMechanism,
} from "./enums";
import {
  maxDealPrice,
  meetsMinDiscount,
  meetsMinDiscountPercentage,
  priceFromPercentage,
  withDiscountPct,
} from "./pricing";
import { getPlatformConfig } from "./config";
import { getAdapter } from "./providers";
import type {
  NormalisedPriceOption,
  VerifyDiscountResult,
  VerifyDiscountStatus,
} from "./providers/types";
import { createValidateForPublishFromStore } from "./deal-publish-validation";

/** Options shared with deal-inventory mutations (avoid importing deal-inventory). */
export type IntegratedPricingMutationOptions = {
  actor: DealActor;
  now?: string;
  confirm?: boolean;
  validateForPublish?: ValidateForPublishFn;
};

export type IntegratedPriceOptionMutationResult = {
  priceOption: DealPriceOption;
  validation: PublishValidationResult;
};

class MinDiscountError extends DealDraftError {
  readonly maxDealPriceMinor: number;
  constructor(originalMinor: number, maxAllowed: number) {
    const { MIN_DISCOUNT_PCT } = getPlatformConfig();
    super(
      `Deal price must be ≤ ${maxAllowed} minor units (maximum allowed for ${MIN_DISCOUNT_PCT}% off an original of ${originalMinor}).`,
      400,
      [
        {
          field: "deal_price_minor",
          message: `must be ≤ ${maxAllowed} (max deal price for min ${MIN_DISCOUNT_PCT}% discount)`,
        },
      ]
    );
    this.name = "MinDiscountError";
    this.maxDealPriceMinor = maxAllowed;
  }
}

function resolveDealPriceMinor(args: {
  originalPriceMinor: number;
  dealPriceMinor?: number | null;
  percentage?: number | null;
  discountInputMode: Deal["discountInputMode"];
}): { dealPriceMinor: number; fromPercentage: boolean } {
  const { originalPriceMinor, discountInputMode } = args;
  const hasPct = args.percentage != null && Number.isFinite(args.percentage);
  const hasPrice =
    args.dealPriceMinor != null && Number.isInteger(args.dealPriceMinor);

  if (hasPct && (!hasPrice || discountInputMode === "percentage")) {
    const pct = args.percentage as number;
    if (!meetsMinDiscountPercentage(pct)) {
      const { MIN_DISCOUNT_PCT } = getPlatformConfig();
      throw new DealDraftError(
        `percentage must be ≥ ${MIN_DISCOUNT_PCT}`,
        400,
        [{ field: "percentage", message: `must be ≥ ${MIN_DISCOUNT_PCT}` }]
      );
    }
    return {
      dealPriceMinor: priceFromPercentage(originalPriceMinor, pct),
      fromPercentage: true,
    };
  }

  if (hasPrice) {
    return {
      dealPriceMinor: args.dealPriceMinor as number,
      fromPercentage: false,
    };
  }

  throw new DealDraftError(
    discountInputMode === "percentage"
      ? "percentage is required"
      : "deal_price_minor is required",
    400,
    [
      {
        field:
          discountInputMode === "percentage" ? "percentage" : "deal_price_minor",
        message: "required",
      },
    ]
  );
}

class LiveDealConfirmRequiredError extends DealDraftError {
  readonly validation: PublishValidationResult;
  readonly warnings: string[];
  constructor(
    message: string,
    validation: PublishValidationResult,
    warnings: string[]
  ) {
    super(message, 409);
    this.name = "LiveDealConfirmRequiredError";
    this.validation = validation;
    this.warnings = warnings;
  }
}

async function assertLiveConfirmOrThrow(
  store: DealDraftStore,
  deal: Deal,
  options: IntegratedPricingMutationOptions
): Promise<PublishValidationResult> {
  const validate =
    options.validateForPublish ??
    createValidateForPublishFromStore(store, {
      now: options.now,
      refreshStaleLinks: false,
    });
  const validation = await Promise.resolve(validate(deal));
  if (deal.status !== "live" || options.confirm === true) {
    return validation;
  }
  const warnings: string[] = [
    "This deal is live. Resend with confirm: true to apply the change.",
  ];
  for (const check of validation.checks) {
    if (!check.passed) {
      warnings.push(check.message ?? `${check.label} failed`);
    }
  }
  throw new LiveDealConfirmRequiredError(
    "Live deal changes require confirm: true",
    validation,
    warnings
  );
}

// ---------------------------------------------------------------------------
// Constants / types
// ---------------------------------------------------------------------------

/** Prefix for separate_product refs in DealPriceOption.externalDealPriceOptionId. */
export const SEPARATE_PRODUCT_REF_PREFIX = "product:" as const;

export type DiscountVerificationOptionResult = {
  price_option_id: string;
  status: VerifyDiscountStatus | "failed";
  message?: string;
  actual_price_minor?: number;
};

export type DiscountVerification = {
  /** Overall: verified only if every option verified; cannot_verify if any; else not_found/failed. */
  status: VerifyDiscountStatus | "failed";
  checked_at: string;
  options: DiscountVerificationOptionResult[];
};

export type VerifyDealDiscountResult = {
  deal: Deal;
  verification: DiscountVerification;
};

// ---------------------------------------------------------------------------
// Separate-product ref helpers (documented in deals-spec §3.3)
// ---------------------------------------------------------------------------

export function formatSeparateProductRef(externalProductId: string): string {
  return `${SEPARATE_PRODUCT_REF_PREFIX}${externalProductId}`;
}

export function parseSeparateProductRef(
  value: string | null | undefined
): string | null {
  if (value == null || typeof value !== "string") return null;
  if (!value.startsWith(SEPARATE_PRODUCT_REF_PREFIX)) return null;
  const id = value.slice(SEPARATE_PRODUCT_REF_PREFIX.length).trim();
  return id.length > 0 ? id : null;
}

export function isSeparateProductRef(value: string | null | undefined): boolean {
  return parseSeparateProductRef(value) != null;
}

// ---------------------------------------------------------------------------
// Store helpers
// ---------------------------------------------------------------------------

function requireDeal(store: DealDraftStore, dealId: string): Deal {
  const deal = store.deals.get(dealId);
  if (!deal) throw new DealNotFoundError(dealId);
  return deal;
}

function requireIntegratedDeal(deal: Deal): void {
  if (!isIntegratedDealType(deal.dealType)) {
    throw new DealDraftError(
      "Integrated pricing applies only to integrated deal types",
      400,
      [{ field: "deal_type", message: "must be an integrated deal type" }]
    );
  }
}

function requireIntegratedMechanism(deal: Deal): DiscountMechanism {
  const m = deal.discountMechanism;
  if (
    m == null ||
    !(INTEGRATED_MECHANISMS as readonly string[]).includes(m)
  ) {
    throw new DealDraftError(
      "discount_mechanism must be promo_code, price_option or separate_product",
      400,
      [
        {
          field: "discount_mechanism",
          message: "must be an integrated mechanism",
        },
      ]
    );
  }
  return m;
}

export function getDealExternalProduct(
  store: IntegratedDealStore,
  deal: Deal
): ExternalProduct {
  if (!deal.externalProductId) {
    throw new DealDraftError("Deal has no external_product_id", 400, [
      { field: "external_product_id", message: "required" },
    ]);
  }
  const product = store.externalProducts?.get(deal.externalProductId);
  if (!product) {
    throw new DealDraftError("External product not found", 404, [
      { field: "external_product_id", message: "not found" },
    ]);
  }
  return product;
}

export function getDealIntegration(
  store: IntegratedDealStore,
  deal: Deal
): Integration {
  if (!deal.integrationId) {
    throw new DealDraftError("Deal has no integration_id", 400, [
      { field: "integration_id", message: "required" },
    ]);
  }
  const integration = store.integrations?.get(deal.integrationId);
  if (!integration) {
    throw new DealDraftError("Integration not found", 404, [
      { field: "integration_id", message: "not found" },
    ]);
  }
  return integration;
}

/** Provider price options for the deal's product (picker for price_option). */
export function listProviderPriceOptionsForDeal(
  store: IntegratedDealStore,
  deal: Deal
): NormalisedPriceOption[] {
  const product = getDealExternalProduct(store, deal);
  return parseProviderPriceOptions(product);
}

function findProviderOptionPrice(
  product: ExternalProduct,
  externalId: string
): NormalisedPriceOption | null {
  return (
    parseProviderPriceOptions(product).find((p) => p.external_id === externalId) ??
    null
  );
}

function assertMinDiscount(originalMinor: number, dealMinor: number): void {
  if (!meetsMinDiscount(originalMinor, dealMinor)) {
    throw new MinDiscountError(originalMinor, maxDealPrice(originalMinor));
  }
}

/**
 * Sync original_price_minor on each integrated option from the current
 * provider product catalogue. Returns how many rows changed.
 */
export function syncIntegratedOriginalPrices(
  store: IntegratedDealStore,
  dealId: string,
  options?: { now?: string }
): { updated: number; options: DealPriceOption[] } {
  const deal = store.deals.get(dealId);
  if (!deal || !isIntegratedDealType(deal.dealType)) {
    return { updated: 0, options: [] };
  }
  const product = getDealExternalProduct(store, deal);
  const now = options?.now ?? new Date().toISOString();
  let updated = 0;
  const out: DealPriceOption[] = [];

  for (const [id, opt] of store.priceOptions) {
    if (opt.dealId !== dealId) continue;
    if (!opt.externalPriceOptionId) {
      out.push(opt);
      continue;
    }
    const providerOpt = findProviderOptionPrice(
      product,
      opt.externalPriceOptionId
    );
    if (!providerOpt) {
      out.push(opt);
      continue;
    }
    if (opt.originalPriceMinor === providerOpt.price_minor) {
      out.push(opt);
      continue;
    }
    const withPct = withDiscountPct({
      originalPriceMinor: providerOpt.price_minor,
      dealPriceMinor: opt.dealPriceMinor,
    });
    const next: DealPriceOption = {
      ...opt,
      originalPriceMinor: providerOpt.price_minor,
      originalPriceSource: "provider",
      discountPct: withPct.discountPct,
      updatedAt: now,
    };
    store.priceOptions.set(id, next);
    updated += 1;
    out.push(next);
  }

  return { updated, options: out.sort((a, b) => a.sortOrder - b.sortOrder) };
}

function resolveSeparateProductDealPrice(
  store: IntegratedDealStore,
  deal: Deal,
  option: DealPriceOption,
  separateProductId: string
): number {
  if (separateProductId === deal.externalProductId) {
    throw new DealDraftError(
      "separate_product must be a different ExternalProduct",
      400,
      [
        {
          field: "external_deal_price_option_id",
          message: "must reference a different product",
        },
      ]
    );
  }
  const separate = store.externalProducts?.get(separateProductId);
  if (!separate) {
    throw new DealDraftError("Separate product not found", 404, [
      {
        field: "external_deal_price_option_id",
        message: "product not found",
      },
    ]);
  }
  if (separate.integrationId !== deal.integrationId) {
    throw new DealDraftError(
      "Separate product must belong to the same integration",
      400,
      [
        {
          field: "external_deal_price_option_id",
          message: "wrong integration",
        },
      ]
    );
  }
  if (separate.archivedInProvider) {
    throw new DealDraftError("Separate product is archived in provider", 400, [
      {
        field: "external_deal_price_option_id",
        message: "product archived",
      },
    ]);
  }

  const prices = parseProviderPriceOptions(separate);
  if (prices.length === 0) {
    throw new DealDraftError("Separate product has no price options", 400, [
      {
        field: "external_deal_price_option_id",
        message: "no prices",
      },
    ]);
  }
  const sameType = prices.find((p) => p.type === option.type);
  return (sameType ?? prices[0]!).price_minor;
}

// ---------------------------------------------------------------------------
// Update integrated price option
// ---------------------------------------------------------------------------

export type IntegratedPriceOptionPatch = {
  label?: string | null;
  type?: string | null;
  /** Rejected for integrated — originals are provider-owned. */
  originalPriceMinor?: number | null;
  dealPriceMinor?: number | null;
  percentage?: number | null;
  externalDealPriceOptionId?: string | null;
  sortOrder?: number | null;
  confirm?: boolean;
};

function normalizeIntegratedPatch(
  raw: IntegratedPriceOptionPatch | Record<string, unknown>
): IntegratedPriceOptionPatch {
  const r = raw as Record<string, unknown>;
  const get = (...keys: string[]) => {
    for (const k of keys) {
      if (r[k] !== undefined) return r[k];
    }
    return undefined;
  };

  const pctRaw = get("percentage", "discount_pct_input", "pct");
  const dealRaw = get("dealPriceMinor", "deal_price_minor");
  const origRaw = get("originalPriceMinor", "original_price_minor");
  const extDeal = get(
    "externalDealPriceOptionId",
    "external_deal_price_option_id"
  );
  const sortRaw = get("sortOrder", "sort_order");
  const labelRaw = get("label");
  const typeRaw = get("type");

  return {
    label:
      labelRaw === undefined
        ? undefined
        : labelRaw === null
          ? null
          : String(labelRaw),
    type:
      typeRaw === undefined
        ? undefined
        : typeRaw === null
          ? null
          : String(typeRaw),
    originalPriceMinor:
      origRaw === undefined
        ? undefined
        : origRaw === null
          ? null
          : Number(origRaw),
    dealPriceMinor:
      dealRaw === undefined
        ? undefined
        : dealRaw === null
          ? null
          : Number(dealRaw),
    percentage:
      pctRaw === undefined
        ? undefined
        : pctRaw === null
          ? null
          : Number(pctRaw),
    externalDealPriceOptionId:
      extDeal === undefined
        ? undefined
        : extDeal === null
          ? null
          : String(extDeal),
    sortOrder:
      sortRaw === undefined
        ? undefined
        : sortRaw === null
          ? null
          : Number(sortRaw),
  };
}

/**
 * Update an integrated deal's price option.
 * Rejects PATCH of original_price_minor. Applies mechanism-specific rules.
 */
export async function updateIntegratedPriceOption(
  store: DealDraftStore,
  dealId: string,
  optionId: string,
  raw: IntegratedPriceOptionPatch | Record<string, unknown>,
  options: IntegratedPricingMutationOptions
): Promise<IntegratedPriceOptionMutationResult> {
  const deal = requireDeal(store, dealId);
  requireIntegratedDeal(deal);
  const mechanism = requireIntegratedMechanism(deal);
  const validation = await assertLiveConfirmOrThrow(store, deal, options);

  const existing = store.priceOptions.get(optionId);
  if (!existing || existing.dealId !== dealId) {
    throw new DealDraftError("Price option not found", 404);
  }

  const input = normalizeIntegratedPatch(raw);
  if (input.originalPriceMinor !== undefined) {
    throw new DealDraftError(
      "original_price_minor is read-only for integrated deals (always equals the provider price)",
      400,
      [
        {
          field: "original_price_minor",
          message: "read-only; synced from provider",
        },
      ]
    );
  }

  const now = options.now ?? new Date().toISOString();
  syncIntegratedOriginalPrices(store, dealId, { now });
  const synced = store.priceOptions.get(optionId)!;
  const product = getDealExternalProduct(store, deal);

  // Refresh original from provider for this option
  let originalPriceMinor = synced.originalPriceMinor;
  if (synced.externalPriceOptionId) {
    const providerOpt = findProviderOptionPrice(
      product,
      synced.externalPriceOptionId
    );
    if (providerOpt) {
      originalPriceMinor = providerOpt.price_minor;
    }
  }

  const label =
    input.label !== undefined
      ? input.label == null
        ? synced.label
        : input.label.trim()
      : synced.label;
  if (!label) {
    throw new DealDraftError("label is required", 400, [
      { field: "label", message: "required" },
    ]);
  }

  let type = synced.type;
  if (input.type !== undefined && input.type != null) {
    type = input.type as typeof synced.type;
  }

  let externalDealPriceOptionId = synced.externalDealPriceOptionId;
  if (input.externalDealPriceOptionId !== undefined) {
    externalDealPriceOptionId = input.externalDealPriceOptionId;
  }

  let dealPriceMinor = synced.dealPriceMinor;

  if (mechanism === "price_option") {
    if (!externalDealPriceOptionId) {
      throw new DealDraftError(
        "external_deal_price_option_id is required for price_option mechanism",
        400,
        [
          {
            field: "external_deal_price_option_id",
            message: "required for price_option",
          },
        ]
      );
    }
    if (isSeparateProductRef(externalDealPriceOptionId)) {
      throw new DealDraftError(
        "price_option mechanism expects a provider price option id, not a product: ref",
        400,
        [
          {
            field: "external_deal_price_option_id",
            message: "must be a provider price option id",
          },
        ]
      );
    }
    const dealOpt = findProviderOptionPrice(product, externalDealPriceOptionId);
    if (!dealOpt) {
      throw new DealDraftError(
        "Discounted price option not found on the provider product",
        400,
        [
          {
            field: "external_deal_price_option_id",
            message: "not found on product",
          },
        ]
      );
    }
    // deal_price is read-only from the selected provider option
    dealPriceMinor = dealOpt.price_minor;
    if (
      input.dealPriceMinor !== undefined &&
      input.dealPriceMinor != null &&
      input.dealPriceMinor !== dealPriceMinor
    ) {
      throw new DealDraftError(
        "deal_price_minor is read-only for price_option mechanism (taken from the selected provider option)",
        400,
        [
          {
            field: "deal_price_minor",
            message: "read-only for price_option",
          },
        ]
      );
    }
  } else if (mechanism === "separate_product") {
    let separateId = parseSeparateProductRef(externalDealPriceOptionId);
    if (
      input.externalDealPriceOptionId !== undefined &&
      input.externalDealPriceOptionId != null &&
      !isSeparateProductRef(input.externalDealPriceOptionId)
    ) {
      // Accept bare uuid and normalise to product:<id>
      separateId = input.externalDealPriceOptionId;
      externalDealPriceOptionId = formatSeparateProductRef(separateId);
    }
    if (!separateId) {
      throw new DealDraftError(
        "external_deal_price_option_id must be product:<external_product_uuid> for separate_product",
        400,
        [
          {
            field: "external_deal_price_option_id",
            message: "expected product:<uuid>",
          },
        ]
      );
    }
    dealPriceMinor = resolveSeparateProductDealPrice(
      store,
      deal,
      { ...synced, type },
      separateId
    );
    if (
      input.dealPriceMinor !== undefined &&
      input.dealPriceMinor != null &&
      input.dealPriceMinor !== dealPriceMinor
    ) {
      throw new DealDraftError(
        "deal_price_minor is read-only for separate_product (taken from the selected product)",
        400,
        [
          {
            field: "deal_price_minor",
            message: "read-only for separate_product",
          },
        ]
      );
    }
  } else {
    // promo_code — operator sets deal price / percentage
    const priceChanging =
      input.dealPriceMinor !== undefined || input.percentage !== undefined;
    if (priceChanging) {
      const resolved = resolveDealPriceMinor({
        originalPriceMinor,
        dealPriceMinor:
          input.dealPriceMinor !== undefined
            ? input.dealPriceMinor
            : input.percentage != null
              ? undefined
              : synced.dealPriceMinor,
        percentage: input.percentage,
        discountInputMode: deal.discountInputMode,
      });
      dealPriceMinor = resolved.dealPriceMinor;
    }
  }

  assertMinDiscount(originalPriceMinor, dealPriceMinor);

  const sortOrder =
    input.sortOrder !== undefined && input.sortOrder != null
      ? input.sortOrder
      : synced.sortOrder;

  const fieldErrors = validateDealPriceOptionFields({
    label,
    type,
    originalPriceMinor,
    dealPriceMinor,
    originalPriceSource: "provider",
    sortOrder,
  });
  if (fieldErrors.length > 0) {
    throw new DealDraftError("Invalid price option fields", 400, fieldErrors);
  }

  const withPct = withDiscountPct({ originalPriceMinor, dealPriceMinor });
  const updated: DealPriceOption = {
    ...synced,
    label,
    type,
    externalDealPriceOptionId,
    originalPriceMinor,
    originalPriceSource: "provider",
    dealPriceMinor,
    discountPct: withPct.discountPct,
    sortOrder,
    updatedAt: now,
  };

  store.priceOptions.set(optionId, updated);

  // Clear stale verification when prices change
  const dealRow = store.deals.get(dealId)!;
  if (dealRow.discountVerification != null) {
    store.deals.set(dealId, {
      ...dealRow,
      discountVerification: null,
      updatedAt: now,
    });
  }

  const oldSnapshot = {
    original_price_minor: existing.originalPriceMinor,
    deal_price_minor: existing.dealPriceMinor,
    discount_pct: existing.discountPct,
    external_deal_price_option_id: existing.externalDealPriceOptionId,
  };
  const newSnapshot = {
    original_price_minor: updated.originalPriceMinor,
    deal_price_minor: updated.dealPriceMinor,
    discount_pct: updated.discountPct,
    external_deal_price_option_id: updated.externalDealPriceOptionId,
  };
  if (JSON.stringify(oldSnapshot) !== JSON.stringify(newSnapshot)) {
    logDealEvent(
      store.audit,
      dealId,
      "price_changed",
      options.actor,
      {
        price_option_id: optionId,
        old: oldSnapshot,
        new: newSnapshot,
      },
      { now }
    );
  }

  return { priceOption: updated, validation };
}

// ---------------------------------------------------------------------------
// Verify discount
// ---------------------------------------------------------------------------

function overallStatus(
  optionResults: DiscountVerificationOptionResult[]
): VerifyDiscountStatus | "failed" {
  if (optionResults.length === 0) return "not_found";
  if (optionResults.some((o) => o.status === "failed")) return "failed";
  if (optionResults.some((o) => o.status === "not_found")) return "not_found";
  if (optionResults.every((o) => o.status === "verified")) return "verified";
  if (optionResults.some((o) => o.status === "cannot_verify")) {
    return "cannot_verify";
  }
  return "not_found";
}

function verificationLabel(
  providerName: string,
  status: VerifyDiscountStatus | "failed"
): string {
  switch (status) {
    case "verified":
      return `Verified in ${providerName}`;
    case "not_found":
      return "Not found";
    case "cannot_verify":
      return "Can't verify; confirm manually";
    case "failed":
      return "Verification failed";
  }
}

export function formatDiscountVerificationStatusText(
  provider: string,
  status: VerifyDiscountStatus | "failed" | null | undefined
): string {
  if (status == null) return "Not verified yet";
  const name =
    provider.charAt(0).toUpperCase() + provider.slice(1).toLowerCase();
  // Rezdy branding for rezdy; otherwise Title Case provider
  const display = provider === "rezdy" ? "Rezdy" : name;
  return verificationLabel(display, status);
}

/**
 * Verify discount configuration against the provider adapter.
 * Syncs originals first; fails closed when the 50% rule no longer holds
 * (e.g. provider original price dropped).
 */
export async function verifyDealDiscount(
  store: DealDraftStore,
  dealId: string,
  options: {
    actor: DealActor;
    now?: string;
    /** When true, set promo_code_confirmed_by_operator after cannot_verify. */
    promo_code_confirmed_by_operator?: boolean;
  }
): Promise<VerifyDealDiscountResult> {
  const deal = requireDeal(store, dealId);
  requireIntegratedDeal(deal);
  const mechanism = requireIntegratedMechanism(deal);
  const now = options.now ?? new Date().toISOString();

  syncIntegratedOriginalPrices(store, dealId, { now });
  const product = getDealExternalProduct(store, deal);
  const integration = getDealIntegration(store, deal);
  const adapter = getAdapter(integration.provider);

  const allOptions = [...store.priceOptions.values()]
    .filter((p) => p.dealId === dealId)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  // Skip placeholder rows still at full price with no discount link
  // (Chunk 32 seeds deal_price = original until the operator configures them).
  const priceOptions = allOptions.filter((opt) => {
    if (mechanism === "promo_code") {
      return opt.dealPriceMinor < opt.originalPriceMinor;
    }
    return (
      opt.externalDealPriceOptionId != null &&
      opt.externalDealPriceOptionId !== ""
    );
  });

  if (priceOptions.length === 0) {
    throw new DealDraftError(
      "Configure at least one price option with a deal price / discounted option before verifying",
      400,
      [{ field: "price_options", message: "no configured options to verify" }]
    );
  }

  if (mechanism === "promo_code") {
    const code = (deal.promoCode ?? "").trim();
    if (!code) {
      throw new DealDraftError("promo_code is required for this mechanism", 400, [
        { field: "promo_code", message: "required" },
      ]);
    }
  }

  const optionResults: DiscountVerificationOptionResult[] = [];

  for (const opt of priceOptions) {
    // Fail if original no longer matches provider (should have been synced)
    if (opt.externalPriceOptionId) {
      const providerOpt = findProviderOptionPrice(
        product,
        opt.externalPriceOptionId
      );
      if (!providerOpt) {
        optionResults.push({
          price_option_id: opt.id,
          status: "not_found",
          message: `Provider price option ${opt.externalPriceOptionId} no longer exists`,
        });
        continue;
      }
      if (providerOpt.price_minor !== opt.originalPriceMinor) {
        optionResults.push({
          price_option_id: opt.id,
          status: "failed",
          message: `Original price out of sync with provider (deal ${opt.originalPriceMinor}, provider ${providerOpt.price_minor})`,
          actual_price_minor: providerOpt.price_minor,
        });
        continue;
      }
    }

    if (!meetsMinDiscount(opt.originalPriceMinor, opt.dealPriceMinor)) {
      const maxAllowed = maxDealPrice(opt.originalPriceMinor);
      optionResults.push({
        price_option_id: opt.id,
        status: "failed",
        message: `Deal price ${opt.dealPriceMinor} no longer meets the minimum discount (max allowed ${maxAllowed} for original ${opt.originalPriceMinor})`,
        actual_price_minor: opt.dealPriceMinor,
      });
      continue;
    }

    let adapterInput: {
      mechanism: DiscountMechanism;
      promo_code?: string | null;
      external_deal_price_option_id?: string | null;
      expected_price_minor: number;
    };

    if (mechanism === "promo_code") {
      adapterInput = {
        mechanism: "promo_code",
        promo_code: deal.promoCode,
        expected_price_minor: opt.dealPriceMinor,
      };
    } else if (mechanism === "price_option") {
      if (!opt.externalDealPriceOptionId) {
        optionResults.push({
          price_option_id: opt.id,
          status: "not_found",
          message: "No discounted provider option selected",
        });
        continue;
      }
      adapterInput = {
        mechanism: "price_option",
        external_deal_price_option_id: opt.externalDealPriceOptionId,
        expected_price_minor: opt.dealPriceMinor,
      };
    } else {
      // separate_product — adapter usually cannot_verify; still call it,
      // then locally confirm the referenced product price matches.
      const separateId = parseSeparateProductRef(opt.externalDealPriceOptionId);
      if (!separateId) {
        optionResults.push({
          price_option_id: opt.id,
          status: "not_found",
          message: "No separate product selected",
        });
        continue;
      }
      try {
        const expected = resolveSeparateProductDealPrice(
          store,
          deal,
          opt,
          separateId
        );
        if (expected !== opt.dealPriceMinor) {
          optionResults.push({
            price_option_id: opt.id,
            status: "not_found",
            message: `Separate product price is ${expected}, deal has ${opt.dealPriceMinor}`,
            actual_price_minor: expected,
          });
          continue;
        }
      } catch (err) {
        optionResults.push({
          price_option_id: opt.id,
          status: "not_found",
          message: err instanceof Error ? err.message : "Separate product invalid",
        });
        continue;
      }
      adapterInput = {
        mechanism: "separate_product",
        external_deal_price_option_id: opt.externalDealPriceOptionId,
        expected_price_minor: opt.dealPriceMinor,
      };
    }

    let result: VerifyDiscountResult;
    try {
      result = await adapter.verifyDiscount(integration, adapterInput);
    } catch (err) {
      optionResults.push({
        price_option_id: opt.id,
        status: "failed",
        message:
          err instanceof Error ? err.message : "Provider verifyDiscount failed",
      });
      continue;
    }

    // For separate_product, local price match already passed — if adapter
    // cannot_verify, surface that (operator confirm path); if verified, keep it.
    if (
      mechanism === "separate_product" &&
      result.status === "cannot_verify"
    ) {
      optionResults.push({
        price_option_id: opt.id,
        status: "cannot_verify",
        message: "Provider cannot verify separate-product discounts",
        actual_price_minor: opt.dealPriceMinor,
      });
      continue;
    }

    optionResults.push({
      price_option_id: opt.id,
      status: result.status,
      actual_price_minor: result.actual_price_minor,
      message:
        result.status === "verified"
          ? undefined
          : result.status === "not_found"
            ? result.actual_price_minor != null
              ? `Provider price is ${result.actual_price_minor}, expected ${opt.dealPriceMinor}`
              : "Discount not found in provider"
            : "Provider cannot verify this discount",
    });
  }

  const status = overallStatus(optionResults);
  const verification: DiscountVerification = {
    status,
    checked_at: now,
    options: optionResults,
  };

  let promoConfirmed = deal.promoCodeConfirmedByOperator;
  if (
    options.promo_code_confirmed_by_operator === true &&
    (status === "cannot_verify" || mechanism === "promo_code")
  ) {
    promoConfirmed = true;
  }
  if (options.promo_code_confirmed_by_operator === false) {
    promoConfirmed = false;
  }

  const updatedDeal: Deal = {
    ...deal,
    discountVerification: verification,
    promoCodeConfirmedByOperator: promoConfirmed,
    updatedAt: now,
  };
  store.deals.set(dealId, updatedDeal);

  logDealEvent(
    store.audit,
    dealId,
    "updated",
    options.actor,
    {
      discount_verification: {
        status: verification.status,
        option_count: optionResults.length,
      },
    },
    { now }
  );

  return { deal: updatedDeal, verification };
}

/** Clear verification when mechanism / promo code changes. */
export function clearDiscountVerificationOnDeal(
  deal: Deal,
  now?: string
): Deal {
  return {
    ...deal,
    discountVerification: null,
    promoCodeConfirmedByOperator: false,
    updatedAt: now ?? new Date().toISOString(),
  };
}
