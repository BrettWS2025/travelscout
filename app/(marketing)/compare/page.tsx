import { FilterBar } from "@/components/FilterBar";
import ProductsTable, { type ProductsColumn } from "@/components/ComparisonTable";
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
    url: "https://www.houseoftravel.co.nz/cruises",
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
    url: "/deals/cruise-deals#cruise-003",
  },
];


const columns: ProductsColumn[] = [
  { key: "vendor",    header: "Agency" },
  { key: "brand",     header: "Cruise Line" },
  { key: "price",     header: "Price", align: "right", sortable: true },
  { key: "dateRange", header: "Dates", sortable: true },
  { key: "link" }, // no visible header
];

export default function Compare() {
  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-bold">Compare Cruises</h1>
      <FilterBar />
      <ProductsTable rows={rows} columns={columns} />
    </section>
  );
}
