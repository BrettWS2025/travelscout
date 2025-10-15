import { Hero } from "@/components/Hero";
import { FeatureCards } from "@/components/FeatureCards";
import ProductsTable, { type ProductsColumn } from "@/components/ComparisonTable";
import type { ProductOffer } from "@/lib/products";
import { TopDestinationsTable } from "@/components/TopDestinationsTable";
import { TopDealsTable } from "@/components/TopDealsTable";

// Popular Comparisons — same 6 base columns + a right-aligned "link" column.
const popularComparisonRows: ProductOffer[] = [
  {
    id: "cmp-Princess",
    vendor: "Princess Cruises",
    url: "#",
    priceText: "—",   // Cost
    policy: "—",      // Vibe Check / Consumer Protections
    title: "—",       // Lux Level / After Sales Service
    destination: "—", // Onboard Services / Inventory
    brand: "—",       // Free wifi / Transparency
  },
  {
    id: "cmp-NCL",
    vendor: "Nowegion Cruise Lines", // (typo left as-is per your example)
    url: "#",
    priceText: "—",
    policy: "—",
    title: "—",
    destination: "—",
    brand: "—",
  },
  {
    id: "cmp-Carnival",
    vendor: "Carnival Cruise Lines",
    url: "https://www.carnival.com/",
    priceText: "—",
    policy: "—",
    title: "—",
    destination: "—",
    brand: "—",
  },
];

const popularComparisonColumns: ProductsColumn[] = [
  { key: "vendor",      header: "Cruise Line",      sortable: false },
  { key: "price",       header: "Cost",             sortable: false, align: "left" },
  { key: "policy",      header: "Vibe Check",       sortable: false },
  { key: "title",       header: "Lux Level",        sortable: false },
  { key: "destination", header: "Onboard Services", sortable: false },
  { key: "brand",       header: "Free wifi",        sortable: false },
  // Rightmost link column — no visible header, right-aligned, shows the word "link"
  { 
    key: "link",
    header: "",
    sortable: false,
    align: "right",
    linkLabel: "Link",
    linkLabelClassName: "font-bold", // ← bold text like headers
    widthClass: "whitespace-nowrap"
  },
];

export default function Home() {
  return (
    <div className="space-y-12">
      <Hero />
      <FeatureCards />

      {/* Popular Comparisons */}
      <section className="card p-6">
        <h2 className="text-2xl font-semibold mb-2">Popular Comparisons</h2>
        <p style={{ color: "var(--muted)" }} className="mb-4">
          Curated, unbiased, always up-to-date.
        </p>
        <ProductsTable
          rows={popularComparisonRows}
          columns={popularComparisonColumns}
          // Show all 7 columns (or omit this prop entirely)
          maxColumns={7}
          emptyText="No comparison rows yet."
          tone="onDark"
        />
      </section>

      {/* Top Destinations */}
      <section className="card p-6">
        <h2 className="text-2xl font-semibold mb-2">Top Destinations</h2>
        <p style={{ color: "var(--muted)" }} className="mb-4">
          Best seasons, ballpark 7-day costs, and why they’re worth the trip.
        </p>
        <TopDestinationsTable />
      </section>

      {/* Top Deals */}
      <section className="card p-6">
        <h2 className="text-2xl font-semibold mb-2">Top Deals</h2>
        <p style={{ color: "var(--muted)" }} className="mb-4">
          Hand-picked fares and promos with the key caveats.
        </p>
        <TopDealsTable />
      </section>
    </div>
  );
}
