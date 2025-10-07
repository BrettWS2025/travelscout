"use client";

import React from "react";
import ProductsTable, { type ProductsColumn } from "@/components/ComparisonTable";
import type { ProductOffer } from "@/lib/products";

// ------- Declarative filter spec (JSON only; no functions) -------
type FilterKind = "search" | "select" | "range" | "dateRange" | "checkbox";

type SearchFilter = {
  key: string;
  kind: "search";
  label?: string;
  placeholder?: string;
  fields: (keyof ProductOffer)[]; // fields to search across
};

type SelectFilter = {
  key: string;
  kind: "select";
  label?: string;
  placeholder?: string;
  field: keyof ProductOffer;       // single field
  options?: string[];              // optional fixed list; otherwise auto-built from rows
};

type RangeFilter = {
  key: string;
  kind: "range";
  label?: string;
  field: keyof ProductOffer;       // numeric field e.g. "priceMin"
  min?: number;
  max?: number;
  step?: number;
  format?: (n: number) => string;  // optional display only (runs client-side)
};

type DateRangeFilter = {
  key: string;
  kind: "dateRange";
  label?: string;
  startField: keyof ProductOffer;  // e.g. "startDate"
  endField: keyof ProductOffer;    // e.g. "endDate"
};

type CheckboxFilter = {
  key: string;
  kind: "checkbox";
  label?: string;
  field: keyof ProductOffer;       // truthy/falsey field
};

export type FilterSpec = SearchFilter | SelectFilter | RangeFilter | DateRangeFilter | CheckboxFilter;

export type FilterState = Record<string, any>;

// ------- helpers -------
const uniq = (arr: string[]) => Array.from(new Set(arr)).filter(Boolean);

const get = (row: ProductOffer, field: keyof ProductOffer) => row[field] as any;

function applyFilters(rows: ProductOffer[], specs: FilterSpec[], state: FilterState) {
  return rows.filter((row) =>
    specs.every((f) => {
      const val = state[f.key];

      // skip empty filter
      if (
        val === undefined ||
        val === null ||
        (typeof val === "string" && val.trim() === "") ||
        (Array.isArray(val) && val.length === 0) ||
        (f.kind === "range" && val?.min == null && val?.max == null) ||
        (f.kind === "dateRange" && !val?.start && !val?.end) ||
        (f.kind === "checkbox" && !val)
      ) {
        return true;
      }

      switch (f.kind) {
        case "search": {
          const needle = String(val).toLowerCase();
          const hay = f.fields.map((k) => String(get(row, k) ?? "")).join(" ").toLowerCase();
          return hay.includes(needle);
        }
        case "select": {
          return String(get(row, f.field) ?? "") === String(val);
        }
        case "range": {
          const n = Number(get(row, f.field));
          if (!Number.isFinite(n)) return false;
          const min = typeof val?.min === "number" ? val.min : undefined;
          const max = typeof val?.max === "number" ? val.max : undefined;
          if (min !== undefined && n < min) return false;
          if (max !== undefined && n > max) return false;
          return true;
        }
        case "dateRange": {
          const start = val?.start ? Date.parse(val.start) : null;
          const end = val?.end ? Date.parse(val.end) : null;
          const rs = get(row, f.startField) ? Date.parse(String(get(row, f.startField))) : null;
          const re = get(row, f.endField) ? Date.parse(String(get(row, f.endField))) : null;
          // overlap (tolerant)
          if (start && re && re < start) return false;
          if (end && rs && rs > end) return false;
          return true;
        }
        case "checkbox": {
          return Boolean(get(row, f.field));
        }
      }
    })
  );
}

