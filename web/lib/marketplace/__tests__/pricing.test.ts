import { afterEach, describe, expect, it } from "vitest";
import {
  discountPct,
  maxDealPrice,
  meetsMinDiscount,
  meetsMinDiscountPercentage,
  priceFromPercentage,
  validateSteps,
  withDiscountPct,
} from "@/lib/marketplace/pricing";
import { getPlatformConfig } from "@/lib/marketplace/config";

const ENV_KEYS = ["MIN_DISCOUNT_PCT", "MAX_LEAD_HOURS"] as const;

afterEach(() => {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
});

describe("maxDealPrice", () => {
  it("floors original × (1 − MIN_DISCOUNT_PCT/100)", () => {
    // $100.00 → max $50.00
    expect(maxDealPrice(10_000)).toBe(5_000);
    // $99.99 → floor(9999 × 0.5) = 4999 → $49.99
    expect(maxDealPrice(9_999)).toBe(4_999);
  });

  it("returns 0 for zero or negative original", () => {
    expect(maxDealPrice(0)).toBe(0);
    expect(maxDealPrice(-100)).toBe(0);
  });

  it("respects MIN_DISCOUNT_PCT override", () => {
    process.env.MIN_DISCOUNT_PCT = "60";
    expect(getPlatformConfig().MIN_DISCOUNT_PCT).toBe(60);
    expect(maxDealPrice(10_000)).toBe(4_000);
  });
});

describe("meetsMinDiscount", () => {
  it("$100 → $50 passes, $50.01 fails", () => {
    expect(meetsMinDiscount(10_000, 5_000)).toBe(true);
    expect(meetsMinDiscount(10_000, 5_001)).toBe(false);
  });

  it("rejects zero original", () => {
    expect(meetsMinDiscount(0, 0)).toBe(false);
    expect(meetsMinDiscount(0, 1)).toBe(false);
  });

  it("rejects negative deal price", () => {
    expect(meetsMinDiscount(10_000, -1)).toBe(false);
  });

  it("allows deal price of 0 when original > 0", () => {
    expect(meetsMinDiscount(10_000, 0)).toBe(true);
  });
});

describe("discountPct", () => {
  it("rounds to 1 decimal place", () => {
    expect(discountPct(10_000, 5_000)).toBe(50);
    expect(discountPct(10_000, 4_999)).toBe(50.0);
    // 1 − 3333/10000 = 66.67%
    expect(discountPct(10_000, 3_333)).toBe(66.7);
  });

  it("returns null for zero original", () => {
    expect(discountPct(0, 0)).toBeNull();
  });
});

describe("meetsMinDiscountPercentage / priceFromPercentage", () => {
  it("rejects percentage below MIN_DISCOUNT_PCT (49%)", () => {
    expect(meetsMinDiscountPercentage(49)).toBe(false);
    expect(meetsMinDiscountPercentage(50)).toBe(true);
    expect(meetsMinDiscountPercentage(60)).toBe(true);
  });

  it("$99.99 at 50% = $49.99 (floor after round fails rule)", () => {
    // round(9999 × 0.5) = round(4999.5) = 5000 → fails max 4999 → floor → 4999
    expect(priceFromPercentage(9_999, 50)).toBe(4_999);
    expect(meetsMinDiscount(9_999, priceFromPercentage(9_999, 50))).toBe(true);
  });

  it("$100 at 50% = $50", () => {
    expect(priceFromPercentage(10_000, 50)).toBe(5_000);
  });

  it("valid percentage never produces an invalid price", () => {
    for (const original of [1, 99, 100, 9_999, 10_000, 12_345, 99_999]) {
      for (const pct of [50, 55, 60, 75, 100]) {
        const deal = priceFromPercentage(original, pct);
        expect(meetsMinDiscount(original, deal)).toBe(true);
      }
    }
  });

  it("49% of $100 yields a price that fails the rule (caller must reject %)", () => {
    const deal = priceFromPercentage(10_000, 49);
    expect(meetsMinDiscountPercentage(49)).toBe(false);
    expect(meetsMinDiscount(10_000, deal)).toBe(false);
  });
});

describe("withDiscountPct", () => {
  it("computes and attaches discount_pct on save shape", () => {
    const saved = withDiscountPct({
      originalPriceMinor: 20_000,
      dealPriceMinor: 8_000,
      label: "Adult",
    });
    expect(saved.discountPct).toBe(60);
    expect(saved.label).toBe("Adult");
  });

  it("stores null discount_pct when original is zero", () => {
    expect(
      withDiscountPct({ originalPriceMinor: 0, dealPriceMinor: 0 }).discountPct
    ).toBeNull();
  });
});

describe("validateSteps", () => {
  const option = { originalPriceMinor: 10_000, dealPriceMinor: 5_000 };

  it("accepts descending hours with non-increasing prices and distinct codes", () => {
    expect(
      validateSteps(
        [
          { hoursBeforeStart: 72, dealPriceMinor: 5_000, promoCode: "EARLY50" },
          { hoursBeforeStart: 24, dealPriceMinor: 4_000, promoCode: "MID60" },
          { hoursBeforeStart: 6, dealPriceMinor: 3_000, promoCode: "LATE70" },
        ],
        option
      )
    ).toEqual([]);
  });

  it("rejects steps increasing in price", () => {
    const errors = validateSteps(
      [
        { hoursBeforeStart: 72, dealPriceMinor: 4_000 },
        { hoursBeforeStart: 24, dealPriceMinor: 4_500 },
      ],
      option
    );
    expect(errors.map((e) => e.field)).toContain("steps[1].deal_price_minor");
    expect(errors.some((e) => e.message.includes("≤ previous step"))).toBe(
      true
    );
  });

  it("rejects step above base deal price", () => {
    const errors = validateSteps(
      [{ hoursBeforeStart: 48, dealPriceMinor: 5_500 }],
      option
    );
    expect(errors.some((e) => e.message.includes("≤ base deal price"))).toBe(
      true
    );
  });

  it("rejects steps that fail the 50% rule", () => {
    const errors = validateSteps(
      [{ hoursBeforeStart: 48, dealPriceMinor: 5_001 }],
      { originalPriceMinor: 10_000, dealPriceMinor: 5_001 }
    );
    expect(
      errors.some(
        (e) =>
          e.field === "steps[0].deal_price_minor" &&
          e.message.includes("min 50% off")
      )
    ).toBe(true);
  });

  it("rejects unsorted hours (not descending)", () => {
    const errors = validateSteps(
      [
        { hoursBeforeStart: 24, dealPriceMinor: 4_000 },
        { hoursBeforeStart: 72, dealPriceMinor: 3_000 },
      ],
      option
    );
    expect(errors.map((e) => e.field)).toContain(
      "steps[1].hours_before_start"
    );
  });

  it("rejects duplicate promo codes", () => {
    const errors = validateSteps(
      [
        { hoursBeforeStart: 72, dealPriceMinor: 5_000, promoCode: "SAME" },
        { hoursBeforeStart: 24, dealPriceMinor: 4_000, promoCode: "SAME" },
      ],
      option
    );
    expect(errors.map((e) => e.field)).toContain("steps[1].promo_code");
  });

  it("rejects zero original on the option", () => {
    const errors = validateSteps(
      [{ hoursBeforeStart: 48, dealPriceMinor: 0 }],
      { originalPriceMinor: 0, dealPriceMinor: 0 }
    );
    expect(errors.map((e) => e.field)).toContain("original_price_minor");
  });
});
