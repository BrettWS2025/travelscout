import { Hero } from "@/components/Hero";
import { FeatureCards } from "@/components/FeatureCards";
import ProductsTable, { type ProductsColumn } from "@/components/ComparisonTable";
import type { ProductOffer } from "@/lib/products";
import { TopDestinationsTable } from "@/components/TopDestinationsTable";
import { TopDealsTable } from "@/components/TopDealsTable";

// 🔽 Load the client chart safely in an RSC page
import dynamic from "next/dynamic";
import type { PricePoint } from "@/components/DomesticFlightBookingTimingChart";
const DomesticFlightBookingTimingChart = dynamic(
  () => import("@/components/DomesticFlightBookingTimingChart"),
  { ssr: false }
);

// --- Popular Comparisons (Cruises) ---
const popularComparisonRows: ProductOffer[] = [
  {
    id: "cmp-Princess",
    vendor: "Princess Cruises",
    url: "#",
    priceText: "$$",   // Cost
    policy: "Classic vibe",      // Vibe Check / Consumer Protections
    title: "Princess Plus/Premier - $$-$$$",       // Add Ons
    destination: "—",
    brand: "No - additional costs apply",          // Free wifi
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
  { key: "vendor",      header: "Cruise Line",  sortable: false },
  { key: "price",       header: "Cost",         sortable: false, align: "left" },
  { key: "title",       header: "Add Ons",      sortable: false },
  { key: "policy",      header: "Vibe Check",   sortable: false },
  { key: "brand",       header: "Free wifi",    sortable: false },
  { key: "link",        header: "",             sortable: false, align: "right", widthClass: "whitespace-nowrap" },
];

// --- Sample data for the new chart (replace with your real series anytime) ---
const domesticSeries: PricePoint[] = [
  { daysOut: 180, price: 320 }, { daysOut: 170, price: 300 }, { daysOut: 160, price: 285 },
  { daysOut: 150, price: 270 }, { daysOut: 140, price: 260 }, { daysOut: 130, price: 245 },
  { daysOut: 120, price: 230 }, { daysOut: 110, price: 220 }, { daysOut: 100, price: 210 },
  { daysOut:  90, price: 200 }, { daysOut:  80, price: 195 }, { daysOut:  70, price: 190 },
  { daysOut:  60, price: 180 }, { daysOut:  50, price: 175 }, { daysOut:  40, price: 170 },
  { daysOut:  30, price: 165 }, { daysOut:  20, price: 160 }, { daysOut:  10, price: 175 },
];

export default function Home() {
  return (
    <div className="space-y-12">
      <Hero />
      <FeatureCards />

      {/* NEW: Domestic Flight Timing card (between FeatureCards and Cruise Comparisons) */}
      <section className="card p-6">
        <h2 className="text-2xl font-semibold mb-2" style={{ color: "var(--text)" }}>
          When to Book (Domestic)
        </h2>
        <p className="mb-4" style={{ color: "var(--muted)" }}>
          Smoothed daily prices with the best booking window highlighted.
        </p>
        <DomesticFlightBookingTimingChart data={domesticSeries} currency="NZD" dark />
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

      {/* Top Airlines (keeps your table component for now) */}
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
