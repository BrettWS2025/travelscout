"use client";

type Props = {
  open: boolean;
  warnings: string[];
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmLiveEditDialog({
  open,
  warnings,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="live-edit-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-[var(--ts-ink)]/10 bg-white p-5 shadow-[0_24px_60px_rgba(16,36,28,0.18)]">
        <h3
          id="live-edit-title"
          className="font-[family-name:var(--font-instrument)] text-2xl text-[var(--ts-ink)]"
        >
          Confirm change on live deal
        </h3>
        <p className="mt-2 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
          This deal is live. Saving will re-check publish rules.
        </p>
        {warnings.length > 0 && (
          <ul className="mt-3 list-disc space-y-1 pl-5 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-ink)]">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-xl bg-[var(--ts-teal)] px-4 py-2.5 font-[family-name:var(--font-sora)] text-sm font-semibold text-white"
          >
            Confirm save
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-[var(--ts-ink)]/15 bg-white px-4 py-2.5 font-[family-name:var(--font-sora)] text-sm font-medium text-[var(--ts-ink)]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
