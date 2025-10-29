import { Hero } from "@/components/Hero";
import { FeatureCards } from "@/components/FeatureCards";
import ProductsTable, { type ProductsColumn } from "@/components/ComparisonTable";
import type { ProductOffer } from "@/lib/products";
import { TopDestinationsTable } from "@/components/TopDestinationsTable";
import { TopDealsTable } from "@/components/TopDealsTable";


import WhenToBookCarousel from "@/components/WhenToBookCarousel";

// Client-only charts (Recharts)
import dynamic from "next/dynamic";
const DomesticFlightBookingTimingChart = dynamic(
  () => import("@/components/DomesticFlightBookingTimingChart"),
  { ssr: false }
);
const AusPacificFlightBookingTimingChart = dynamic(
  () => import("@/components/AusPacificFlightBookingTimingChart"),
  { ssr: false }
);

// --- Popular Comparisons (Cruises) ---
const popularComparisonRows: ProductOffer[] = [
  {
    id: "cmp-Princess",
    vendor: "Princess Cruises",
    url: "#",
    priceText: "$$",
    policy: "Classic vibe",
    title: "Princess Plus/Premier - $$-$$$",
    destination: "—",
    brand: "No - additional costs apply",
  },
  {
    id: "cmp-NCL",
    vendor: "Norwegian Cruise Lines",
    url: "#",
    priceText: "$$",
    policy: "Dining and nightlife vibe",
    title: "More At Sea - $$",
    destination: "—",
    brand: "No - additional costs apply",
  },
  {
    id: "cmp-Carnival",
    vendor: "Carnival Cruise Lines",
    url: "https://www.carnival.com/",
    priceText: "$",
    policy: "Budget friendly family fun",
    title: "CHEERS! - $-$$",
    destination: "—",
    brand: "No - additional costs apply",
  },
  {
    id: "cmp-RC",
    vendor: "Royal Caribbean",
    url: "#",
    priceText: "$$-$$$",
    policy: "A little more expenny family fun",
    title: "Beverage/Voom/The Key - $-$$",
    destination: "—",
    brand: "No - additional costs apply",
  },
  {
    id: "cmp-Disney",
    vendor: "Disney Cruise Line",
    url: "#",
    priceText: "$$$$",
    policy: "Very expenny family fun",
    title: "Various Upgrades - $$",
    destination: "—",
    brand: "No - additional costs apply",
  },
  {
    id: "cmp-MSC",
    vendor: "MSC Cruises",
    url: "#",
    priceText: "$-$$",
    policy: "Euro family vibes",
    title: "Drinks/Wifi Promos/MSC Yacht Club - $-$$$",
    destination: "—",
    brand: "No - additional costs apply",
  },
  {
    id: "cmp-Virgin",
    vendor: "Virgin Voyages",
    url: "#",
    priceText: "$$$",
    policy: "Foodies and wellness retreat vibes",
    title: "Premium Wifi upgrade - $",
    destination: "—",
    brand: "Yes",
  },
];

const popularComparisonColumns: ProductsColumn[] = [
  { key: "vendor", header: "Cruise Line", sortable: false },
  { key: "price", header: "Cost", sortable: false, align: "left" },
  { key: "title", header: "Add Ons", sortable: false },
  { key: "policy", header: "Vibe Check", sortable: false },
  { key: "brand", header: "Free wifi", sortable: false },
  { key: "link", header: "", sortable: false, align: "right", widthClass: "whitespace-nowrap" },
];

export default function Home() {
  return (
    <div className="space-y-12">
      <Hero />
      <FeatureCards />

      {/* When to Book – sliding gallery */}
      <section className="card p-6">
        <h2 className="text-2xl font-semibold mb-2" style={{ color: "var(--text)" }}>
          When to Book
        </h2>
        <p className="mb-4" style={{ color: "var(--muted)" }}>
          We smooth historic prices and highlight the cheapest booking window.
        </p>

        <WhenToBookCarousel
          items={[
            {
              key: "domestic",
              title: "Domestic (NZ)",
              node: <DomesticFlightBookingTimingChart currency="NZD" dark />,
            },
            {
              key: "aus-pacific",
              title: "Australia & Pacific",
              node: <AusPacificFlightBookingTimingChart currency="NZD" dark />,
            },
          ]}
        />
      </section>

      {/* Cruise Comparisons */}
      <section className="card p-6">
        <h2 className="text-2xl font-semibold mb-2">Cruise Comparisons</h2>
        <p style={{ color: "var(--muted)" }} className="mb-4">
          Cruising season is here and we are bringing you the best information to ensure you know what you are getting into before you set sail!
        </p>
        <ProductsTable
          rows={popularComparisonRows}
          columns={popularComparisonColumns}
          maxColumns={7}
          emptyText="No comparison rows yet."
          tone="onDark"
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
