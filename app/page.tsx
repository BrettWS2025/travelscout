import { Hero } from "@/components/Hero";
import { FeatureCards } from "@/components/FeatureCards";
import { ComparisonTable } from "@/components/ComparisonTable";

export default function Home() {
  return (
    <div className="space-y-12">
      <Hero />
      <FeatureCards />
      <section className="card p-6">
        <h2 className="text-2xl font-semibold mb-2">Popular Comparisons</h2>
        <p className="text-[var(--muted)] mb-4">Curated, unbiased, always up-to-date.</p>
        <ComparisonTable />
      </section>
    </div>
  );
}
