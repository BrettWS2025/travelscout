/** Defaults align with typical gpt-5.4-mini–class pricing; override via env if your model differs. */
export type AiVisibilityRuntimeConfig = {
  budgetUsd: number;
  maxPrompts: number;
  expansionCount: number;
  /** USD reserved for the advisory completion after visibility + expansion. */
  advisoryReserveUsd: number;
  /** Rough ceiling for advisory step planning (input+output). */
  advisoryEstimateUsd: number;
  /**
   * Tiny buffer subtracted from budget when sizing the *generated* visibility batch only.
   * Do not reserve advisory here—generated prompts should run whenever slots + cash allow.
   */
  visibilityBufferUsd: number;
  usdPerInputMtok: number;
  usdPerOutputMtok: number;
};

function parseNum(v: string | undefined, fallback: number): number {
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function getAiVisibilityConfig(): AiVisibilityRuntimeConfig {
  return {
    budgetUsd: parseNum(process.env.AI_VISIBILITY_BUDGET_USD, 0.15),
    maxPrompts: Math.min(
      100,
      Math.max(1, Math.floor(parseNum(process.env.AI_VISIBILITY_MAX_PROMPTS, 30)))
    ),
    expansionCount: Math.min(
      30,
      Math.max(1, Math.floor(parseNum(process.env.AI_VISIBILITY_EXPANSION_COUNT, 10)))
    ),
    advisoryReserveUsd: parseNum(
      process.env.AI_VISIBILITY_ADVISORY_RESERVE_USD,
      0.06
    ),
    advisoryEstimateUsd: parseNum(
      process.env.AI_VISIBILITY_ADVISORY_ESTIMATE_USD,
      0.08
    ),
    visibilityBufferUsd: parseNum(
      process.env.AI_VISIBILITY_VISIBILITY_BUFFER_USD,
      0.005
    ),
    usdPerInputMtok: parseNum(process.env.OPENAI_PRICE_INPUT_PER_MTOK, 0.75),
    usdPerOutputMtok: parseNum(process.env.OPENAI_PRICE_OUTPUT_PER_MTOK, 4.5),
  };
}
