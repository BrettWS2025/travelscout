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

function toOfferRows(rows: InsuranceRow[]): WithIns[] {
  return rows.map((r) => ({
    id: r.id,
    vendor: r.provider,
    url: r.url ?? "#",
    // everything else lives under _ins for custom cells
    _ins: r,
  })) as WithIns[];
}

export default function InsuranceSlides({ slides, currency = "NZD" }: Props) {
  const [i, setI] = useState(0);
  const total = slides.length;
  const slide = slides[i];

  const rows: WithIns[] = useMemo(() => toOfferRows(slide.rows), [slide]);
  const columns: ProductsColumn[] = useMemo(() => {
    return [
      { key: "vendor", header: "Provider", sortable: true },
      {
        key: "price",
        header: "Basic",
        align: "right",
        cell: (row) => {
          const v = (row as WithIns)._ins.basic;
          return v != null ? formatCurrency(v, currency) : "—";
        },
      },
      {
        key: "rating",
        header: "Comprehensive",
        align: "right",
        cell: (row) => {
          const v = (row as WithIns)._ins.comprehensive;
          return v != null ? formatCurrency(v, currency) : "—";
        },
      },
      {
        key: "destination",
        header: "Multi Trip",
        align: "right",
        cell: (row) => {
          const v = (row as WithIns)._ins.multiTrip;
          return v != null ? formatCurrency(v, currency) : "—";
        },
      },
      {
        key: "title",
        header: "Other Info",
        cell: (row) => ( (row as WithIns)._ins.other ?? "—"),
      },
      // icon-only link at far right, no header
      { key: "link", header: "", align: "right" },
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

      {/* Table (dark tone to keep header/empty text white via your theme) */}
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
            className={`px-2 py-1 rounded ${
              idx === i ? "bg-white/20" : "bg-white/10"
            }`}
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
