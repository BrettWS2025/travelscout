"use client";

type Props = {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  label: string;
  id: string;
};

/**
 * Compact +/- seat control for the mobile quick-update page (Chunk 24).
 */
export function SeatStepper({
  value,
  onChange,
  min = 0,
  max = 999,
  disabled = false,
  label,
  id,
}: Props) {
  const clamped = Math.min(max, Math.max(min, value));

  function bump(delta: number) {
    if (disabled) return;
    onChange(Math.min(max, Math.max(min, clamped + delta)));
  }

  return (
    <div className="flex items-center gap-2">
      <span
        id={`${id}-label`}
        className="min-w-0 flex-1 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-ink)]"
      >
        {label}
      </span>
      <div
        className="inline-flex items-center rounded-xl border border-[var(--ts-ink)]/12 bg-white"
        role="group"
        aria-labelledby={`${id}-label`}
      >
        <button
          type="button"
          aria-label={`Decrease seats for ${label}`}
          disabled={disabled || clamped <= min}
          onClick={() => bump(-1)}
          className="h-10 w-10 rounded-l-xl font-[family-name:var(--font-sora)] text-lg font-semibold text-[var(--ts-ink)] transition hover:bg-[var(--ts-mist)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          −
        </button>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          disabled={disabled}
          value={clamped}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={clamped}
          aria-label={`Seats for ${label}`}
          onChange={(e) => {
            const n = Number.parseInt(e.target.value, 10);
            if (!Number.isFinite(n)) {
              onChange(min);
              return;
            }
            onChange(Math.min(max, Math.max(min, n)));
          }}
          className="h-10 w-12 border-x border-[var(--ts-ink)]/10 bg-transparent text-center font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--ts-ink)] outline-none disabled:opacity-50"
        />
        <button
          type="button"
          aria-label={`Increase seats for ${label}`}
          disabled={disabled || clamped >= max}
          onClick={() => bump(1)}
          className="h-10 w-10 rounded-r-xl font-[family-name:var(--font-sora)] text-lg font-semibold text-[var(--ts-ink)] transition hover:bg-[var(--ts-mist)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}
