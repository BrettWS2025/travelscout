import { Hero } from "@/components/Hero";
import { FeatureCards } from "@/components/FeatureCards";
import ProductsTable, { type ProductsColumn } from "@/components/ComparisonTable";
import type { ProductOffer } from "@/lib/products";
import { TopDestinationsTable } from "@/components/TopDestinationsTable";
import { TopDealsTable } from "@/components/TopDealsTable";

// Popular Comparisons — same 6 base columns + a right-aligned "link" column.
const popularComparisonRows: ProductOffer[] = [
  {
    id: "cmp-Princess",
    vendor: "Princess Cruises",
    url: "#",
    priceText: "$$",   // Cost
    policy: "Classic vibe",      // Vibe Check / Consumer Protections
    title: "Princess Plus/Premier - $$-$$$",       // Lux Level / After Sales Service
    destination: "—", // Onboard Services / Inventory
    brand: "No - additional costs apply",       // Free wifi / Transparency
  },
  {
    id: "cmp-NCL",
    vendor: "Norwegian Cruise Lines", // (typo left as-is per your example)
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
  { key: "vendor",      header: "Cruise Line",        sortable: false },
  { key: "price",       header: "Cost",               sortable: false, align: "left" },
  { key: "title",       header: "Add Ons",            sortable: false },
  { key: "policy",      header: "Vibe Check",         sortable: false },
  { key: "destination", header: "Cabins",             sortable: false },
  { key: "brand",       header: "Free wifi",          sortable: false },
  // Rightmost link column — no visible header, right-aligned, shows the word "link"
  { key: "link", header: "", sortable: false, align: "right", widthClass: "whitespace-nowrap" },
];

export default function Home() {
  return (
    <div className="space-y-12">
      <Hero />
      <FeatureCards />

      {/* Popular Comparisons */}
      <section className="card p-6">
        <h2 className="text-2xl font-semibold mb-2">Cruise Comparisons</h2>
        <p style={{ color: "var(--muted)" }} className="mb-4">
          Cruising season is here and we are bring you the best information to ensure you know what you are getting into before you go to sea!
        </p>
        <ProductsTable
          rows={popularComparisonRows}
          columns={popularComparisonColumns}
          // Show all 7 columns (or omit this prop entirely)
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

      {/* Top Deals */}
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
