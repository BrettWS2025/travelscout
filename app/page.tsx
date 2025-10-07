import { Hero } from "@/components/Hero";
import { FeatureCards } from "@/components/FeatureCards";
import ProductsTable from "@/components/ComparisonTable";
import { TopDestinationsTable } from "@/components/TopDestinationsTable";
import { TopDealsTable } from "@/components/TopDealsTable";

export default function Home() {
  return (
    <div className="space-y-12">
      <Hero />
      <FeatureCards />

      {/* Existing: Popular Comparisons */}
      <section className="card p-6">
        <h2 className="text-2xl font-semibold mb-2">Popular Comparisons</h2>
        <p style={{color:"var(--muted)"}} className="mb-4">
          Curated, unbiased, always up-to-date.
        </p>
        <ComparisonTable />
      </section>

      {/* New: Top Destinations (shows further down the page) */}
      <section className="card p-6">
        <h2 className="text-2xl font-semibold mb-2">Top Destinations</h2>
        <p style={{color:"var(--muted)"}} className="mb-4">
          Best seasons, ballpark 7-day costs, and why they’re worth the trip.
        </p>
        <TopDestinationsTable />
      </section>

      {/* New: Top Deals */}
      <section className="card p-6">
        <h2 className="text-2xl font-semibold mb-2">Top Deals</h2>
        <p style={{color:"var(--muted)"}} className="mb-4">
          Hand-picked fares and promos with the key caveats.
        </p>
        <TopDealsTable />
      </section>
    </div>
  );
}
