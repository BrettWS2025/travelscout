/**
 * Pure helpers for the manual deal editor UI (Chunk 22).
 * Client mirrors of pricing maths + summary/sidebar derived state.
 */

import type { Deal } from "./deal";
import { DEAL_FIELD_LIMITS } from "./deal";
import type { DealDetail } from "./deal-draft";
import type { DealPriceOption, DealSession } from "./deal-session";
import {
  EDITOR_STEPS,
  type EditorStep,
  type PublishValidationCheckKeyed,
  type PublishValidationOutcome,
} from "./deal-publish-validation";
import {
  discountPct,
  maxDealPrice,
  meetsMinDiscount,
  priceFromPercentage,
} from "./pricing";

export { EDITOR_STEPS };
export type { EditorStep };

export const EDITOR_STEP_LABELS: Record<EditorStep, string> = {
  type: "Type",
  content: "Content",
  images: "Images",
  pricing: "Pricing",
  availability: "Availability",
  destination: "Destination",
  review: "Review",
};

export type DealEditorSummary = {
  lowestOriginalMinor: number | null;
  lowestDealMinor: number | null;
  discountPct: number | null;
  sessionCount: number;
  validationOk: boolean;
  failingChecks: PublishValidationCheckKeyed[];
};

export function summarizeDealEditor(
  detail: Pick<
    DealDetail,
    "priceOptions" | "sessions" | "validation"
  > | null
): DealEditorSummary {
  if (!detail) {
    return {
      lowestOriginalMinor: null,
      lowestDealMinor: null,
      discountPct: null,
      sessionCount: 0,
      validationOk: false,
      failingChecks: [],
    };
  }

  const options = detail.priceOptions ?? [];
  let lowest: DealPriceOption | null = null;
  for (const opt of options) {
    if (lowest == null || opt.dealPriceMinor < lowest.dealPriceMinor) {
      lowest = opt;
    }
  }

  const checks =
    "checks" in detail.validation && Array.isArray(detail.validation.checks)
      ? (detail.validation.checks as PublishValidationCheckKeyed[])
      : [];
  const failingChecks = checks.filter((c) => !c.passed);
  const validationOk =
    "ok" in detail.validation
      ? Boolean((detail.validation as PublishValidationOutcome).ok)
      : failingChecks.length === 0;

  return {
    lowestOriginalMinor: lowest?.originalPriceMinor ?? null,
    lowestDealMinor: lowest?.dealPriceMinor ?? null,
    discountPct:
      lowest != null
        ? discountPct(lowest.originalPriceMinor, lowest.dealPriceMinor)
        : null,
    sessionCount: detail.sessions?.length ?? 0,
    validationOk,
    failingChecks,
  };
}

/** Client-side row check mirroring Chunk 10 (server is authoritative). */
export function clientPriceRowStatus(
  originalMinor: number,
  dealMinor: number
): {
  discountPct: number | null;
  passes: boolean;
  maxDealPriceMinor: number;
} {
  const max = maxDealPrice(originalMinor);
  return {
    discountPct: discountPct(originalMinor, dealMinor),
    passes: meetsMinDiscount(originalMinor, dealMinor),
    maxDealPriceMinor: max,
  };
}

export function clientDealPriceFromPercentage(
  originalMinor: number,
  pct: number
): number {
  return priceFromPercentage(originalMinor, pct);
}

export function formatMinorAsDollars(minor: number | null | undefined): string {
  if (minor == null || !Number.isFinite(minor)) return "—";
  return `$${(minor / 100).toFixed(2)}`;
}

export function dollarsToMinor(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function minorToDollarsInput(minor: number | null | undefined): string {
  if (minor == null) return "";
  return (minor / 100).toFixed(2);
}

export type CharCounter = {
  current: number;
  min: number;
  max: number;
  ok: boolean;
  label: string;
};

export function charCounter(
  value: string,
  min: number,
  max: number
): CharCounter {
  const current = value.length;
  const ok = current >= min && current <= max;
  return {
    current,
    min,
    max,
    ok,
    label: `${current}/${max}`,
  };
}

export const CONTENT_COUNTERS = {
  title: {
    min: DEAL_FIELD_LIMITS.titleMin,
    max: DEAL_FIELD_LIMITS.titleMax,
  },
  summary: {
    min: DEAL_FIELD_LIMITS.summaryMin,
    max: DEAL_FIELD_LIMITS.summaryMax,
  },
  description: {
    min: DEAL_FIELD_LIMITS.descriptionMin,
    max: DEAL_FIELD_LIMITS.descriptionMax,
  },
  bookingInstructions: {
    min: 0,
    max: DEAL_FIELD_LIMITS.bookingInstructionsMax,
  },
} as const;

export function isLiveDeal(deal: Deal | null | undefined): boolean {
  return deal?.status === "live";
}

export function dealTypeLabel(dealType: string): string {
  switch (dealType) {
    case "manual_session":
      return "Manual session";
    case "manual_open_window":
      return "Manual open window";
    case "integrated_session":
      return "Integrated session";
    case "integrated_multi_session":
      return "Integrated multi-session";
    default:
      return dealType;
  }
}

export function nextEditorStep(step: EditorStep): EditorStep | null {
  const i = EDITOR_STEPS.indexOf(step);
  if (i < 0 || i >= EDITOR_STEPS.length - 1) return null;
  return EDITOR_STEPS[i + 1];
}

export function prevEditorStep(step: EditorStep): EditorStep | null {
  const i = EDITOR_STEPS.indexOf(step);
  if (i <= 0) return null;
  return EDITOR_STEPS[i - 1];
}

export function sessionsNeedingSeats(sessions: DealSession[]): boolean {
  return sessions.some((s) => (s.manualSeatsAvailable ?? 0) > 0);
}
