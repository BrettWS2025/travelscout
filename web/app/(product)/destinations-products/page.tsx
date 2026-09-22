import { TopDestinationsTable } from "@/components/TopDestinationsTable";
export const metadata = { title: "Top Destinations" };

export default function Page() {
  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-bold">Top Destinations</h1>
      <p style={{color:"var(--muted)"}}>
        Our shortlist of crowd-pleasers with best seasons, rough 7-day costs, and quick reasons to go.
      </p>
      <TopDestinationsTable />
    </section>
  );
}
