import CruiseComparisonsTable from "@/components/CruiseComparisonsTable";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cruise Comparisons",
  description:
    "Compare cruise lines by cost, add-ons, vibe, and more. Find the perfect cruise for your New Zealand adventure.",
};

export default function CruiseComparePage() {
  return (
    <div className="space-y-6">
      <section className="card p-6">
        <h1 className="text-3xl font-semibold mb-2">Cruise Comparisons</h1>
        <p className="mb-4" style={{ color: "var(--muted)" }}>
          Cruising season is here—compare lines and inclusions so you know what you’re getting before you set sail.
        </p>
        <CruiseComparisonsTable />
      </section>
    </div>
  );
}
