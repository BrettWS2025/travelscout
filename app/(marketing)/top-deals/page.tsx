import { TopDealsTable } from "@/components/TopDealsTable";
export const metadata = { title: "Top Deals" };

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
