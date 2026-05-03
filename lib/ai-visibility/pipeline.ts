import OpenAI from "openai";
import {
  ADVISORY_SYSTEM,
  buildAdvisoryUserContent,
} from "./advisory";
import { analyzeAssistantReply } from "./analyze";
import { getAiVisibilityConfig } from "./config";
import { usdFromUsage } from "./cost";
import { dedupeNewPrompts, proposeExpansionPrompts } from "./expand-prompts";
import { DEFAULT_PROMPTS } from "./prompts";
import type {
  AiVisibilityPipelineMeta,
  AiVisibilityReport,
  PromptRunResult,
} from "./types";

const VIS_SYSTEM =
  "You are a helpful assistant. Answer the user's question clearly. For New Zealand travel, if you suggest motorhome or campervan hire companies, booking sites, or trip-planning resources, name specific examples when relevant.";

async function runVisibilityBatch(
  openai: OpenAI,
  model: string,
  prompts: string[],
  source: "seed" | "generated",
  cfg: ReturnType<typeof getAiVisibilityConfig>,
  onUsage: (
    u: { prompt_tokens?: number; completion_tokens?: number } | undefined
  ) => void
): Promise<PromptRunResult[]> {
  return Promise.all(
    prompts.map(async (prompt) => {
      try {
        const completion = await openai.chat.completions.create({
          model,
          temperature: 0.3,
          messages: [
            { role: "system", content: VIS_SYSTEM },
            { role: "user", content: prompt },
          ],
        });
        onUsage(completion.usage);
        const response =
          completion.choices[0]?.message?.content?.trim() ?? "";
        const analysis = analyzeAssistantReply(response);
        return { prompt, response, analysis, error: null, source };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          prompt,
          response: "",
          analysis: {
            mentioned: false,
            matchedTerms: [],
            excerpt: "",
          },
          error: message,
          source,
        };
      }
    })
  );
}

export async function runAiVisibilityPipeline(
  openai: OpenAI,
  model: string
): Promise<AiVisibilityReport> {
  const cfg = getAiVisibilityConfig();
  const spend = (
    u:
      | { prompt_tokens?: number; completion_tokens?: number }
      | undefined
      | null
  ) => usdFromUsage(u, cfg);

  let spentUsdApprox = 0;
  let visibilitySpend = 0;
  let visibilityCalls = 0;

  const recordVisibilityUsage = (
    u:
      | { prompt_tokens?: number; completion_tokens?: number }
      | undefined
  ) => {
    const c = spend(u);
    spentUsdApprox += c;
    visibilitySpend += c;
    visibilityCalls += 1;
  };

  const results: PromptRunResult[] = [];

  const seedList = DEFAULT_PROMPTS.slice(
    0,
    Math.min(DEFAULT_PROMPTS.length, cfg.maxPrompts)
  );

  const seedBatch = await runVisibilityBatch(
    openai,
    model,
    seedList,
    "seed",
    cfg,
    recordVisibilityUsage
  );
  results.push(...seedBatch);

  const meta: AiVisibilityPipelineMeta = {
    budgetUsd: cfg.budgetUsd,
    maxPrompts: cfg.maxPrompts,
    expansionTarget: cfg.expansionCount,
    spentUsdApprox: 0,
    seedPromptsRun: seedList.length,
    generatedProposed: [],
    generatedRun: 0,
    generatedSkippedByBudgetOrCap: 0,
    expansionError: null,
    skippedAdvisoryDueToBudget: false,
  };

  const remainingSlots = cfg.maxPrompts - results.length;
  const canTryExpansion =
    remainingSlots > 0 && spentUsdApprox < cfg.budgetUsd - 0.005;

  if (canTryExpansion) {
    const expansion = await proposeExpansionPrompts(
      openai,
      model,
      seedBatch,
      (u) => spend(u)
    );
    spentUsdApprox += expansion.usageUsd;
    meta.expansionError = expansion.error;

    const existingPrompts = results.map((r) => r.prompt);
    const deduped = dedupeNewPrompts(
      expansion.prompts,
      existingPrompts,
      cfg.expansionCount
    );

    meta.generatedProposed = [...deduped];

    const avgVisibility =
      visibilityCalls > 0 ? visibilitySpend / visibilityCalls : 0;
    // Size the generated batch from visibility cost only — do not reserve advisory USD here,
    // or headroom goes negative after seeds+expansion and no generated prompts run.
    const visibilityHeadroom = Math.max(
      0,
      cfg.budgetUsd - spentUsdApprox - cfg.visibilityBufferUsd
    );
    let maxByBudget = 0;
    if (visibilityCalls > 0 && avgVisibility > 0 && visibilityHeadroom > 0) {
      maxByBudget = Math.floor(visibilityHeadroom / avgVisibility);
    }
    const toRun = Math.min(remainingSlots, deduped.length, Math.max(0, maxByBudget));

    meta.generatedSkippedByBudgetOrCap = Math.max(0, deduped.length - toRun);

    if (toRun > 0 && spentUsdApprox <= cfg.budgetUsd + 1e-9) {
      const genSlice = deduped.slice(0, toRun);
      const genBatch = await runVisibilityBatch(
        openai,
        model,
        genSlice,
        "generated",
        cfg,
        recordVisibilityUsage
      );
      results.push(...genBatch);
      meta.generatedRun = genBatch.length;
    } else {
      meta.generatedRun = 0;
    }
  }

  const ok = results.filter((r) => !r.error);
  const mentioned = ok.filter((r) => r.analysis.mentioned).length;
  const total = ok.length;
  const summary = {
    total: results.length,
    mentioned,
    mentionRate:
      total > 0 ? Math.round((mentioned / total) * 1000) / 10 : 0,
  };

  let aggregateAdvice: string | null = null;
  let advisoryError: string | null = null;

  const advisoryOk =
    spentUsdApprox + cfg.advisoryEstimateUsd <= cfg.budgetUsd + 1e-9;

  if (!advisoryOk) {
    meta.skippedAdvisoryDueToBudget = true;
    advisoryError =
      "Strategic advice was skipped so the run stays within the configured budget cap (default USD 0.15). Increase AI_VISIBILITY_BUDGET_USD if you need the advisory pass.";
  } else {
    try {
      const maxChars = Math.min(
        3500,
        Math.max(400, Math.floor(80_000 / Math.max(1, results.length)))
      );
      const advisoryUser = buildAdvisoryUserContent(
        { model, summary, results },
        { maxCharsPerResponse: maxChars }
      );

      const advisoryCompletion = await openai.chat.completions.create({
        model,
        temperature: 0.35,
        messages: [
          { role: "system", content: ADVISORY_SYSTEM },
          {
            role: "user",
            content: `${advisoryUser}\n\n---\nProvide the structured guidance requested in your system instructions.`,
          },
        ],
      });
      spentUsdApprox += spend(advisoryCompletion.usage);
      aggregateAdvice =
        advisoryCompletion.choices[0]?.message?.content?.trim() ?? null;
      if (!aggregateAdvice) {
        advisoryError = "Advisory response was empty.";
      }
    } catch (e) {
      advisoryError = e instanceof Error ? e.message : String(e);
    }
  }

  meta.spentUsdApprox = Math.round(spentUsdApprox * 10_000) / 10_000;

  return {
    model,
    generatedAt: new Date().toISOString(),
    summary,
    results,
    aggregateAdvice,
    advisoryError,
    meta,
  };
}
