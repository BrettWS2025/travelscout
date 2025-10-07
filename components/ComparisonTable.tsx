"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import type { ProductOffer } from "@/lib/types/products";
import { formatCurrency, formatDateRange } from "@/lib/utils/format";
import { ArrowUpRight } from "lucide-react";

export type ColumnKey =
  | "vendor"
  | "brand"
  | "title"
  | "price"
  | "dateRange"
  | "ageRange"
  | "route"
  | "origin"
  | "destination"
  | "duration"
  | "cabin"
  | "baggage"
  | "stops"
  | "policy"
  | "rating"
  | "link"; // special: renders a link, no visible header

export type ProductsColumn = {
  key: ColumnKey;
  header?: string;                  // omit or "" for the Link column (no visible title)
  sortable?: boolean;
  align?: "left" | "center" | "right";
  widthClass?: string;              // e.g. "w-24"
  cell?: (row: ProductOffer) => React.ReactNode; // custom render override
};

type SortState = { key: ColumnKey | null; dir: "asc" | "desc" };

function defaultCell(row: ProductOffer, key: ColumnKey): React.ReactNode {
  switch (key) {
    case "vendor": return row.vendor;
    case "brand": return row.brand ?? "—";
    case "title": return row.title ?? "—";
    case "price": {
      if (row.priceText) return row.priceText;
      if (row.priceMin != null) {
        const min = formatCurrency(row.priceMin, row.currency ?? "NZD");
        const max = row.priceMax ? `–${formatCurrency(row.priceMax, row.currency ?? "NZD")}` : "";
        return `${min}${max}`;
      }
      return "—";
    }
    case "dateRange": {
      if (row.dateText) return row.dateText;
      const rng = formatDateRange(row.startDate ?? null, row.endDate ?? null);
      return rng || "—";
    }
    case "ageRange": {
      if (row.ageText) return row.ageText;
      if (row.ageMin != null || row.ageMax != null) {
        const min = row.ageMin ?? 0;
        return row.ageMax ? `${min}–${row.ageMax}` : `${min}+`;
      }
      return "All ages";
    }
    case "route": {
      if (row.routeText) return row.routeText;
      if (row.origin || row.destination) return [row.origin, row.destination].filter(Boolean).join(" → ");
      return "—";
    }
    case "origin": return row.origin ?? "—";
    case "destination": return row.destination ?? "—";
    case "duration": return row.durationText ?? "—";
    case "cabin": return row.cabin ?? "—";
    case "baggage": return row.baggage ?? "—";
    case "stops": return row.stops != null ? String(row.stops) : "—";
    case "policy": return row.policy ?? "—";
    case "rating": return row.rating != null ? row.rating.toFixed(1) : "—";
    case "link":
      return (
        <Link
          href={row.url}
          className="inline-flex items-center gap-1 underline hover:no-underline"
          aria-label={`Open ${row.title ?? row.brand ?? row.vendor ?? "item"}`}
        >
          <ArrowUpRight className="w-4 h-4" />
        </Link>
      );
    default: return "—";
  }
}

function valueForSort(row: ProductOffer, key: ColumnKey): string | number {
  switch (key) {
    case "vendor": return row.vendor ?? "";
    case "brand": return row.brand ?? "";
    case "title": return row.title ?? "";
    case "price": return row.priceMin ?? Number.POSITIVE_INFINITY;
    case "dateRange": return row.startDate ? Date.parse(row.startDate) : Number.POSITIVE_INFINITY;
    case "ageRange": return row.ageMin ?? 0;
    case "route": return row.routeText ?? `${row.origin ?? ""}-${row.destination ?? ""}`;
    case "origin": return row.origin ?? "";
    case "destination": return row.destination ?? "";
    case "duration": {
      // try to extract a number from "7 nights", "10h 35m" → use a simple parse
      const m = (row.durationText ?? "").match(/\d+/);
      return m ? parseInt(m[0], 10) : Number.POSITIVE_INFINITY;
    }
    case "cabin": return row.cabin ?? "";
    case "baggage": return row.baggage ?? "";
    case "stops": return row.stops ?? Number.POSITIVE_INFINITY;
    case "policy": return row.policy ?? "";
    case "rating": return row.rating ?? -1;
    case "link": return 0; // not sortable
    default: return "";
  }
}

export default function ProductsTable({
  rows,
  columns,
  emptyText = "No items yet.",
  maxColumns = 10,
}: {
  rows: ProductOffer[];
  columns: ProductsColumn[]; // provide up to 10
  emptyText?: string;
  maxColumns?: number;
}) {
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });

  const visibleCols = useMemo(() => columns.slice(0, maxColumns), [columns, maxColumns]);

  const sorted = useMemo(() => {
    if (!sort.key || !visibleCols.find(c => c.key === sort.key)?.sortable) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      const va = valueForSort(a, sort.key!);
      const vb = valueForSort(b, sort.key!);
      if (typeof va === "number" && typeof vb === "number") {
        return sort.dir === "asc" ? va - vb : vb - va;
      }
      return sort.dir === "asc"
        ? String(va).localeCompare(String(vb))
        : String(vb).localeCompare(String(va));
    });
    return copy;
  }, [rows, sort, visibleCols]);

  function toggleSort(key: ColumnKey, enabled?: boolean) {
    if (!enabled) return;
    setSort((prev) => {
      if (prev.key !== key) return { key, dir: "asc" };
      return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
    });
  }

  return (
    <div className="overflow-x-auto rounded-2xl border">
      <table className="min-w-full text-left">
        <thead className="bg-gray-50">
          <tr className="text-sm text-gray-600">
            {visibleCols.map((c) => {
              const align = c.align ?? (c.key === "price" ? "right" : "left");
              const isLink = c.key === "link";
              return (
                <th
                  key={`${c.key}-${c.header ?? ""}`}
                  className={`px-4 py-3 ${c.widthClass ?? ""} ${align === "right" ? "text-right" : align === "center" ? "text-center" : ""}`}
                  scope="col"
                >
                  {isLink ? (
                    // No visible title, but keep an accessible name
                    <span className="sr-only">Link</span>
                  ) : c.sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(c.key, true)}
                      className="inline-flex items-center gap-1 hover:underline"
                    >
                      {c.header ?? c.key}
                      {sort.key === c.key && (
                        <span aria-hidden>{sort.dir === "asc" ? " ▲" : " ▼"}</span>
                      )}
                    </button>
                  ) : (
                    c.header ?? c.key
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y">
          {sorted.length === 0 && (
            <tr>
              <td className="px-4 py-8 text-center text-gray-500" colSpan={visibleCols.length}>
                {emptyText}
              </td>
            </tr>
          )}
          {sorted.map((row) => (
            <tr key={row.id} className="text-sm">
              {visibleCols.map((c) => {
                const content = c.cell ? c.cell(row) : defaultCell(row, c.key);
                const align = c.align ?? (c.key === "price" ? "right" : "left");
                return (
                  <td
                    key={`${row.id}-${c.key}`}
                    className={`px-4 py-3 ${align === "right" ? "text-right" : align === "center" ? "text-center" : ""}`}
                  >
                    {content}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
