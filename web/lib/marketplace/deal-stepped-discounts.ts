/**
 * Stepped discounts (deals platform Chunk 43).
 *
 * When `stepped_discount_enabled`, a deal deepens its discount as departure
 * approaches. Every step must still meet MIN_DISCOUNT_PCT (via validateSteps).
 *
 * `currentPrice(option, session, now)` picks the deepest active step (or the
 * base deal price). Used by list, Book now, and the status-ticker hook.
 */

import { getPlatformConfig } from "./config";
import {
  DealDraftError,
  type DealDraftStore,
} from "./deal-draft";
import type { Deal } from "./deal";
import {
  assertLiveConfirmOrThrow,
  type InventoryMutationOptions,
} from "./deal-inventory";
import {
  validateDiscountStepFields,
  type DealPriceOption,
  type DealSession,
  type DiscountStep,
} from "./deal-session";
import {
  DealNotFoundError,
  logDealEvent,
  type DealActor,
  type PublishValidationResult,
} from "./deal-status";
import {
  isIntegratedDealType,
  type DiscountMechanism,
} from "./enums";
import {
  discountPct,
  maxDealPrice,
  meetsMinDiscount,
  validateSteps,
} from "./pricing";
import { getAdapter } from "./providers";
import type { VerifyDiscountStatus } from "./providers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CurrentPriceResult = {
  /** Active deal price in minor units (step or base). */
  dealPriceMinor: number;
  /** Promo / quote code for the active step, else deal.promoCode, else null. */
  promoCode: string | null;
  /** Provider discounted option id for price_option steps. */
  externalDealPriceOptionId: string | null;
  /** Active step, or null when using the base deal price. */
  step: DiscountStep | null;
  /** Hours until session start (may be negative if past). */
  hoursUntilStart: number;
  /** Discount % at 1 dp for the active price vs option original. */
  discountPct: number | null;
};

export type DiscountDisplayCacheEntry = {
  stepId: string | null;
  dealPriceMinor: number;
  promoCode: string | null;
  hoursBeforeStart: number | null;
};

export type DiscountStepMutationResult = {
  step: DiscountStep;
  validation: PublishValidationResult;
};

export type CreateDiscountStepInput = {
  price_option_id?: string;
  priceOptionId?: string;
  hours_before_start?: number;
  hoursBeforeStart?: number;
  deal_price_minor?: number;
  dealPriceMinor?: number;
  promo_code?: string | null;
  promoCode?: string | null;
  external_deal_price_option_id?: string | null;
  externalDealPriceOptionId?: string | null;
  confirm?: boolean;
};

// ---------------------------------------------------------------------------
// Pure: hours + currentPrice
// ---------------------------------------------------------------------------

/** Fractional hours from `now` until session start (negative if past). */
export function hoursUntilSessionStart(
  sessionStartAt: string,
  now: string
): number {
  const startMs = Date.parse(sessionStartAt);
  const nowMs = Date.parse(now);
  if (!Number.isFinite(startMs) || !Number.isFinite(nowMs)) return NaN;
  return (startMs - nowMs) / 3_600_000;
}

/**
 * Deepest step whose `hours_before_start ≥ hours until start`, else base price.
 *
 * Example: steps 72h / 24h / 6h — at 30h until start only 72h applies; at 20h
 * both 72 and 24 apply and 24 (deeper) wins; at 5h the 6h step wins.
 */
export function currentPrice(
  option: Pick<DealPriceOption, "id" | "dealPriceMinor" | "originalPriceMinor">,
  session: Pick<DealSession, "startAt">,
  now: string,
  steps: DiscountStep[],
  dealPromoCode?: string | null
): CurrentPriceResult {
  const hoursUntil = hoursUntilSessionStart(session.startAt, now);
  const optionSteps = steps.filter((s) => s.priceOptionId === option.id);

  let active: DiscountStep | null = null;
  if (Number.isFinite(hoursUntil) && optionSteps.length > 0) {
    const applicable = optionSteps.filter(
      (s) => s.hoursBeforeStart >= hoursUntil
    );
    if (applicable.length > 0) {
      // Deepest = smallest hours_before_start among those still active.
      active = applicable.reduce((best, s) =>
        s.hoursBeforeStart < best.hoursBeforeStart ? s : best
      );
    }
  }

  const dealPriceMinor = active?.dealPriceMinor ?? option.dealPriceMinor;
  const promoCode =
    active?.promoCode ??
    (dealPromoCode != null && dealPromoCode !== "" ? dealPromoCode : null);
  const externalDealPriceOptionId = active?.externalDealPriceOptionId ?? null;

  return {
    dealPriceMinor,
    promoCode,
    externalDealPriceOptionId,
    step: active,
    hoursUntilStart: hoursUntil,
    discountPct: discountPct(option.originalPriceMinor, dealPriceMinor),
  };
}