// ------- UI -------
export default function FilterableProducts({
  rows,
  columns,
  filters,
  heading,
}: {
  rows: ProductOffer[];
  columns: ProductsColumn[];   // same type you already use for ProductsTable
  filters: FilterSpec[];       // declarative JSON config
  heading?: string;
}) {
  const [state, setState] = React.useState<FilterState>({});

  // build select options if not provided
  const autoOptions = React.useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const f of filters) {
      if (f.kind === "select" && !f.options) {
        map[f.key] = uniq(rows.map((r) => String(get(r, f.field) ?? "")));
      }
    }
    return map;
  }, [filters, rows]);

  const filtered = React.useMemo(() => applyFilters(rows, filters, state), [rows, filters, state]);

  return (
    <div className="space-y-4">
      {heading && <h2 className="text-xl font-semibold">{heading}</h2>}

      <div className="card p-3 md:p-4 space-y-3">
        <div className="flex flex-wrap gap-3">
          {filters.map((f) => {
            switch (f.kind) {
              case "search":
                return (
                  <label key={f.key} className="flex flex-col gap-1">
                    {f.label && <span className="text-sm text-gray-500">{f.label}</span>}
                    <input
                      type="text"
                      className="input"
                      placeholder={f.placeholder ?? "Search…"}
                      value={state[f.key] ?? ""}
                      onChange={(e) => setState({ ...state, [f.key]: e.target.value })}
                    />
                  </label>
                );
              case "select": {
                const opts = f.options ?? autoOptions[f.key] ?? [];
                return (
                  <label key={f.key} className="flex flex-col gap-1">
                    {f.label && <span className="text-sm text-gray-500">{f.label}</span>}
                    <select
                      className="input"
                      value={state[f.key] ?? ""}
                      onChange={(e) => setState({ ...state, [f.key]: e.target.value })}
                    >
                      <option value="">{f.placeholder ?? "All"}</option>
                      {opts.map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  </label>
                );
              }
              case "range": {
                const val = state[f.key] ?? {};
                const fmt = f.format ?? ((n: number) => String(n));
                return (
                  <div key={f.key} className="flex flex-col gap-1">
                    {f.label && <span className="text-sm text-gray-500">{f.label}</span>}
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        className="input w-28"
                        placeholder={f.min !== undefined ? fmt(f.min) : "Min"}
                        value={val.min ?? ""}
                        onChange={(e) =>
                          setState({ ...state, [f.key]: { ...val, min: e.target.value === "" ? undefined : Number(e.target.value) } })
                        }
                      />
                      <span className="text-gray-400">–</span>
                      <input
                        type="number"
                        className="input w-28"
                        placeholder={f.max !== undefined ? fmt(f.max) : "Max"}
                        value={val.max ?? ""}
                        onChange={(e) =>
                          setState({ ...state, [f.key]: { ...val, max: e.target.value === "" ? undefined : Number(e.target.value) } })
                        }
                      />
                    </div>
                  </div>
                );
              }
              case "dateRange": {
                const val = state[f.key] ?? {};
                return (
                  <div key={f.key} className="flex flex-col gap-1">
                    {f.label && <span className="text-sm text-gray-500">{f.label}</span>}
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        className="input"
                        value={val.start ?? ""}
                        onChange={(e) => setState({ ...state, [f.key]: { ...val, start: e.target.value } })}
                      />
                      <span className="text-gray-400">→</span>
                      <input
                        type="date"
                        className="input"
                        value={val.end ?? ""}
                        onChange={(e) => setState({ ...state, [f.key]: { ...val, end: e.target.value } })}
                      />
                    </div>
                  </div>
                );
              }
              case "checkbox":
                return (
                  <label key={f.key} className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="accent-current"
                      checked={Boolean(state[f.key])}
                      onChange={(e) => setState({ ...state, [f.key]: e.target.checked })}
                    />
                    <span>{f.label ?? f.key}</span>
                  </label>
                );
            }
          })}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="rounded-lg border px-3 py-2 text-sm hover:bg-white/10"
            onClick={() => setState({})}
          >
            Clear
          </button>
        </div>
      </div>

      <ProductsTable rows={filtered} columns={columns} />
    </div>
  );
}
