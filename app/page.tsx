// imports you KEEP
import { Hero } from "@/components/Hero";
import { FeatureCards } from "@/components/FeatureCards";
import { TopDestinationsTable } from "@/components/TopDestinationsTable";
import { TopDealsTable } from "@/components/TopDealsTable";
import WhenToBookCarousel from "@/components/WhenToBookCarousel";
import Link from "next/link";
import dynamic from "next/dynamic";

// dynamic charts...
const DomesticFlightBookingTimingChart = dynamic(
  () => import("@/components/DomesticFlightBookingTimingChart"),
  { ssr: false }
);
const AusPacificFlightBookingTimingChart = dynamic(
  () => import("@/components/AusPacificFlightBookingTimingChart"),
  { ssr: false }
);
const InternationalFlightBookingTimingChart = dynamic(
  () => import("@/components/InternationalFlightBookingTimingChart"),
  { ssr: false }
);

export default function Home() {
  return (
    <div className="space-y-12">
      <Hero />
      <FeatureCards />

      {/* When to Book – sliding gallery */}
      <section className="card p-6">
        <h2 className="text-2xl font-semibold mb-2" style={{ color: "var(--text)" }}>
          Best Time to Book
        </h2>
        <p className="mb-4" style={{ color: "var(--muted)" }}>
          We analysed over 200,000 flights this year to bring you the best times to book to get the best deals
        </p>

        <WhenToBookCarousel
          items={[
            {
              key: "domestic",
              title: "Domestic New Zealand",
              node: <DomesticFlightBookingTimingChart currency="NZD" dark />,
            },
            {
              key: "aus-pacific",
              title: "Australia & Pacific Islands",
              node: <AusPacificFlightBookingTimingChart currency="NZD" dark />,
            },
            {
              key: "international",
              title: "International",
              node: <InternationalFlightBookingTimingChart currency="NZD" dark />,
            },
          ]}
        />
      </section>


      {/* Top Destinations */}
      <section className="card p-6">
        <h2 className="text-2xl font-semibold mb-2">Top Destinations</h2>
        <p style={{ color: "var(--muted)" }} className="mb-4">
          'Tis a season to travel, and we have the top rated destinations to travel to at this time of year.
          This list is updated at the beginning of every month to ensure you are given the best information about your chosen destination
        </p>
        <TopDestinationsTable />
      </section>

      {/* Top Airlines */}
      <section className="card p-6">
        <h2 className="text-2xl font-semibold mb-2">Top Airlines</h2>
        <p style={{ color: "var(--muted)" }} className="mb-4">
          We compare the top Airlines out of Auckland and beyond to bring you everything you need to know
        </p>
        <TopDealsTable />
      </section>
    </div>
  );
}