/**
 * Among price options, pick the one with the lowest *current* deal price for
 * the given session (ties → lowest original, then sort_order).
 */
export function lowestCurrentPriceOption(
  options: DealPriceOption[],
  session: Pick<DealSession, "startAt"> | null,
  now: string,
  steps: DiscountStep[],
  deal?: Pick<Deal, "steppedDiscountEnabled" | "promoCode"> | null
): {
  option: DealPriceOption | null;
  current: CurrentPriceResult | null;
} {
  if (options.length === 0) return { option: null, current: null };

  const stepped = deal?.steppedDiscountEnabled === true && session != null;
  if (!stepped || session == null) {
    const sorted = [...options].sort((a, b) => {
      if (a.dealPriceMinor !== b.dealPriceMinor) {
        return a.dealPriceMinor - b.dealPriceMinor;
      }
      if (a.originalPriceMinor !== b.originalPriceMinor) {
        return a.originalPriceMinor - b.originalPriceMinor;
      }
      return a.sortOrder - b.sortOrder;
    });
    const option = sorted[0]!;
    return {
      option,
      current: {
        dealPriceMinor: option.dealPriceMinor,
        promoCode: deal?.promoCode ?? null,
        externalDealPriceOptionId: option.externalDealPriceOptionId,
        step: null,
        hoursUntilStart: session
          ? hoursUntilSessionStart(session.startAt, now)
          : NaN,
        discountPct: option.discountPct,
      },
    };
  }

  let bestOption: DealPriceOption | null = null;
  let bestCurrent: CurrentPriceResult | null = null;
  for (const opt of options) {
    const cur = currentPrice(opt, session, now, steps, deal?.promoCode);
    if (
      bestCurrent == null ||
      cur.dealPriceMinor < bestCurrent.dealPriceMinor ||
      (cur.dealPriceMinor === bestCurrent.dealPriceMinor &&
        opt.originalPriceMinor < (bestOption?.originalPriceMinor ?? Infinity)) ||
      (cur.dealPriceMinor === bestCurrent.dealPriceMinor &&
        opt.originalPriceMinor === bestOption?.originalPriceMinor &&
        opt.sortOrder < (bestOption?.sortOrder ?? Infinity))
    ) {
      bestOption = opt;
      bestCurrent = cur;
    }
  }
  return { option: bestOption, current: bestCurrent };
}

// ---------------------------------------------------------------------------
// Store helpers
// ---------------------------------------------------------------------------

function requireDeal(store: DealDraftStore, dealId: string): Deal {
  const deal = store.deals.get(dealId);
  if (!deal) throw new DealNotFoundError(dealId);
  return deal;
}

function requirePriceOption(
  store: DealDraftStore,
  dealId: string,
  optionId: string
): DealPriceOption {
  const opt = store.priceOptions.get(optionId);
  if (!opt || opt.dealId !== dealId) {
    throw new DealDraftError("Price option not found", 404, [
      { field: "price_option_id", message: "not found on this deal" },
    ]);
  }
  return opt;
}

function stepsForOption(
  store: DealDraftStore,
  dealId: string,
  optionId: string
): DiscountStep[] {
  return [...store.discountSteps.values()]
    .filter((s) => s.dealId === dealId && s.priceOptionId === optionId)
    .sort((a, b) => b.hoursBeforeStart - a.hoursBeforeStart);
}

function stepsForDeal(store: DealDraftStore, dealId: string): DiscountStep[] {
  return [...store.discountSteps.values()].filter((s) => s.dealId === dealId);
}

function getCache(store: DealDraftStore): Map<string, DiscountDisplayCacheEntry> {
  if (!store.discountDisplayCache) {
    store.discountDisplayCache = new Map();
  }
  return store.discountDisplayCache;
}

function getBody(
  body: Record<string, unknown>,
  camel: string,
  snake: string
): unknown {
  if (Object.prototype.hasOwnProperty.call(body, camel)) return body[camel];
  if (Object.prototype.hasOwnProperty.call(body, snake)) return body[snake];
  return undefined;
}

