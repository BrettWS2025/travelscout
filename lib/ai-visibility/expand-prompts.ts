import type OpenAI from "openai";
import type { PromptRunResult } from "./types";

const EXPANDER_SYSTEM = `You propose motorhome/campervan-related user questions for New Zealand travel research.

Rules:
- Output must be valid JSON only (no markdown fences), shape: {"prompts":["..."]}
- Exactly 10 items in "prompts"
- Each item is one short question or instruction a traveller might ask an AI assistant
- Must be in English, about New Zealand, and relevant to hiring or travelling in a motorhome/campervan/RV
- Do not repeat or trivially paraphrase any prompt listed in the user message
- Vary topics: routes, budgets, seasons, families, insurance, DOC camping, ferries, one-way hire, South/North Island, activities, vehicle choice, etc.`;

export type ExpansionOutcome = {
  prompts: string[];
  usageUsd: number;
  error: string | null;
};

function buildExpanderUserMessage(seedResults: PromptRunResult[]): string {
  const lines = seedResults.map((r, i) => {
    const tag = r.error ? "ERR" : r.analysis.mentioned ? "HIT" : "MISS";
    const excerpt = r.error
      ? r.error
      : r.response.slice(0, 500).replace(/\s+/g, " ");
    return `${i + 1}. [${tag}] ${r.prompt}\n   Excerpt: ${excerpt}`;
  });
  return `Existing probes (do not duplicate these prompts):\n\n${lines.join(
    "\n\n"
  )}\n\nReturn JSON: {"prompts":["...10 new strings..."]}`;
}

function parsePromptsJson(raw: string): string[] {
  const trimmed = raw.trim();
  const parsed = JSON.parse(trimmed) as { prompts?: unknown };
  if (!parsed || !Array.isArray(parsed.prompts)) return [];
  return parsed.prompts
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function proposeExpansionPrompts(
  openai: OpenAI,
  model: string,
  seedResults: PromptRunResult[],
  usdFromUsage: (
    u: { prompt_tokens?: number; completion_tokens?: number } | undefined
  ) => number
): Promise<ExpansionOutcome> {
  try {
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.45,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: EXPANDER_SYSTEM },
        { role: "user", content: buildExpanderUserMessage(seedResults) },
      ],
    });
    const raw = completion.choices[0]?.message?.content?.trim() ?? "";
    let prompts: string[] = [];
    try {
      prompts = parsePromptsJson(raw);
    } catch {
      return {
        prompts: [],
        usageUsd: usdFromUsage(completion.usage),
        error: "Failed to parse expansion JSON.",
      };
    }
    const usageUsd = usdFromUsage(completion.usage);
    const top = prompts.slice(0, 10);
    if (top.length < 10) {
      return {
        prompts: top,
        usageUsd,
        error:
          top.length === 0
            ? "Expander returned no prompts."
            : `Expected 10 prompts, got ${prompts.length}.`,
      };
    }
    return { prompts: top, usageUsd, error: null };
  } catch (e) {
    return {
      prompts: [],
      usageUsd: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export function dedupeNewPrompts(
  proposed: string[],
  existing: Iterable<string>,
  cap: number
): string[] {
  const seen = new Set<string>();
  for (const p of existing) {
    seen.add(p.trim().toLowerCase());
  }
  const out: string[] = [];
  for (const p of proposed) {
    const k = p.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(p.trim());
    if (out.length >= cap) break;
  }
  return out;
}
