"use client";

import React from "react";

// ---- Types ----
export type FilterKind = "search" | "select" | "multi" | "range" | "dateRange" | "checkbox";

export type FilterOption = { value: string; label: string };

export type FilterConfig<T> = {
  key: string;                          // unique id (e.g., "vendor", "brand", "q", "maxPrice")
  label?: string;                       // visible label
  kind: FilterKind;
  placeholder?: string;                 // for search
  options?: FilterOption[] | ((rows: T[]) => FilterOption[]); // select/multi options
  getValue?: (row: T) => any;           // derive value from a row (used for auto options & default predicates)
  min?: number;                         // range (min)
  max?: number;                         // range (max)
  step?: number;                        // range step
  format?: (n: number) => string;       // range display format
  predicate?: (row: T, value: any) => boolean; // custom filter logic (overrides default)
};

export type FilterState = Record<string, any>;

// ---- Helpers ----
function unique<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function coerceNum(n: any): number | null {
  const x = typeof n === "string" ? Number(n) : n;
  return Number.isFinite(x) ? x : null;
}

/**
 * Apply filters to rows (pure function).
 * - If a filter's state is empty/undefined, it's skipped.
 * - You can override per-filter logic with `predicate`.
 */
export function applyFilters<T>(rows: T[], configs: FilterConfig<T>[], state: FilterState): T[] {
  return rows.filter((row) =>
    configs.every((cfg) => {
      const value = state[cfg.key];

      // Skip empty filters
      if (
        value === undefined ||
        value === null ||
        (typeof value === "string" && value.trim() === "") ||
        (Array.isArray(value) && value.length === 0) ||
        (typeof value === "object" && cfg.kind === "dateRange" && !value.start && !value.end)
      ) {
        return true;
      }

      // Custom predicate wins
      if (cfg.predicate) return cfg.predicate(row, value);

      const v = cfg.getValue ? cfg.getValue(row) : undefined;

      switch (cfg.kind) {
        case "search": {
          const hay = (typeof v === "string" ? v : String(v ?? "")).toLowerCase();
          return hay.includes(String(value).toLowerCase());
        }
        case "select": {
          const s = String(value);
          return String(v ?? "") === s;
        }
        case "multi": {
          const vals = Array.isArray(value) ? value.map(String) : [String(value)];
          return vals.includes(String(v ?? ""));
        }
        case "range": {
          // numeric range: { min?: number; max?: number }
          const min = coerceNum(value?.min);
          const max = coerceNum(value?.max);
          const num = coerceNum(v);
          if (num === null) return false;
          if (min !== null && num < min) return false;
          if (max !== null && num > max) return false;
          return true;
        }
        case "dateRange": {
          // value: { start?: "YYYY-MM-DD", end?: "YYYY-MM-DD" }
          const start = value?.start ? Date.parse(value.start) : null;
          const end = value?.end ? Date.parse(value.end) : null;
          // Try to read row window: {startDate,endDate} from getValue or assume it's an object.
          const rv = v || {};
          const rowStart = rv.start ?? rv.startDate ?? null;
          const rowEnd = rv.end ?? rv.endDate ?? null;
          const rs = rowStart ? Date.parse(rowStart) : null;
          const re = rowEnd ? Date.parse(rowEnd) : null;

          // If row has only one date (start), compare to that; if both, check overlap
          if (start && rs && rs < start && (!re || re < start)) return false; // entirely before start
          if (end && re && re > end && (!rs || rs > end)) return false;       // entirely after end
          if (start && rs && rs < start && re == null) return false;          // start-only row before start
          if (end && rs && rs > end && re == null) return false;              // start-only row after end
          return true;
        }
        case "checkbox": {
          // value: boolean – if true, require truthy getValue(row)
          return value ? Boolean(v) : true;
        }
        default:
          return true;
      }
    })
  );
}