function parseRequiredInt(
  value: unknown,
  field: string
): number {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    return Number(value.trim());
  }
  throw new DealDraftError(`${field} must be an integer`, 400, [
    { field, message: "must be an integer" },
  ]);
}

function parseOptionalString(
  value: unknown,
  field: string
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new DealDraftError(`${field} must be a string`, 400, [
      { field, message: "must be a string" },
    ]);
  }
  return value;
}

function assertMechanismStepFields(
  deal: Deal,
  step: {
    promoCode: string | null;
    externalDealPriceOptionId: string | null;
  }
): void {
  const mechanism = deal.discountMechanism;
  if (mechanism === "promo_code" || mechanism === "quote_code") {
    if (!step.promoCode) {
      throw new DealDraftError(
        "promo_code is required on each step for this discount mechanism",
        400,
        [{ field: "promo_code", message: "required for promo_code / quote_code steps" }]
      );
    }
  }
  if (mechanism === "price_option") {
    if (!step.externalDealPriceOptionId) {
      throw new DealDraftError(
        "external_deal_price_option_id is required on each step for price_option",
        400,
        [
          {
            field: "external_deal_price_option_id",
            message: "required for price_option steps",
          },
        ]
      );
    }
  }
}

function assertValidateStepsOrThrow(
  option: DealPriceOption,
  steps: DiscountStep[]
): void {
  const sorted = [...steps].sort(
    (a, b) => b.hoursBeforeStart - a.hoursBeforeStart
  );
  const errors = validateSteps(
    sorted.map((s) => ({
      hoursBeforeStart: s.hoursBeforeStart,
      dealPriceMinor: s.dealPriceMinor,
      promoCode: s.promoCode,
    })),
    {
      originalPriceMinor: option.originalPriceMinor,
      dealPriceMinor: option.dealPriceMinor,
    }
  );
  if (errors.length > 0) {
    throw new DealDraftError("Invalid discount steps", 400, errors);
  }
}

