import { Hero } from "@/components/Hero";
import { FeatureCards } from "@/components/FeatureCards";
import ProductsTable, { type ProductsColumn } from "@/components/ComparisonTable";
import type { ProductOffer } from "@/lib/products";
import { TopDestinationsTable } from "@/components/TopDestinationsTable";
import { TopDealsTable } from "@/components/TopDealsTable";

// Popular Comparisons — same 6-column layout as the Agencies/OTAs/Direct table.
// Placeholder rows included so the table renders immediately (edit when ready).
const popularComparisonRows: ProductOffer[] = [
  {
    id: "cmp-Princess",
    vendor: "Princess Cruises",
    url: "#",
    priceText: "—",   // Cost
    policy: "—",      // Consumer Protections
    title: "—",       // After Sales Service
    destination: "—", // Inventory
    brand: "—",       // Transparency
  },
  {
    id: "cmp-NCL",
    vendor: "Nowegion Cruise Lines",
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

// Six columns matching the travel agencies/OTAs/direct page.
// We map to existing keys so no custom cell renderers are needed (keeps this page as an RSC).
const popularComparisonColumns: ProductsColumn[] = [
  { key: "vendor",      header: "Cruise Line",          sortable: false },
  { key: "price",       header: "Cost",                 sortable: false, align: "left" },
  { key: "policy",      header: "Vibe Check",           sortable: false },
  { key: "title",       header: "Lux Level",            sortable: false },
  { key: "destination", header: "Onboard Services",     sortable: false },
  { key: "brand",       header: "Free wifi",            sortable: false },
];

export default function Home() {
  return (
    <div className="space-y-12">
      <Hero />
      <FeatureCards />

      {/* Popular Comparisons — now matches the 6-column layout and uses tone="onDark" */}
      <section className="card p-6">
        <h2 className="text-2xl font-semibold mb-2">Popular Comparisons</h2>
        <p style={{ color: "var(--muted)" }} className="mb-4">
          Curated, unbiased, always up-to-date.
        </p>
        <ProductsTable
          rows={popularComparisonRows}
          columns={popularComparisonColumns}
          maxColumns={6}
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
