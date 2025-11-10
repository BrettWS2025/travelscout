import { Hero } from "@/components/Hero";
import { FeatureCards } from "@/components/FeatureCards";
import WhenToBookCarousel from "@/components/WhenToBookCarousel";

import dynamic from "next/dynamic";

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
    </div>
  );
}
