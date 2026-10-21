/**
 * Client-safe stepped-discount helpers (Chunk 43).
 *
 * Keep this free of deal-draft / inventory / providers / auth so the deal
 * editor (and other client components) can call currentPrice without pulling
 * next/headers into the browser bundle.
 */

import type { Deal } from "./deal";
import type {
  DealPriceOption,
  DealSession,
  DiscountStep,
} from "./deal-session";
import { discountPct } from "./pricing";

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
