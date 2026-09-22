import { TopDealsTable } from "@/components/TopDealsTable";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Top Deals",
  description: "Hand-picked fares and promos with the key caveats. Always check bags, change fees, and travel dates. Find the best travel deals for your New Zealand adventure.",
};

export default function Page() {
  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-bold">Top Deals</h1>
      <p style={{color:"var(--muted)"}}>
        Hand-picked fares and promos with the key caveats. Always check bags, change fees, and travel dates.
      </p>
      <TopDealsTable />
    </section>
  );
}
