"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import type { ProductOffer } from "@/lib/products";
import { formatCurrency, formatDateRange } from "@/lib/utils/format";
import { ArrowUpRight } from "lucide-react";

/**
 * Column keys supported by the default renderer.
 * (You can still use `cell` to override a column’s content when rendering
 *  this component from a Client Component.)
 */
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
  | "link"; // special: renders a link; typically no visible header

export type ProductsColumn = {
  key: ColumnKey;
  header?: string; // omit or "" for the Link column (no visible title)
  sortable?: boolean;
  align?: "left" | "center" | "right";
  widthClass?: string; // e.g. "w-24"
  cell?: (row: ProductOffer) => React.ReactNode; // custom render override (client-only)
  /** If key === "link" and you provide this, the cell renders this text instead of the icon. */
  linkLabel?: string;
};

type SortState = { key: ColumnKey | null; dir: "asc" | "desc" };

function alignClass(align?: "left" | "center" | "right", key?: ColumnKey) {
  const a = align ?? (key === "price" ? "right" : "left");
  return a === "right" ? "text-right" : a === "center" ? "text-center" : "";
}

function formatPrice(row: ProductOffer): string {
  if (row.priceText) return row.priceText;
  const cur = row.currency ?? "NZD";
  const hasMin = typeof row.priceMin === "number";
  const hasMax = typeof row.priceMax === "number";
  if (hasMin && hasMax) {
    return `${formatCurrency(row.priceMin as number, cur)}–${formatCurrency(
      row.priceMax as number,
      cur
    )}`;
  }
  if (hasMin) return formatCurrency(row.priceMin as number, cur);
  if (hasMax) return formatCurrency(row.priceMax as number, cur);
  return "—";
}

function defaultCellText(row: ProductOffer, key: ColumnKey): string {
  switch (key) {
    case "vendor":
      return row.vendor ?? "—";
    case "brand":
      return row.brand ?? "—";
    case "title":
      return row.title ?? "—";
    case "price":
      return formatPrice(row);
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
    case "route":
      if (row.routeText) return row.routeText;
      if (row.origin && row.destination) return `${row.origin} → ${row.destination}`;
      return row.origin ?? row.destination ?? "—";
    case "origin":
      return row.origin ?? "—";
    case "destination":
      return row.destination ?? "—";
    case "duration":
      return row.durationText ?? "—";
    case "cabin":
      return row.cabin ?? "—";
    case "baggage":
      return row.baggage ?? "—";
    case "stops":
      if (row.stops == null) return "—";
      return row.stops === 0 ? "Nonstop" : `${row.stops} stop${row.stops > 1 ? "s" : ""}`;
    case "policy":
      return row.policy ?? "—";
    case "rating":
      return row.rating != null ? `${row.rating.toFixed(1)}` : "—";
    case "link":
      return row.url || "—";
    default:
      return "—";
  }
}

function defaultCell(row: ProductOffer, col: ProductsColumn): React.ReactNode {
  const key = col.key;
  switch (key) {
    case "link":
      if (!row.url) return "—";
      // If a column-level label is provided, render that text; otherwise keep the icon-only default.
      if (col.linkLabel) {
        return (
          <Link
            href={row.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
            aria-label="Open link"
          >
            {col.linkLabel}
          </Link>
        );
      }
      return (
        <Link
          href={row.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 underline"
        >
          <span className="sr-only">Open</span>
          <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
        </Link>
      );
    case "price":
      return <span>{formatPrice(row)}</span>;
    default:
      return <span>{defaultCellText(row, key)}</span>;
  }
}

function sortValue(row: ProductOffer, key: ColumnKey): number | string {
  switch (key) {
    case "price": {
      // Use priceMin for sorting; missing values go last on asc.
      if (typeof row.priceMin === "number") return row.priceMin as number;
      if (typeof row.priceMax === "number") return row.priceMax as number;
      return Number.POSITIVE_INFINITY;
    }
    case "dateRange": {
      const t = Date.parse(row.startDate ?? "");
      return Number.isNaN(t) ? 0 : t;
    }
    case "rating":
      return row.rating != null ? (row.rating as number) : -Infinity;
    case "stops":
      return row.stops != null ? (row.stops as number) : 99;
    default:
      return defaultCellText(row, key).toString().toLowerCase();
  }
}

/**
 * Shared comparison table (client component).
 * Now supports `tone="onDark"` for use on dark backgrounds
 * (text from `var(--text)`, muted from `var(--muted)`).
 */
export default function ProductsTable({
  rows,
  columns,
  emptyText = "No items yet.",
  maxColumns = 10,
  tone = "light",
}: {
  rows: ProductOffer[];
  columns: ProductsColumn[]; // provide up to 10
  emptyText?: string;
  maxColumns?: number;
  /** Use "onDark" when placed on dark backgrounds; uses var(--text)/var(--muted) from styles. */
  tone?: "light" | "onDark";
}) {
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });

  const visibleCols = useMemo(() => columns.slice(0, maxColumns), [columns, maxColumns]);

  const sorted = useMemo(() => {
    if (!sort.key) return rows;
    const key = sort.key;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = sortValue(a, key);
      const bv = sortValue(b, key);
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * dir;
      }
      return av.toString().localeCompare(bv.toString()) * dir;
    });
  }, [rows, sort]);

  function toggleSort(key: ColumnKey) {
    setSort((prev) => {
      if (prev.key !== key) return { key, dir: "asc" };
      return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
    });
  }

  function sortIndicator(k: ColumnKey) {
    if (sort.key !== k) return null;
    return (
      <span aria-hidden className="inline-block">
        {sort.dir === "asc" ? "▲" : "▼"}
      </span>
    );
  }

  const headerTextClass = tone === "onDark" ? "" : "text-gray-600";

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left">
        {/* Header */}
        <thead className={tone === "onDark" ? undefined : "bg-gray-50"}>
          <tr
            className={`text-sm ${headerTextClass}`}
            style={tone === "onDark" ? { color: "var(--text)" } : undefined}
          >
            {visibleCols.map((c, ci) => {
              const align = c.align ?? (c.key === "price" ? "right" : "left");
              const isLink = c.key === "link";
              const header = c.header ?? (isLink ? "" : "");
              return (
                <th
                  key={`${ci}-${c.key}-${header}`}
                  className={`px-4 py-3 ${c.widthClass ?? ""} ${alignClass(align)}`}
                  scope="col"
                >
                  {isLink ? (
                    // No visible title, but keep an accessible name
                    <span className="sr-only">Link</span>
                  ) : c.sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(c.key)}
                      className="inline-flex items-center gap-2 underline underline-offset-4"
                      aria-sort={
                        sort.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"
                      }
                    >
                      <span>{header}</span>
                      {sortIndicator(c.key)}
                    </button>
                  ) : (
                    <span>{header}</span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>

        {/* Body */}
        <tbody>
          {sorted.length === 0 && (
            <tr>
              <td
                className={`px-4 py-8 text-center ${tone === "onDark" ? "" : "text-gray-500"}`}
                style={tone === "onDark" ? { color: "var(--muted)" } : undefined}
                colSpan={visibleCols.length}
              >
                {emptyText}
              </td>
            </tr>
          )}

          {sorted.map((row) => (
            <tr key={row.id} className="text-sm">
              {visibleCols.map((c, ci) => {
                const content = c.cell ? c.cell(row) : defaultCell(row, c);
                const align = c.align ?? (c.key === "price" ? "right" : "left");
                return (
                  <td
                    key={`${row.id}-${c.key}-${ci}`}
                    className={`px-4 py-3 ${alignClass(align, c.key)}`}
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
