"use client";

import { useMemo, useState } from "react";
import ComparisonTable, { type ProductsColumn } from "@/components/ComparisonTable";
import { formatCurrency } from "@/lib/utils/format";
import type { InsuranceSlide, InsuranceRow } from "@/lib/insurance-slides";
import type { ProductOffer } from "@/lib/products";

type Props = {
  slides: InsuranceSlide[];
  currency?: string; // default "NZD"
};

type WithIns = ProductOffer & { _ins: InsuranceRow };

/** Sort by `basic` ascending; nulls last. */
function byBasicAsc(a: InsuranceRow, b: InsuranceRow): number {
  const av = a.basic == null ? Infinity : a.basic;
  const bv = b.basic == null ? Infinity : b.basic;
  return av - bv;
}

/** Map insurance rows to ProductOffer for table + enable numeric sorting. */
function toOfferRows(rows: InsuranceRow[], currency: string): WithIns[] {
  return rows.map((r) => ({
    id: r.id,
    vendor: r.provider,
    url: r.url ?? "#",

    // Enable built-in numeric sorting on the columns:
    // - "price" uses priceMin
    priceMin: typeof r.basic === "number" ? r.basic : undefined,
    currency,

    // - "rating" numeric sort (we store comprehensive here)
    rating: typeof r.comprehensive === "number" ? r.comprehensive : undefined,

    // - "stops" numeric sort (we store multiTrip here)
    stops: typeof r.multiTrip === "number" ? r.multiTrip : undefined,

    // keep original row for display in custom cells
    _ins: r,
  })) as WithIns[];
}

export default function InsuranceSlides({ slides, currency = "NZD" }: Props) {
  const [i, setI] = useState(0);
  const total = slides.length;
  const slide = slides[i];

  // Initial order: cheapest (by Basic) → most expensive
  const rows: WithIns[] = useMemo(() => {
    const sorted = [...slide.rows].sort(byBasicAsc);
    return toOfferRows(sorted, currency);
  }, [slide, currency]);

  const columns: ProductsColumn[] = useMemo(() => {
    return [
      // A–Z / Z–A
      { key: "vendor", header: "Provider", sortable: true },

      // Basic — numeric sort via priceMin
      {
        key: "price",
        header: slide.basicLabel || "Basic",
        align: "right",
        sortable: true,
        cell: (row) => {
          const v = (row as WithIns)._ins.basic;
          return v != null ? formatCurrency(v, currency) : "—";
        },
      },

      // Comprehensive — numeric sort via row.rating
      {
        key: "rating",
        header: "Comprehensive",
        align: "right",
        sortable: true,
        cell: (row) => {
          const v = (row as WithIns)._ins.comprehensive;
          return v != null ? formatCurrency(v, currency) : "—";
        },
      },

      // Multi Trip — numeric sort via row.stops
      {
        key: "stops",
        header: "Multi Trip",
        align: "right",
        sortable: true,
        cell: (row) => {
          const v = (row as WithIns)._ins.multiTrip;
          return v != null ? formatCurrency(v, currency) : "—";
        },
      },

      // Other Info — NOT sortable (as requested)
      {
        key: "title",
        header: "Other Info",
        sortable: false,
        cell: (row) => (row as WithIns)._ins.other ?? "—",
      },

      // Icon-only link at far right (keep unsortable to avoid a blank header button)
      { key: "link", header: "", align: "right", sortable: false },
    ];
  }, [slide, currency]);

  const prev = () => setI((p) => (p - 1 + total) % total);
  const next = () => setI((p) => (p + 1) % total);
  const go = (idx: number) => setI(idx);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={prev}
            className="px-3 py-1 rounded-lg border border-white/20"
            aria-label="Previous comparison"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={next}
            className="px-3 py-1 rounded-lg border border-white/20"
            aria-label="Next comparison"
          >
            ›
          </button>
        </div>
        <div className="text-sm" style={{ color: "var(--muted)" }}>
          {i + 1} / {total}
        </div>
      </div>

      {/* Title */}
      <h3 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
        {slide.title}
      </h3>

      {/* Table */}
      <ComparisonTable
        rows={rows}
        columns={columns}
        maxColumns={6}
        emptyText="No rows"
        tone="onDark"
      />

      {/* Dots / tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {slides.map((s, idx) => (
          <button
            key={s.title}
            type="button"
            onClick={() => go(idx)}
            className={`px-2 py-1 rounded ${idx === i ? "bg-white/20" : "bg-white/10"}`}
            aria-current={idx === i ? "page" : undefined}
            aria-label={`Go to ${s.title}`}
            title={s.title}
          >
            <span className="text-xs" style={{ color: "var(--text)" }}>
              {idx + 1}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