async function verifyIntegratedStep(
  store: DealDraftStore,
  deal: Deal,
  step: {
    dealPriceMinor: number;
    promoCode: string | null;
    externalDealPriceOptionId: string | null;
  }
): Promise<{ status: VerifyDiscountStatus; message?: string }> {
  if (!isIntegratedDealType(deal.dealType)) {
    return { status: "verified" };
  }
  if (!deal.integrationId) {
    throw new DealDraftError("Deal has no integration", 400, [
      { field: "integration_id", message: "required for integrated step verify" },
    ]);
  }
  const integration = store.integrations?.get(deal.integrationId);
  if (!integration) {
    throw new DealDraftError("Integration not found", 400, [
      { field: "integration_id", message: "not found" },
    ]);
  }

  const mechanism = deal.discountMechanism as DiscountMechanism | null;
  if (
    mechanism !== "promo_code" &&
    mechanism !== "price_option" &&
    mechanism !== "separate_product"
  ) {
    return { status: "verified" };
  }

  const adapter = getAdapter(integration.provider);
  const result = await adapter.verifyDiscount(integration, {
    mechanism,
    promo_code: step.promoCode,
    external_deal_price_option_id: step.externalDealPriceOptionId,
    expected_price_minor: step.dealPriceMinor,
  });

  if (result.status === "not_found") {
    throw new DealDraftError(
      "Step discount not found in provider",
      400,
      [
        {
          field:
            mechanism === "promo_code"
              ? "promo_code"
              : "external_deal_price_option_id",
          message: "not found in provider",
        },
      ]
    );
  }
  if (
    result.status === "verified" &&
    result.actual_price_minor != null &&
    result.actual_price_minor !== step.dealPriceMinor
  ) {
    throw new DealDraftError(
      `Provider price ${result.actual_price_minor} ≠ step deal price ${step.dealPriceMinor}`,
      400,
      [
        {
          field: "deal_price_minor",
          message: `must equal provider price ${result.actual_price_minor}`,
        },
      ]
    );
  }
  // cannot_verify is allowed (operator confirms at publish, same as base)
  return { status: result.status };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export function listDiscountSteps(
  store: DealDraftStore,
  dealId: string,
  priceOptionId?: string
): DiscountStep[] {
  requireDeal(store, dealId);
  const all = stepsForDeal(store, dealId);
  const filtered = priceOptionId
    ? all.filter((s) => s.priceOptionId === priceOptionId)
    : all;
  return filtered.sort((a, b) => {
    if (a.priceOptionId !== b.priceOptionId) {
      return a.priceOptionId.localeCompare(b.priceOptionId);
    }
    return b.hoursBeforeStart - a.hoursBeforeStart;
  });
}

export async function createDiscountStep(
  store: DealDraftStore,
  dealId: string,
  raw: CreateDiscountStepInput | Record<string, unknown>,
  options: InventoryMutationOptions
): Promise<DiscountStepMutationResult> {
  const deal = requireDeal(store, dealId);
  const body = raw as Record<string, unknown>;
  const now = options.now ?? new Date().toISOString();

  if (!deal.steppedDiscountEnabled) {
    throw new DealDraftError(
      "Enable stepped_discount_enabled before adding steps",
      400,
      [{ field: "stepped_discount_enabled", message: "must be true" }]
    );
  }

  const validation = await assertLiveConfirmOrThrow(store, deal, {
    ...options,
    confirm: body.confirm === true || options.confirm === true,
  });

  const optionIdRaw = getBody(body, "priceOptionId", "price_option_id");
  if (typeof optionIdRaw !== "string" || optionIdRaw.trim() === "") {
    throw new DealDraftError("price_option_id is required", 400, [
      { field: "price_option_id", message: "required" },
    ]);
  }
  const option = requirePriceOption(store, dealId, optionIdRaw.trim());

  const hoursBeforeStart = parseRequiredInt(
    getBody(body, "hoursBeforeStart", "hours_before_start"),
    "hours_before_start"
  );
  const dealPriceMinor = parseRequiredInt(
    getBody(body, "dealPriceMinor", "deal_price_minor"),
    "deal_price_minor"
  );
  let promoCode =
    parseOptionalString(
      getBody(body, "promoCode", "promo_code"),
      "promo_code"
    ) ?? null;
  if (promoCode) promoCode = promoCode.toUpperCase().replace(/\s/g, "");
  const externalDealPriceOptionId =
    parseOptionalString(
      getBody(body, "externalDealPriceOptionId", "external_deal_price_option_id"),
      "external_deal_price_option_id"
    ) ?? null;

  const fieldErrors = validateDiscountStepFields({
    hoursBeforeStart,
    dealPriceMinor,
    promoCode,
  });
  if (fieldErrors.length > 0) {
    throw new DealDraftError("Invalid discount step fields", 400, fieldErrors);
  }

  assertMechanismStepFields(deal, { promoCode, externalDealPriceOptionId });

  if (!meetsMinDiscount(option.originalPriceMinor, dealPriceMinor)) {
    const max = maxDealPrice(option.originalPriceMinor);
    const { MIN_DISCOUNT_PCT } = getPlatformConfig();
    throw new DealDraftError(
      `Step deal price must be ≤ ${max} minor units (min ${MIN_DISCOUNT_PCT}% off)`,
      400,
      [
        {
          field: "deal_price_minor",
          message: `must be ≤ ${max} (max deal price for min ${MIN_DISCOUNT_PCT}% discount)`,
        },
      ]
    );
  }

  await verifyIntegratedStep(store, deal, {
    dealPriceMinor,
    promoCode,
    externalDealPriceOptionId,
  });

  const id = options.id ?? crypto.randomUUID();
  const step: DiscountStep = {
    id,
    dealId,
    priceOptionId: option.id,
    hoursBeforeStart,
    dealPriceMinor,
    promoCode,
    externalDealPriceOptionId,
    createdAt: now,
    updatedAt: now,
  };

  const nextSteps = [...stepsForOption(store, dealId, option.id), step];
  assertValidateStepsOrThrow(option, nextSteps);

  store.discountSteps.set(id, step);
  logDealEvent(
    store.audit,
    dealId,
    "price_changed",
    options.actor,
    {
      discount_step_id: id,
      price_option_id: option.id,
      action: "step_created",
      hours_before_start: hoursBeforeStart,
      deal_price_minor: dealPriceMinor,
      promo_code: promoCode,
    },
    { now }
  );

  return { step, validation };
}

export async function updateDiscountStep(
  store: DealDraftStore,
  dealId: string,
  stepId: string,
  raw: CreateDiscountStepInput | Record<string, unknown>,
  options: InventoryMutationOptions
): Promise<DiscountStepMutationResult> {
  const deal = requireDeal(store, dealId);
  const existing = store.discountSteps.get(stepId);
  if (!existing || existing.dealId !== dealId) {
    throw new DealDraftError("Discount step not found", 404, [
      { field: "id", message: "not found" },
    ]);
  }

  const body = raw as Record<string, unknown>;
  const now = options.now ?? new Date().toISOString();

  const validation = await assertLiveConfirmOrThrow(store, deal, {
    ...options,
    confirm: body.confirm === true || options.confirm === true,
  });

  const option = requirePriceOption(store, dealId, existing.priceOptionId);

  const hoursRaw = getBody(body, "hoursBeforeStart", "hours_before_start");
  const hoursBeforeStart =
    hoursRaw === undefined
      ? existing.hoursBeforeStart
      : parseRequiredInt(hoursRaw, "hours_before_start");

  const priceRaw = getBody(body, "dealPriceMinor", "deal_price_minor");
  const dealPriceMinor =
    priceRaw === undefined
      ? existing.dealPriceMinor
      : parseRequiredInt(priceRaw, "deal_price_minor");

  let promoCode = existing.promoCode;
  if (Object.prototype.hasOwnProperty.call(body, "promo_code") ||
      Object.prototype.hasOwnProperty.call(body, "promoCode")) {
    promoCode =
      parseOptionalString(
        getBody(body, "promoCode", "promo_code"),
        "promo_code"
      ) ?? null;
    if (promoCode) promoCode = promoCode.toUpperCase().replace(/\s/g, "");
  }

  let externalDealPriceOptionId = existing.externalDealPriceOptionId;
  if (
    Object.prototype.hasOwnProperty.call(body, "external_deal_price_option_id") ||
    Object.prototype.hasOwnProperty.call(body, "externalDealPriceOptionId")
  ) {
    externalDealPriceOptionId =
      parseOptionalString(
        getBody(body, "externalDealPriceOptionId", "external_deal_price_option_id"),
        "external_deal_price_option_id"
      ) ?? null;
  }

  const fieldErrors = validateDiscountStepFields({
    hoursBeforeStart,
    dealPriceMinor,
    promoCode,
  });
  if (fieldErrors.length > 0) {
    throw new DealDraftError("Invalid discount step fields", 400, fieldErrors);
  }

  assertMechanismStepFields(deal, { promoCode, externalDealPriceOptionId });

  if (!meetsMinDiscount(option.originalPriceMinor, dealPriceMinor)) {
    const max = maxDealPrice(option.originalPriceMinor);
    const { MIN_DISCOUNT_PCT } = getPlatformConfig();
    throw new DealDraftError(
      `Step deal price must be ≤ ${max} minor units (min ${MIN_DISCOUNT_PCT}% off)`,
      400,
      [
        {
          field: "deal_price_minor",
          message: `must be ≤ ${max} (max deal price for min ${MIN_DISCOUNT_PCT}% discount)`,
        },
      ]
    );
  }

  await verifyIntegratedStep(store, deal, {
    dealPriceMinor,
    promoCode,
    externalDealPriceOptionId,
  });

  const updated: DiscountStep = {
    ...existing,
    hoursBeforeStart,
    dealPriceMinor,
    promoCode,
    externalDealPriceOptionId,
    updatedAt: now,
  };

  const nextSteps = stepsForOption(store, dealId, option.id).map((s) =>
    s.id === stepId ? updated : s
  );
  assertValidateStepsOrThrow(option, nextSteps);

  store.discountSteps.set(stepId, updated);
  logDealEvent(
    store.audit,
    dealId,
    "price_changed",
    options.actor,
    {
      discount_step_id: stepId,
      price_option_id: option.id,
      action: "step_updated",
      old: {
        hours_before_start: existing.hoursBeforeStart,
        deal_price_minor: existing.dealPriceMinor,
        promo_code: existing.promoCode,
      },
      new: {
        hours_before_start: hoursBeforeStart,
        deal_price_minor: dealPriceMinor,
        promo_code: promoCode,
      },
    },
    { now }
  );

  return { step: updated, validation };
}

export async function deleteDiscountStep(
  store: DealDraftStore,
  dealId: string,
  stepId: string,
  options: InventoryMutationOptions & { confirm?: boolean }
): Promise<{ ok: true; validation: PublishValidationResult }> {
  const deal = requireDeal(store, dealId);
  const existing = store.discountSteps.get(stepId);
  if (!existing || existing.dealId !== dealId) {
    throw new DealDraftError("Discount step not found", 404, [
      { field: "id", message: "not found" },
    ]);
  }

  const now = options.now ?? new Date().toISOString();
  const validation = await assertLiveConfirmOrThrow(store, deal, {
    ...options,
    confirm: options.confirm === true,
  });

  const option = requirePriceOption(store, dealId, existing.priceOptionId);
  store.discountSteps.delete(stepId);

  const remaining = stepsForOption(store, dealId, option.id);
  if (remaining.length > 0) {
    assertValidateStepsOrThrow(option, remaining);
  }

  getCache(store).delete(option.id);

  logDealEvent(
    store.audit,
    dealId,
    "price_changed",
    options.actor,
    {
      discount_step_id: stepId,
      price_option_id: option.id,
      action: "step_deleted",
      old: {
        hours_before_start: existing.hoursBeforeStart,
        deal_price_minor: existing.dealPriceMinor,
        promo_code: existing.promoCode,
      },
    },
    { now }
  );

  return { ok: true, validation };
}

// ---------------------------------------------------------------------------
// Status ticker hook
// ---------------------------------------------------------------------------

function nextSellableSession(
  store: DealDraftStore,
  dealId: string,
  now: string
): DealSession | null {
  const nowMs = Date.parse(now);
  const sessions = [...store.sessions.values()]
    .filter((s) => s.dealId === dealId)
    .filter(
      (s) =>
        s.status !== "cancelled" &&
        s.status !== "expired" &&
        Date.parse(s.startAt) >= nowMs
    )
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  return sessions[0] ?? null;
}

/**
 * When a stepped discount activates (or deepens), log `price_changed` (system)
 * and refresh the per-option display-price cache used by list / Book now.
 */
export async function applyCurrentDiscountSteps(
  store: DealDraftStore,
  dealId: string,
  now: string
): Promise<void> {
  const deal = store.deals.get(dealId);
  if (!deal || !deal.steppedDiscountEnabled) return;

  const session = nextSellableSession(store, dealId, now);
  if (!session) return;

  const steps = stepsForDeal(store, dealId);
  if (steps.length === 0) return;

  const cache = getCache(store);
  const options = [...store.priceOptions.values()].filter(
    (p) => p.dealId === dealId
  );

  for (const option of options) {
    const current = currentPrice(
      option,
      session,
      now,
      steps,
      deal.promoCode
    );
    const prev = cache.get(option.id);
    const nextStepId = current.step?.id ?? null;
    const changed =
      prev == null ||
      prev.stepId !== nextStepId ||
      prev.dealPriceMinor !== current.dealPriceMinor;

    if (!changed) continue;

    // Only log when a step newly activates / changes (not the first cache fill
    // at base price with no prior entry and no active step).
    const isActivation =
      current.step != null &&
      (prev == null || prev.stepId !== nextStepId);

    cache.set(option.id, {
      stepId: nextStepId,
      dealPriceMinor: current.dealPriceMinor,
      promoCode: current.promoCode,
      hoursBeforeStart: current.step?.hoursBeforeStart ?? null,
    });

    if (!isActivation && prev == null) continue;

    logDealEvent(
      store.audit,
      dealId,
      "price_changed",
      { type: "system" },
      {
        action: "step_activated",
        price_option_id: option.id,
        discount_step_id: nextStepId,
        hours_before_start: current.step?.hoursBeforeStart ?? null,
        old_deal_price_minor: prev?.dealPriceMinor ?? option.dealPriceMinor,
        new_deal_price_minor: current.dealPriceMinor,
        promo_code: current.promoCode,
        session_id: session.id,
        session_start_at: session.startAt,
      },
      { now }
    );
  }
}

/** Resolve the promo code Book now should pass to buildBookingUrl. */
export function bookingPromoForSession(
  store: DealDraftStore,
  deal: Deal,
  session: DealSession,
  now: string
): string | null {
  if (!deal.steppedDiscountEnabled) {
    return deal.promoCode;
  }
  const options = [...store.priceOptions.values()]
    .filter((p) => p.dealId === deal.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const steps = stepsForDeal(store, deal.id);
  if (options.length === 0) return deal.promoCode;

  // Prefer the lowest-current option's step promo (matches list display).
  const { current } = lowestCurrentPriceOption(
    options,
    session,
    now,
    steps,
    deal
  );
  return current?.promoCode ?? deal.promoCode;
}
