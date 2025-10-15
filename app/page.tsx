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
    title: "—",       // Lux Level / After Sales Service
    destination: "—", // Onboard Services / Inventory
    brand: "No - additional costs apply",       // Free wifi / Transparency
  },
  {
    id: "cmp-NCL",
    vendor: "Norwegian Cruise Lines", // (typo left as-is per your example)
    url: "#",
    priceText: "$$",
    policy: "Dining and nightlife vibe",
    title: "—",
    destination: "—",
    brand: "No - additional costs apply",
  },
  {
    id: "cmp-Carnival",
    vendor: "Carnival Cruise Lines",
    url: "https://www.carnival.com/",
    priceText: "$",
    policy: "Budget friendly family fun",
    title: "—",
    destination: "—",
    brand: "No - additional costs apply",
  },
    {
    id: "cmp-RC",
    vendor: "Royal Caribbean",
    url: "#",
    priceText: "$$-$$$",
    policy: "A little more expenny family fun",
    title: "—",
    destination: "—",
    brand: "No - additional costs apply",
  },
    {
    id: "cmp-Disney",
    vendor: "Disney Cruise Line",
    url: "#",
    priceText: "$$$$",
    policy: "Very expenny family fun",
    title: "—",
    destination: "—",
    brand: "No - additional costs apply",
  },
    {
    id: "cmp-MSC",
    vendor: "MSC Cruises",
    url: "#",
    priceText: "$-$$",
    policy: "Euro family vibes",
    title: "—",
    destination: "—",
    brand: "No - additional costs apply",
  },
    {
    id: "cmp-Virgin",
    vendor: "Virgin Voyages",
    url: "#",
    priceText: "$$$",
    policy: "Foodies and wellness retreat vibes",
    title: "—",
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
          These ratings are out of 10 and should provide you with a starting point when searching for what kind of cruise you want.
          All ratings are independent and unbiased. I receive no form of compensation from these suppliers.
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
          Best seasons, ballpark 7-day costs, and why they’re worth the trip.
        </p>
        <TopDestinationsTable />
      </section>

      {/* Top Deals */}
      <section className="card p-6">
        <h2 className="text-2xl font-semibold mb-2">Top Deals</h2>
        <p style={{ color: "var(--muted)" }} className="mb-4">
          Hand-picked fares and promos with the key caveats.
        </p>
        <TopDealsTable />
      </section>
    </div>
  );
}
