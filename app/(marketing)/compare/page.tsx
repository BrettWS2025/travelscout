"use client";

import React from "react";
import ProductsTable, { type ProductsColumn } from "@/components/ComparisonTable";
import { FilterBar, type FilterConfig, type FilterState, applyFilters } from "@/components/FilterBar";
import type { ProductOffer } from "@/lib/products";

export default function CompareClient({ rows }: { rows: ProductOffer[] }) {
  const [state, setState] = React.useState<FilterState>({});

  // Columns for this page (choose any 1–10, order is up to you)
  const columns: ProductsColumn[] = [
    { key: "vendor",    header: "Agency", sortable: true },
    { key: "brand",     header: "Cruise Line", sortable: true },
    { key: "price",     header: "Price", align: "right", sortable: true },
    { key: "dateRange", header: "Dates", sortable: true },
    { key: "link" }, // icon-only
  ];

  // Filters for this page (define here because configs include functions)
  const filters: FilterConfig<ProductOffer>[] = [
    {
      key: "q",
      label: "Search",
      kind: "search",
      placeholder: "Search agency, line, title…",
      getValue: (r) => [r.vendor, r.brand, r.title].filter(Boolean).join(" "),
    },
    { key: "vendor", label: "Agency", kind: "select", getValue: (r) => r.vendor },
    { key: "brand",  label: "Cruise line", kind: "select", getValue: (r) => r.brand ?? "" },
    {
      key: "price",
      label: "Price (min–max)",
      kind: "range",
      getValue: (r) => r.priceMin ?? Number.POSITIVE_INFINITY,
      min: 0,
      max: 5000,
      step: 50,
      format: (n) => `NZ$${n.toLocaleString()}`,
    },
    {
      key: "dates",
      label: "Departing",
      kind: "dateRange",
      getValue: (r) => ({ start: r.startDate, end: r.endDate }),
    },
  ];

  const filtered = React.useMemo(() => applyFilters(rows, filters, state), [rows, filters, state]);

  return (
    <>
      <FilterBar<ProductOffer>
        rows={rows}
        filters={filters}
        state={state}
        onChange={setState}
      />
      <ProductsTable rows={filtered} columns={columns} />
    </>
  );
}
