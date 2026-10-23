/**
 * Pure helpers for the manual deal editor UI (Chunk 22).
 * Client mirrors of pricing maths + summary/sidebar derived state.
 */

import type { Deal } from "./deal";
import { DEAL_FIELD_LIMITS } from "./deal";
import type { DealDetail } from "./deal-draft";
import type { DealPriceOption, DealSession } from "./deal-session";
import { lowestCurrentPriceOption } from "./deal-stepped-discounts-shared";
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

export { EDITOR_STEP_LABELS } from "./display-labels";

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
    "deal" | "priceOptions" | "discountSteps" | "sessions" | "validation"
  > | null,
  now?: string
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
  const sessions = detail.sessions ?? [];
  const nowIso = now ?? new Date().toISOString();
  const nextSession =
    [...sessions]
      .filter((s) => Date.parse(s.startAt) >= Date.parse(nowIso))
      .sort((a, b) => a.startAt.localeCompare(b.startAt))[0] ??
    sessions[0] ??
    null;
  const { option: lowest, current } = lowestCurrentPriceOption(
    options,
    nextSession,
    nowIso,
    detail.discountSteps ?? [],
    detail.deal
  );

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
    lowestDealMinor: current?.dealPriceMinor ?? lowest?.dealPriceMinor ?? null,
    discountPct:
      current?.discountPct ??
      (lowest != null
        ? discountPct(lowest.originalPriceMinor, lowest.dealPriceMinor)
        : null),
    sessionCount: sessions.length,
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

export { dealTypeLabel } from "./display-labels";

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