// ---- UI Component ----
export default function FilterBar<T>({
  rows,
  filters,
  state,
  onChange,
  onReset,
}: {
  rows: T[];
  filters: FilterConfig<T>[];
  state: FilterState;
  onChange: (next: FilterState) => void;
  onReset?: () => void;
}) {
  function set<K extends string>(key: K, val: any) {
    onChange({ ...state, [key]: val });
  }

  return (
    <div className="card p-3 md:p-4 space-y-3">
      <div className="flex flex-wrap gap-3">
        {filters.map((cfg) => {
          // Build options if needed (select/multi)
          let opts: FilterOption[] | undefined = undefined;
          if (cfg.kind === "select" || cfg.kind === "multi") {
            if (typeof cfg.options === "function") {
              opts = cfg.options(rows);
            } else if (Array.isArray(cfg.options)) {
              opts = cfg.options;
            } else if (cfg.getValue) {
              const values = unique(
                rows.map((r) => String(cfg.getValue!(r) ?? "")).filter(Boolean)
              );
              opts = values.map((v) => ({ value: v, label: v }));
            } else {
              opts = [];
            }
          }

          // Render control per kind
          switch (cfg.kind) {
            case "search":
              return (
                <label key={cfg.key} className="flex flex-col gap-1">
                  {cfg.label && <span className="text-sm text-gray-500">{cfg.label}</span>}
                  <input
                    type="text"
                    className="input"
                    placeholder={cfg.placeholder ?? "Search…"}
                    value={state[cfg.key] ?? ""}
                    onChange={(e) => set(cfg.key, e.target.value)}
                  />
                </label>
              );

            case "select":
              return (
                <label key={cfg.key} className="flex flex-col gap-1">
                  {cfg.label && <span className="text-sm text-gray-500">{cfg.label}</span>}
                  <select
                    className="input"
                    value={state[cfg.key] ?? ""}
                    onChange={(e) => set(cfg.key, e.target.value)}
                  >
                    <option value="">{cfg.placeholder ?? "All"}</option>
                    {opts?.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </label>
              );

            case "multi":
              return (
                <label key={cfg.key} className="flex flex-col gap-1">
                  {cfg.label && <span className="text-sm text-gray-500">{cfg.label}</span>}
                  <select
                    multiple
                    className="input h-28"
                    value={state[cfg.key] ?? []}
                    onChange={(e) =>
                      set(
                        cfg.key,
                        Array.from(e.currentTarget.selectedOptions).map((o) => o.value)
                      )
                    }
                  >
                    {opts?.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </label>
              );

            case "range": {
              const min = cfg.min ?? 0;
              const max = cfg.max ?? 10000;
              const val = state[cfg.key] ?? {};
              const vmin = val.min ?? "";
              const vmax = val.max ?? "";
              const fmt = cfg.format ?? ((n: number) => String(n));
              return (
                <div key={cfg.key} className="flex flex-col gap-1">
                  {cfg.label && <span className="text-sm text-gray-500">{cfg.label}</span>}
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      className="input w-28"
                      placeholder={fmt(min)}
                      value={vmin}
                      onChange={(e) => set(cfg.key, { ...val, min: e.target.value === "" ? "" : Number(e.target.value) })}
                    />
                    <span className="text-gray-400">–</span>
                    <input
                      type="number"
                      className="input w-28"
                      placeholder={fmt(max)}
                      value={vmax}
                      onChange={(e) => set(cfg.key, { ...val, max: e.target.value === "" ? "" : Number(e.target.value) })}
                    />
                  </div>
                </div>
              );
            }

            case "dateRange": {
              const val = state[cfg.key] ?? {};
              return (
                <div key={cfg.key} className="flex flex-col gap-1">
                  {cfg.label && <span className="text-sm text-gray-500">{cfg.label}</span>}
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      className="input"
                      value={val.start ?? ""}
                      onChange={(e) => set(cfg.key, { ...val, start: e.target.value })}
                    />
                    <span className="text-gray-400">→</span>
                    <input
                      type="date"
                      className="input"
                      value={val.end ?? ""}
                      onChange={(e) => set(cfg.key, { ...val, end: e.target.value })}
                    />
                  </div>
                </div>
              );
            }

            case "checkbox":
              return (
                <label key={cfg.key} className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="accent-current"
                    checked={Boolean(state[cfg.key])}
                    onChange={(e) => set(cfg.key, e.target.checked)}
                  />
                  <span>{cfg.label ?? cfg.key}</span>
                </label>
              );

            default:
              return null;
          }
        })}
      </div>

      <div className="flex items-center gap-3">
<button type="button" className="btn btn-brand" onClick={() => onChange({})}>
  Clear
</button>
        {onReset && (
          <button
            type="button"
            className="rounded-lg border px-3 py-2 text-sm hover:bg-white/10"
            onClick={onReset}
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

// Allow both default and named import styles
export { FilterBar };
