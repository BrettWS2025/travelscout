"use client";

import ProductsTable, { type ProductsColumn } from "@/components/ComparisonTable";
import { FilterBar, type FilterConfig, type FilterState, applyFilters } from "@/components/FilterBar";
import type { ProductOffer } from "@/lib/products";

export const metadata = { title: "Compare" };

const rows: ProductOffer[] = [
  {
    id: "cruise-001",
    vendor: "TravelScout",
    brand: "Princess Cruises",
    priceMin: 1299,
    priceText: "NZ$1,299 pp (inside)",
    currency: "NZD",
    startDate: "2025-11-01",
    endDate: "2026-02-28",
    dateText: "Nov 2025 – Feb 2026",
    url: "/deals/cruise-deals#cruise-001",
  },
  {
    id: "cruise-002",
    vendor: "OceanDeals",
    brand: "Royal Caribbean",
    priceMin: 1499,
    priceText: "from NZ$1,499 pp",
    currency: "NZD",
    startDate: "2025-12-10",
    endDate: "2026-03-20",
    dateText: "Dec 2025 – Mar 2026",
    url: "/deals/cruise-deals#cruise-002",
  },
  {
    id: "cruise-003",
    vendor: "Direct",
    brand: "P&O Cruises",
    priceMin: 999,
    priceText: "NZ$999 pp (inside saver)",
    currency: "NZD",
    startDate: "2026-01-15",
    endDate: "2026-04-15",
    dateText: "Jan – Apr 2026",
    url: "https://www.houseoftravel.co.nz/cruises/family-cruises/royal-caribbean/sailings/caribbean-getaway-crs-cmprci0310",
  },
];

const columns: ProductsColumn[] = [
  { key: "vendor",    header: "Agency" },
  { key: "brand",     header: "Cruise Line" },
  { key: "price",     header: "Price", align: "right", sortable: true },
  { key: "dateRange", header: "Dates", sortable: true },
  { key: "link" }, // icon-only
];

// Config determines which filters appear for THIS page
const filters: FilterConfig<ProductOffer>[] = [
  {
    key: "q",
    label: "Search",
    kind: "search",
    placeholder: "Search agency, line, title…",
    getValue: (r) => [r.vendor, r.brand, r.title].filter(Boolean).join(" "),
  },
  {
    key: "vendor",
    label: "Agency",
    kind: "select",
    getValue: (r) => r.vendor,
  },
  {
    key: "brand",
    label: "Cruise line",
    kind: "select",
    getValue: (r) => r.brand ?? "",
  },
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
    // For dateRange, FilterBar's default expects getValue(row) => {start:..., end:...}
    getValue: (r) => ({ start: r.startDate, end: r.endDate }),
  },
];

export default function Compare() {
  const [state, setState] = React.useState<FilterState>({});
  const filtered = React.useMemo(() => applyFilters(rows, filters, state), [state]);

  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-bold">Compare Cruise Deals</h1>

      <FilterBar<ProductOffer>
        rows={rows}
        filters={filters}
        state={state}
        onChange={setState}
      />

      <ProductsTable rows={filtered} columns={columns} />
    </section>
  );
}
