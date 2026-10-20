/**
 * DealSession, DealPriceOption, DiscountStep (deals platform Chunk 4).
 * Tables: marketplace.deal_sessions, deal_price_options, discount_steps
 * Parent: marketplace.operator_deals (inventory Deal — not legacy marketplace.deals).
 *
 * seats_displayed is system-owned: recompute with computeSeatsDisplayed on every save.
 * discount_pct is system-owned: recompute with withDiscountPct (pricing.ts) on every
 * DealPriceOption save. Min-discount maths live in pricing.ts (Chunk 10).
 */

import { MAX_LEAD_HOURS, getPlatformConfig } from "./config";
import type { Deal } from "./deal";
import type {
  DealType,
  OriginalPriceSource,
  PriceOptionType,
  SessionStatus,
} from "./enums";
import {
  isManualDealType,
  isOriginalPriceSource,
  isPriceOptionType,
  isSessionStatus,
} from "./enums";
import { withDiscountPct } from "./pricing";

export { withDiscountPct };

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type DealSession = {
  id: string;
  dealId: string;
  externalSessionId: string | null;
  startAt: string;
  endAt: string | null;
  providerSeatsAvailable: number | null;
  manualSeatsAvailable: number | null;
  seatCap: number | null;
  /** System: min(available, session.seat_cap ?? deal.seat_cap ?? ∞), never < 0 */
  seatsDisplayed: number;
  status: SessionStatus;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DealPriceOption = {
  id: string;
  dealId: string;
  label: string;
  type: PriceOptionType;
  externalPriceOptionId: string | null;
  externalDealPriceOptionId: string | null;
  originalPriceMinor: number;
  originalPriceSource: OriginalPriceSource;
  originalPriceEvidenceUrl: string | null;
  dealPriceMinor: number;
  /** System-computed via withDiscountPct / discountPct (pricing.ts); 1 dp */
  discountPct: number | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type DiscountStep = {
  id: string;
  dealId: string;
  priceOptionId: string;
  hoursBeforeStart: number;
  dealPriceMinor: number;
  promoCode: string | null;
  externalDealPriceOptionId: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Minimal deal fields needed for seat display. */
export type SeatsDealInput = Pick<Deal, "dealType" | "seatCap"> | {
  dealType: DealType;
  seatCap: number | null;
};

/** Minimal session fields needed for seat display. */
export type SeatsSessionInput = {
  providerSeatsAvailable: number | null;
  manualSeatsAvailable: number | null;
  seatCap: number | null;
};

export type FieldError = { field: string; message: string };

// ---------------------------------------------------------------------------
// computeSeatsDisplayed
// ---------------------------------------------------------------------------

/**
 * Pure: seats shown to travellers.
 * available = provider seats for integrated deals, manual seats for manual.
 * Result = min(available, session.seat_cap ?? deal.seat_cap ?? ∞), never below 0.
 * Null available is treated as 0 (fail closed).
 */
export function computeSeatsDisplayed(
  session: SeatsSessionInput,
  deal: SeatsDealInput
): number {
  const availableRaw = isManualDealType(deal.dealType)
    ? session.manualSeatsAvailable
    : session.providerSeatsAvailable;

  const available =
    availableRaw == null || !Number.isFinite(availableRaw)
      ? 0
      : Math.max(0, Math.floor(availableRaw));

  const sessionCap = session.seatCap;
  const dealCap = deal.seatCap;
  const cap =
    sessionCap != null && Number.isFinite(sessionCap)
      ? Math.max(0, Math.floor(sessionCap))
      : dealCap != null && Number.isFinite(dealCap)
        ? Math.max(0, Math.floor(dealCap))
        : null;

  if (cap == null) return available;
  return Math.min(available, cap);
}

/**
 * Attach recomputed seats_displayed for a session save.
 * Call on every create/update of a DealSession.
 */
export function withSeatsDisplayed<T extends SeatsSessionInput>(
  session: T,
  deal: SeatsDealInput
): T & { seatsDisplayed: number } {
  return {
    ...session,
    seatsDisplayed: computeSeatsDisplayed(session, deal),
  };
}

// ---------------------------------------------------------------------------
// Light field validators (full pricing rules are Chunk 10 / 13)
// ---------------------------------------------------------------------------

export function validateDealSessionFields(input: {
  startAt?: string | null;
  endAt?: string | null;
  providerSeatsAvailable?: number | null;
  manualSeatsAvailable?: number | null;
  seatCap?: number | null;
  seatsDisplayed?: number | null;
  status?: SessionStatus | null;
}): FieldError[] {
  const errors: FieldError[] = [];

  if (input.startAt != null && Number.isNaN(Date.parse(input.startAt))) {
    errors.push({ field: "start_at", message: "start_at must be a valid datetime" });
  }
  if (input.endAt != null && Number.isNaN(Date.parse(input.endAt))) {
    errors.push({ field: "end_at", message: "end_at must be a valid datetime" });
  }
  if (input.manualSeatsAvailable != null) {
    if (
      !Number.isInteger(input.manualSeatsAvailable) ||
      input.manualSeatsAvailable < 0 ||
      input.manualSeatsAvailable > 999
    ) {
      errors.push({
        field: "manual_seats_available",
        message: "manual_seats_available must be an integer 0–999",
      });
    }
  }
  if (input.providerSeatsAvailable != null) {
    if (
      !Number.isInteger(input.providerSeatsAvailable) ||
      input.providerSeatsAvailable < 0
    ) {
      errors.push({
        field: "provider_seats_available",
        message: "provider_seats_available must be an integer ≥ 0",
      });
    }
  }
  if (input.seatCap != null) {
    if (
      !Number.isInteger(input.seatCap) ||
      input.seatCap < 1 ||
      input.seatCap > 999
    ) {
      errors.push({
        field: "seat_cap",
        message: "seat_cap must be an integer 1–999",
      });
    }
  }
  if (input.seatsDisplayed != null) {
    if (!Number.isInteger(input.seatsDisplayed) || input.seatsDisplayed < 0) {
      errors.push({
        field: "seats_displayed",
        message: "seats_displayed must be an integer ≥ 0 (system-owned)",
      });
    }
  }
  if (input.status != null && !isSessionStatus(input.status)) {
    errors.push({ field: "status", message: "invalid session status" });
  }

  return errors;
}

export function validateDiscountStepFields(input: {
  hoursBeforeStart?: number | null;
  dealPriceMinor?: number | null;
  promoCode?: string | null;
}): FieldError[] {
  const errors: FieldError[] = [];
  const maxHours = getPlatformConfig().MAX_LEAD_HOURS;

  if (input.hoursBeforeStart != null) {
    if (
      !Number.isInteger(input.hoursBeforeStart) ||
      input.hoursBeforeStart < 1 ||
      input.hoursBeforeStart > maxHours
    ) {
      errors.push({
        field: "hours_before_start",
        message: `hours_before_start must be an integer 1–${maxHours}`,
      });
    }
  }
  if (input.dealPriceMinor != null) {
    if (!Number.isInteger(input.dealPriceMinor) || input.dealPriceMinor < 0) {
      errors.push({
        field: "deal_price_minor",
        message: "deal_price_minor must be an integer ≥ 0",
      });
    }
  }
  if (input.promoCode != null && input.promoCode !== "") {
    if (
      input.promoCode.length < 3 ||
      input.promoCode.length > 30 ||
      !/^[A-Z0-9_-]+$/.test(input.promoCode)
    ) {
      errors.push({
        field: "promo_code",
        message: "promo_code must be 3–30 chars matching A–Z 0–9 _ -",
      });
    }
  }

  return errors;
}

export function validateDealPriceOptionFields(input: {
  label?: string | null;
  type?: PriceOptionType | null;
  originalPriceMinor?: number | null;
  dealPriceMinor?: number | null;
  originalPriceSource?: OriginalPriceSource | null;
  sortOrder?: number | null;
}): FieldError[] {
  const errors: FieldError[] = [];

  if (input.label != null && input.label.trim() === "") {
    errors.push({ field: "label", message: "label is required" });
  }
  if (input.type != null && !isPriceOptionType(input.type)) {
    errors.push({ field: "type", message: "invalid price_option_type" });
  }
  if (input.originalPriceSource != null && !isOriginalPriceSource(input.originalPriceSource)) {
    errors.push({
      field: "original_price_source",
      message: "invalid original_price_source",
    });
  }
  if (input.originalPriceMinor != null) {
    if (
      !Number.isInteger(input.originalPriceMinor) ||
      input.originalPriceMinor < 0
    ) {
      errors.push({
        field: "original_price_minor",
        message: "original_price_minor must be an integer ≥ 0",
      });
    }
  }
  if (input.dealPriceMinor != null) {
    if (!Number.isInteger(input.dealPriceMinor) || input.dealPriceMinor < 0) {
      errors.push({
        field: "deal_price_minor",
        message: "deal_price_minor must be an integer ≥ 0",
      });
    }
  }
  if (input.sortOrder != null && !Number.isInteger(input.sortOrder)) {
    errors.push({ field: "sort_order", message: "sort_order must be an integer" });
  }

  return errors;
}

/** Re-export default for tests that assert the DB CHECK matches the platform default. */
export const DISCOUNT_STEP_HOURS_DB_MAX = MAX_LEAD_HOURS;
