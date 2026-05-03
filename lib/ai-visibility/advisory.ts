import type { PromptRunResult } from "./types";

export const ADVISORY_SYSTEM = `You are a senior digital strategist for New Zealand motorhome hire. Your audience is marketers and web owners for Wilderness Motorhomes (wilderness.co.nz).

You will receive:
1) Summary stats from an LLM “visibility” test (whether Wilderness was named in simulated answers).
2) The full set of user prompts and model answers.

Your job is to produce actionable guidance in clear Markdown-style sections:

## 1. Diagnosis (brief)
What the outputs suggest about whether and how Wilderness appears versus competitors (infer competitor names only from the pasted answers—do not invent brands not present).

## 2. How to increase inclusion in AI-style answers
Concrete tactics: brand + entity consistency, topical authority content, comparisons, third-party citations, PR/partnerships, customer language in reviews, Wikipedia-style factual breadth—tailored to motorhome hire in NZ.

## 3. Answer Engine Optimization (AEO) for the website
Specific recommendations for wilderness.co.nz and related properties: page structure (H1/H2, FAQs, comparison tables), structured data (Organization, LocalBusiness or equivalent where applicable, FAQPage, Product/Service where relevant), internal linking hubs, definitional and “best for…” content, clarity of entity (legal name, brand, URL) in footer and About, E-E-A-T signals.

## 4. Quick wins vs longer-term
Bullet lists.

Be specific and practical. Avoid generic SEO fluff. Do not claim guaranteed rankings or AI mentions. Note that training-data chat behaviour differs from live web-grounded assistants.`;

export function buildAdvisoryUserContent(
  args: {
    model: string;
    summary: { total: number; mentioned: number; mentionRate: number };
    results: PromptRunResult[];
  },
  options?: { maxCharsPerResponse?: number }
): string {
  const maxChars =
    options?.maxCharsPerResponse ??
    Math.min(
      3500,
      Math.max(500, Math.floor(85_000 / Math.max(1, args.results.length)))
    );
  const lines: string[] = [
    "## Visibility test summary",
    `- Model used for simulation: ${args.model}`,
    `- Prompts where Wilderness was mentioned: ${args.summary.mentioned} / ${args.summary.total}`,
    `- Mention rate: ${args.summary.mentionRate}%`,
    "",
    "## All prompts and model outputs (for your analysis)",
    "",
  ];

  args.results.forEach((row, i) => {
    const label = row.error
      ? "ERROR"
      : row.analysis.mentioned
        ? "WILDERNESS_MENTIONED"
        : "NO_WILDERNESS_MENTION";
    lines.push(`### ${i + 1}. [${label}]`);
    lines.push(`**Prompt:** ${row.prompt}`);
    if (row.error) {
      lines.push(`**Error:** ${row.error}`);
      lines.push("");
      return;
    }
    let body = row.response;
    if (body.length > maxChars) {
      body = body.slice(0, maxChars) + "\n\n[…truncated for advisory context…]";
    }
    lines.push(`**Answer:**\n${body}`);
    lines.push("");
  });

  return lines.join("\n");
}
