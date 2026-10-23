"use client";

import {
  formatMinorAsDollars,
  type DealEditorSummary,
} from "@/lib/marketplace/deal-editor";
import type { EditorStep } from "@/lib/marketplace/deal-publish-validation";
import { statusLabel } from "@/lib/marketplace/display-labels";

type Props = {
  summary: DealEditorSummary;
  status: string | null;
  onFix: (step: EditorStep) => void;
};

export function DealEditorSidebar({ summary, status, onFix }: Props) {
  return (
    <aside className="rounded-2xl border border-[var(--ts-ink)]/10 bg-white/80 p-4 shadow-[0_12px_30px_rgba(16,36,28,0.05)] md:sticky md:top-28">
      <p className="font-[family-name:var(--font-sora)] text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--ts-teal)]">
        Summary
      </p>
      <dl className="mt-3 space-y-3 font-[family-name:var(--font-sora)] text-sm">
        <div>
          <dt className="text-[var(--ts-muted)]">Lowest deal price</dt>
          <dd className="font-semibold text-[var(--ts-ink)]">
            {formatMinorAsDollars(summary.lowestDealMinor)}
            {summary.lowestOriginalMinor != null && (
              <span className="ml-2 text-xs font-normal text-[var(--ts-muted)] line-through">
                {formatMinorAsDollars(summary.lowestOriginalMinor)}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--ts-muted)]">Discount</dt>
          <dd className="font-semibold text-[var(--ts-ink)]">
            {summary.discountPct != null ? `${summary.discountPct}%` : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--ts-muted)]">Sessions</dt>
          <dd className="font-semibold text-[var(--ts-ink)]">
            {summary.sessionCount}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--ts-muted)]">Status</dt>
          <dd className="font-semibold capitalize text-[var(--ts-ink)]">
            {status ? statusLabel(status) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--ts-muted)]">Validation</dt>
          <dd
            className={`font-semibold ${
              summary.validationOk
                ? "text-[var(--ts-teal)]"
                : "text-amber-700"
            }`}
          >
            {summary.validationOk ? "Ready" : "Needs fixes"}
          </dd>
        </div>
      </dl>

      {summary.failingChecks.length > 0 && (
        <ul className="mt-4 space-y-2 border-t border-[var(--ts-ink)]/10 pt-4">
          {summary.failingChecks.slice(0, 6).map((check) => (
            <li key={check.key} className="text-xs text-[var(--ts-ink)]">
              <p className="font-medium">{check.label}</p>
              {check.message && (
                <p className="text-[var(--ts-muted)]">{check.message}</p>
              )}
              <button
                type="button"
                className="mt-1 font-semibold text-[var(--ts-teal)] underline-offset-2 hover:underline"
                onClick={() => onFix(check.editorStep)}
              >
                Fix
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
