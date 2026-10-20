/**
 * Pricing maths and the MIN_DISCOUNT_PCT rule (deals platform Chunk 10).
 * Pure functions — no DB. Read MIN_DISCOUNT_PCT via getPlatformConfig().
 *
 * Spec: docs/deals-spec.md §1 constants, §3.3–3.4, §4.1 (50% minimum).
 */

import { getPlatformConfig } from "./config";

export type FieldError = { field: string; message: string };

/** Minimal price-option fields for step validation and discount_pct. */
export type PriceOptionPricingInput = {
  originalPriceMinor: number;
  dealPriceMinor: number;
};

/** Minimal discount-step fields for validateSteps. */
export type DiscountStepPricingInput = {
  hoursBeforeStart: number;
  dealPriceMinor: number;
  promoCode?: string | null;
};

/**
 * Maximum allowed deal price in minor units for the platform minimum discount.
 * floor(original × (1 − MIN_DISCOUNT_PCT/100)).
 */
export function maxDealPrice(originalMinor: number): number {
  if (!Number.isFinite(originalMinor) || originalMinor <= 0) {
    return 0;
  }
  const { MIN_DISCOUNT_PCT } = getPlatformConfig();
  return Math.floor(originalMinor * (1 - MIN_DISCOUNT_PCT / 100));
}

/**
 * True when dealMinor is a valid deal price for originalMinor:
 * original > 0, deal ≥ 0, and deal ≤ maxDealPrice(original).
 */
export function meetsMinDiscount(
  originalMinor: number,
  dealMinor: number
): boolean {
  if (
    !Number.isFinite(originalMinor) ||
    !Number.isFinite(dealMinor) ||
    originalMinor <= 0 ||
    dealMinor < 0
  ) {
    return false;
  }
  return dealMinor <= maxDealPrice(originalMinor);
}

/**
 * Discount percentage at 1 decimal place: round((1 − deal/original) × 100, 1 dp).
 * Returns null when original is not > 0 (cannot compute).
 */
export function discountPct(
  originalMinor: number,
  dealMinor: number
): number | null {
  if (
    !Number.isFinite(originalMinor) ||
    !Number.isFinite(dealMinor) ||
    originalMinor <= 0
  ) {
    return null;
  }
  const raw = (1 - dealMinor / originalMinor) * 100;
  return Math.round(raw * 10) / 10;
}

/**
 * True when a requested discount percentage meets MIN_DISCOUNT_PCT.
 * Used before priceFromPercentage so e.g. 49% is rejected at the default 50%.
 */
export function meetsMinDiscountPercentage(pct: number): boolean {
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return false;
  return pct >= getPlatformConfig().MIN_DISCOUNT_PCT;
}

/**
 * Deal price from a discount percentage.
 * Round to nearest cent; if that fails the min-discount rule, floor instead
 * so a valid percentage (≥ MIN_DISCOUNT_PCT) never yields an invalid price.
 *
 * Callers should reject percentages that fail meetsMinDiscountPercentage first.
 */
export function priceFromPercentage(
  originalMinor: number,
  pct: number
): number {
  if (
    !Number.isFinite(originalMinor) ||
    !Number.isFinite(pct) ||
    originalMinor <= 0
  ) {
    return 0;
  }
  const factor = 1 - pct / 100;
  const rounded = Math.round(originalMinor * factor);
  if (meetsMinDiscount(originalMinor, rounded)) {
    return Math.max(0, rounded);
  }
  // Floor so a valid % cannot produce a price above the max allowed.
  return Math.max(0, Math.floor(originalMinor * factor));
}

/**
 * Attach system-computed discount_pct for a DealPriceOption save.
 * Call on every create/update of a price option (alongside field validation).
 */
export function withDiscountPct<
  T extends { originalPriceMinor: number; dealPriceMinor: number },
>(option: T): T & { discountPct: number | null } {
  return {
    ...option,
    discountPct: discountPct(option.originalPriceMinor, option.dealPriceMinor),
  };
}

/**
 * Validate stepped discounts against a base price option.
 *
 * Rules:
 * - steps sorted by hours_before_start descending
 * - each hours_before_start in 1..MAX_LEAD_HOURS
 * - each deal price ≤ previous step and ≤ base option deal price
 * - each step meets the min-discount rule against the option original
 * - non-empty promo codes are distinct
 */
export function validateSteps(
  steps: DiscountStepPricingInput[],
  option: PriceOptionPricingInput
): FieldError[] {
  const errors: FieldError[] = [];
  const { MAX_LEAD_HOURS } = getPlatformConfig();

  if (!Number.isFinite(option.originalPriceMinor) || option.originalPriceMinor <= 0) {
    errors.push({
      field: "original_price_minor",
      message: "original_price_minor must be greater than 0",
    });
  }
  if (!Number.isFinite(option.dealPriceMinor) || option.dealPriceMinor < 0) {
    errors.push({
      field: "deal_price_minor",
      message: "deal_price_minor must be an integer ≥ 0",
    });
  }

  if (steps.length === 0) return errors;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const prefix = `steps[${i}]`;

    if (
      !Number.isInteger(step.hoursBeforeStart) ||
      step.hoursBeforeStart < 1 ||
      step.hoursBeforeStart > MAX_LEAD_HOURS
    ) {
      errors.push({
        field: `${prefix}.hours_before_start`,
        message: `hours_before_start must be an integer 1–${MAX_LEAD_HOURS}`,
      });
    }

    if (
      !Number.isInteger(step.dealPriceMinor) ||
      step.dealPriceMinor < 0
    ) {
      errors.push({
        field: `${prefix}.deal_price_minor`,
        message: "deal_price_minor must be an integer ≥ 0",
      });
      continue;
    }

    if (
      Number.isFinite(option.originalPriceMinor) &&
      option.originalPriceMinor > 0 &&
      !meetsMinDiscount(option.originalPriceMinor, step.dealPriceMinor)
    ) {
      const max = maxDealPrice(option.originalPriceMinor);
      errors.push({
        field: `${prefix}.deal_price_minor`,
        message: `deal price must be ≤ ${max} minor units (min ${getPlatformConfig().MIN_DISCOUNT_PCT}% off)`,
      });
    }

    if (
      Number.isFinite(option.dealPriceMinor) &&
      step.dealPriceMinor > option.dealPriceMinor
    ) {
      errors.push({
        field: `${prefix}.deal_price_minor`,
        message: "step deal price must be ≤ base deal price",
      });
    }

    if (i > 0) {
      const prev = steps[i - 1];
      if (step.hoursBeforeStart > prev.hoursBeforeStart) {
        errors.push({
          field: `${prefix}.hours_before_start`,
          message:
            "steps must be sorted by hours_before_start descending",
        });
      }
      if (
        Number.isInteger(prev.dealPriceMinor) &&
        step.dealPriceMinor > prev.dealPriceMinor
      ) {
        errors.push({
          field: `${prefix}.deal_price_minor`,
          message:
            "step deal price must be ≤ previous step (deeper or equal discount as start approaches)",
        });
      }
    }
  }

  const seenCodes = new Map<string, number>();
  for (let i = 0; i < steps.length; i++) {
    const code = steps[i].promoCode;
    if (code == null || code === "") continue;
    const existing = seenCodes.get(code);
    if (existing != null) {
      errors.push({
        field: `steps[${i}].promo_code`,
        message: `promo_code must be distinct (also used at steps[${existing}])`,
      });
    } else {
      seenCodes.set(code, i);
    }
  }

  return errors;
}
