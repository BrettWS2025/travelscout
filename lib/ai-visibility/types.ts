import type { MentionAnalysis } from "./analyze";

export type PromptRunResult = {
  prompt: string;
  response: string;
  analysis: MentionAnalysis;
  error: string | null;
  source: "seed" | "generated";
};

export type AiVisibilityPipelineMeta = {
  budgetUsd: number;
  maxPrompts: number;
  expansionTarget: number;
  /** Sum of priced token usage across all API calls in this run (approximate). */
  spentUsdApprox: number;
  seedPromptsRun: number;
  /** New prompts returned by the expander (after dedupe vs seeds). */
  generatedProposed: string[];
  generatedRun: number;
  /** Proposed generated prompts not executed (budget or 30-cap). */
  generatedSkippedByBudgetOrCap: number;
  expansionError: string | null;
  skippedAdvisoryDueToBudget: boolean;
};

export type AiVisibilityReport = {
  model: string;
  generatedAt: string;
  summary: {
    total: number;
    mentioned: number;
    mentionRate: number;
  };
  results: PromptRunResult[];
  /** Second-pass LLM: advice from all outputs + AEO guidance; null if the call failed or was skipped. */
  aggregateAdvice: string | null;
  advisoryError: string | null;
  meta: AiVisibilityPipelineMeta;
};
