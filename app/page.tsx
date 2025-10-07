import { Hero } from "@/components/Hero";
import { FeatureCards } from "@/components/FeatureCards";
import ProductsTable, { type ProductsColumn } from "@/components/ComparisonTable";
import type { ProductOffer } from "@/lib/products";
import { TopDestinationsTable } from "@/components/TopDestinationsTable";
import { TopDealsTable } from "@/components/TopDealsTable";

// Minimal placeholder data for the "Popular Comparisons" table.
// You can leave this empty and it will show the built-in empty state.
const popularComparisonRows: ProductOffer[] = [
  // Example rows (delete or replace):
  // {
  //   id: "cmp-001",
  //   vendor: "TravelScout",
  //   brand: "Air NZ vs Qantas",
  //   title: "AKL → SYD (Economy)",
  //   priceMin: 329,
  //   currency: "NZD",
  //   dateText: "Oct–Dec 2025",
  //   url: "/compare/flights#akl-syd-economy",
  // },
];

const popularComparisonColumns: ProductsColumn[] = [
  { key: "title",     header: "Comparison", sortable: true },
  { key: "brand",     header: "Variant" },
  { key: "vendor",    header: "Source" },
  { key: "price",     header: "From", sortable: true, align: "right" },
  { key: "dateRange", header: "Dates", sortable: true },
  { key: "link" }, // no visible header (icon-only link)
];

export default function Home() {
  return (
    <div className="space-y-12">
      <Hero />
      <FeatureCards />

      {/* Existing: Popular Comparisons */}
      <section className="card p-6">
        <h2 className="text-2xl font-semibold mb-2">Popular Comparisons</h2>
        <p style={{ color: "var(--muted)" }} className="mb-4">
          Curated, unbiased, always up-to-date.
        </p>
        <ProductsTable
          rows={popularComparisonRows}
          columns={popularComparisonColumns}
        />
      </section>

      {/* New: Top Destinations (shows further down the page) */}
      <section className="card p-6">
        <h2 className="text-2xl font-semibold mb-2">Top Destinations</h2>
        <p style={{ color: "var(--muted)" }} className="mb-4">
          Best seasons, ballpark 7-day costs, and why they’re worth the trip.
        </p>
        <TopDestinationsTable />
      </section>

      {/* New: Top Deals */}
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
