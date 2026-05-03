import type { AiVisibilityRuntimeConfig } from "./config";

export function usdFromUsage(
  usage:
    | { prompt_tokens?: number; completion_tokens?: number }
    | undefined
    | null,
  cfg: Pick<AiVisibilityRuntimeConfig, "usdPerInputMtok" | "usdPerOutputMtok">
): number {
  if (usage == null) return 0;
  const pi = ((usage.prompt_tokens ?? 0) / 1_000_000) * cfg.usdPerInputMtok;
  const po = ((usage.completion_tokens ?? 0) / 1_000_000) * cfg.usdPerOutputMtok;
  return pi + po;
}
