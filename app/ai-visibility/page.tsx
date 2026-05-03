"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import type { AiVisibilityReport } from "@/lib/ai-visibility/types";
import { Sparkles, Loader2, AlertCircle, CheckCircle2, XCircle, BookOpen } from "lucide-react";

export default function AiVisibilityPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<AiVisibilityReport | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch("/api/ai-visibility", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Request failed");
        return;
      }
      setReport(data as AiVisibilityReport);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 pb-16">
      <div className="mb-8">
        <p className="text-sm text-slate-500 mb-2">
          <Link href="/" className="link">
            ← Home
          </Link>
        </p>
        <h1 className="text-3xl md:text-4xl font-bold font-[family-name:var(--font-plus-jakarta)] text-slate-800 flex items-center gap-2 flex-wrap">
          <Sparkles className="w-8 h-8 text-indigo-500 shrink-0" aria-hidden />
          Wilderness — LLM visibility check
        </h1>
        <p className="mt-3 text-slate-600 leading-relaxed max-w-2xl">
          Runs seed prompts (from the repo), asks the model for{" "}
          <strong>10 additional</strong> NZ motorhome questions (deduped), executes as many
          as fit under a <strong>30-prompt cap</strong> and a <strong>~USD 0.15</strong>{" "}
          estimated token budget, then optional strategic advice. Checks whether answers
          mention{" "}
          <a
            href="https://www.wilderness.co.nz/"
            className="text-indigo-600 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Wilderness Motorhomes
          </a>
          . This mirrors plain chat (no live web browse)—one signal for brand and
          positioning, not a guarantee of search or AI-overview rankings.
        </p>
      </div>

      <div className="card p-6 mb-8">
        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 text-white px-5 py-2.5 text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 disabled:pointer-events-none transition-colors"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
              Running pipeline (seeds → expansion → advice)…
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" aria-hidden />
              Run full analysis
            </>
          )}
        </button>
        <p className="mt-3 text-xs text-slate-500">
          Requires <code className="text-slate-700 bg-slate-100 px-1 rounded">OPENAI_API_KEY</code>{" "}
          on the server. Optional:{" "}
          <code className="text-slate-700 bg-slate-100 px-1 rounded">OPENAI_MODEL</code>{" "}
          (defaults to gpt-5.4-mini). Tune pricing/budget with{" "}
          <code className="text-slate-700 bg-slate-100 px-1 rounded">OPENAI_PRICE_*_PER_MTOK</code>,{" "}
          <code className="text-slate-700 bg-slate-100 px-1 rounded">AI_VISIBILITY_BUDGET_USD</code>,{" "}
          <code className="text-slate-700 bg-slate-100 px-1 rounded">AI_VISIBILITY_MAX_PROMPTS</code>.
        </p>
      </div>

      {error && (
        <div
          className="rounded-xl border border-amber-200 bg-amber-50 text-amber-900 px-4 py-3 text-sm flex gap-2 items-start mb-6"
          role="alert"
        >
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {report && (
        <>
          <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
            <div className="card p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Model
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-800">{report.model}</p>
              <p className="text-xs text-slate-500 mt-2">
                {new Date(report.generatedAt).toLocaleString()}
              </p>
            </div>
            <div className="card p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Mentions / prompts
              </p>
              <p className="mt-1 text-3xl font-bold text-slate-800 tabular-nums">
                {report.summary.mentioned}{" "}
                <span className="text-lg font-normal text-slate-400">/</span>{" "}
                {report.summary.total}
              </p>
              <p className="text-xs text-slate-500 mt-2">
                Seeds {report.meta.seedPromptsRun}
                {report.meta.generatedRun > 0
                  ? ` · Generated run ${report.meta.generatedRun}`
                  : ""}
              </p>
            </div>
            <div className="card p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Mention rate
              </p>
              <p className="mt-1 text-3xl font-bold text-slate-800 tabular-nums">
                {report.summary.mentionRate}%
              </p>
            </div>
            <div className="card p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Est. spend / cap
              </p>
              <p className="mt-1 text-xl font-bold text-slate-800 tabular-nums">
                ${report.meta.spentUsdApprox.toFixed(4)}
                <span className="text-sm font-normal text-slate-400"> / </span>
                <span className="text-lg">${report.meta.budgetUsd.toFixed(2)}</span>
              </p>
              <p className="text-xs text-slate-500 mt-2">
                Max {report.meta.maxPrompts} prompts · expand +{report.meta.expansionTarget}
              </p>
            </div>
          </section>

          <section className="space-y-4 mb-10">
            <h2 className="text-xl font-bold text-slate-800 font-[family-name:var(--font-plus-jakarta)]">
              Results by prompt
            </h2>
            {report.results.map((row, i) => (
              <article
                key={i}
                className="card p-5 border-l-4 border-l-slate-200 data-[hit=true]:border-l-emerald-500"
                data-hit={row.analysis.mentioned ? "true" : "false"}
              >
                <div className="flex items-start gap-3 mb-3">
                  {row.error ? (
                    <XCircle className="w-6 h-6 text-red-500 shrink-0" aria-hidden />
                  ) : row.analysis.mentioned ? (
                    <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" aria-hidden />
                  ) : (
                    <XCircle className="w-6 h-6 text-slate-400 shrink-0" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-800 flex flex-wrap items-center gap-2">
                      {row.prompt}
                      <span
                        className={
                          row.source === "seed"
                            ? "text-[10px] uppercase tracking-wide font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded"
                            : "text-[10px] uppercase tracking-wide font-semibold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded"
                        }
                      >
                        {row.source === "seed" ? "Seed" : "Generated"}
                      </span>
                    </p>
                    {row.error && (
                      <p className="text-sm text-red-600 mt-1">{row.error}</p>
                    )}
                  </div>
                </div>

                {!row.error && (
                  <>
                    <div className="flex flex-wrap gap-2 mb-3">
                      <span
                        className={
                          row.analysis.mentioned
                            ? "inline-flex items-center rounded-full bg-emerald-100 text-emerald-800 text-xs font-semibold px-2.5 py-0.5"
                            : "inline-flex items-center rounded-full bg-slate-100 text-slate-600 text-xs font-semibold px-2.5 py-0.5"
                        }
                      >
                        {row.analysis.mentioned
                          ? "Wilderness mentioned"
                          : "No Wilderness mention"}
                      </span>
                      {row.analysis.matchedTerms.length > 0 && (
                        <span className="text-xs text-slate-500">
                          Matched: {row.analysis.matchedTerms.join(", ")}
                        </span>
                      )}
                    </div>

                    {row.analysis.excerpt && (
                      <blockquote className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3 border border-slate-100 mb-3">
                        {row.analysis.excerpt}
                      </blockquote>
                    )}

                    <details className="text-sm">
                      <summary className="cursor-pointer text-indigo-600 font-medium hover:underline">
                        Full model response
                      </summary>
                      <pre className="mt-2 whitespace-pre-wrap text-slate-700 bg-slate-50 rounded-lg p-4 border border-slate-100 text-xs leading-relaxed overflow-x-auto">
                        {row.response}
                      </pre>
                    </details>
                  </>
                )}
              </article>
            ))}
          </section>

          {(report.meta.generatedProposed.length > 0 ||
            report.meta.expansionError) && (
            <section className="mb-8 card p-5">
              <h2 className="text-sm font-bold text-slate-800 mb-2 font-[family-name:var(--font-plus-jakarta)]">
                Iterative prompts (model-proposed)
              </h2>
              {report.meta.generatedRun > 0 ? (
                <p className="text-xs text-slate-600 mb-3">
                  Same questions as in &quot;Results by prompt&quot; with a{" "}
                  <span className="font-semibold text-indigo-700">Generated</span> badge—listed
                  here for reference.
                </p>
              ) : report.meta.generatedProposed.length > 0 ? (
                <p className="text-xs text-amber-800 mb-3">
                  Proposals were returned but none were executed (usually budget headroom). Raise{" "}
                  <code className="bg-slate-100 px-1 rounded">AI_VISIBILITY_BUDGET_USD</code> or
                  check pricing env vars.
                </p>
              ) : null}
              {report.meta.expansionError && (
                <p className="text-xs text-amber-800 mb-2">{report.meta.expansionError}</p>
              )}
              {report.meta.generatedProposed.length > 0 && (
                <ul className="text-sm text-slate-600 list-disc pl-5 space-y-1">
                  {report.meta.generatedProposed.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              )}
              {report.meta.generatedSkippedByBudgetOrCap > 0 && (
                <p className="text-xs text-slate-500 mt-2">
                  Not run (budget / {report.meta.maxPrompts}-cap):{" "}
                  {report.meta.generatedSkippedByBudgetOrCap} of {report.meta.generatedProposed.length}{" "}
                  proposed.
                </p>
              )}
            </section>
          )}

          {(report.aggregateAdvice || report.advisoryError) && (
            <section className="mb-10">
              <h2 className="text-xl font-bold text-slate-800 font-[family-name:var(--font-plus-jakarta)] flex items-center gap-2 mb-4">
                <BookOpen className="w-6 h-6 text-indigo-600 shrink-0" aria-hidden />
                Strategic advice &amp; AEO
              </h2>
              {report.advisoryError && (
                <div
                  className={
                    report.meta.skippedAdvisoryDueToBudget
                      ? "rounded-xl border border-slate-200 bg-slate-50 text-slate-700 px-4 py-3 text-sm mb-4 flex gap-2 items-start"
                      : "rounded-xl border border-amber-200 bg-amber-50 text-amber-900 px-4 py-3 text-sm mb-4 flex gap-2 items-start"
                  }
                  role="status"
                >
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden />
                  <div>
                    <p className="font-medium">
                      {report.meta.skippedAdvisoryDueToBudget
                        ? "Advisory skipped (budget)"
                        : "Advisory step did not complete"}
                    </p>
                    <p className="mt-1 opacity-90">{report.advisoryError}</p>
                  </div>
                </div>
              )}
              {report.aggregateAdvice && (
                <div className="card border border-indigo-100 bg-indigo-50/40 p-6 max-h-[min(70vh,640px)] overflow-y-auto">
                  <pre className="whitespace-pre-wrap text-sm text-slate-800 leading-relaxed font-sans">
                    {report.aggregateAdvice}
                  </pre>
                </div>
              )}
            </section>
          )}

          <section className="mt-10 card p-6 bg-slate-50/80">
            <h3 className="font-bold text-slate-800 mb-2 font-[family-name:var(--font-plus-jakarta)]">
              How to read this
            </h3>
            <ul className="text-sm text-slate-600 space-y-2 list-disc pl-5">
              <li>
                If Wilderness is rarely mentioned, the model may be favouring other hire
                brands—compare who appears in the full responses and in which contexts.
              </li>
              <li>
                The strategic advice block uses the same model to react to all answers—it is
                guidance only, not a guarantee of AI or search outcomes.
              </li>
              <li>
                Improving on-site copy, structured data, backlinks, and brand search volume
                can all influence real-world discovery; the first pass only measures raw
                completion text.
              </li>
              <li>
                Edit seed prompts in{" "}
                <code className="text-slate-800 bg-white px-1 rounded border border-slate-200">
                  lib/ai-visibility/prompts.ts
                </code>
                . The model also proposes up to ten new prompts per run (capped by budget and
                the 30-prompt limit).
              </li>
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
