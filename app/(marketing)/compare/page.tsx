import ComparisonTable, { type ProductsColumn } from "@/components/ComparisonTable";
import type { ProductOffer } from "@/lib/products";

export const metadata = { title: "Compare" };

type ChannelRow = ProductOffer;

// Three placeholder rows; fill in the text when you’re ready.
const rows: ChannelRow[] = [
  {
    id: "agency",
    vendor: "Travel Agencies",
    url: "#",
    // map to existing keys used by ComparisonTable so we don't need custom cells
    priceText: "—",   // Cost
    policy: "—",      // Consumer Protections
    title: "—",       // After Sales Service
    destination: "—", // Inventory
    brand: "—",       // Transparency
  },
  {
    id: "ota",
    vendor: "OTAs",
    url: "#",
    priceText: "—",
    policy: "—",
    title: "—",
    destination: "—",
    brand: "—",
  },
  {
    id: "direct",
    vendor: "Direct Booking",
    url: "#",
    priceText: "—",
    policy: "—",
    title: "—",
    destination: "—",
    brand: "—",
  },
];

// Same six-column layout as the agencies/OTAs/direct page
const columns: ProductsColumn[] = [
  { key: "vendor",      header: "Comparison",           sortable: false },
  { key: "price",       header: "Cost",                 sortable: false, align: "left" },
  { key: "policy",      header: "Consumer Protections", sortable: false },
  { key: "title",       header: "After Sales Service",  sortable: false },
  { key: "destination", header: "Inventory",            sortable: false },
  { key: "brand",       header: "Transparency",         sortable: false },
];

export default function Page() {
  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-bold" style={{ color: "var(--text)" }}>
        Compare
      </h1>

      {/* Shared table on dark background */}
      <ComparisonTable
        rows={rows}
        columns={columns}
        maxColumns={6}
        emptyText="No comparison rows yet."
        tone="onDark"
      />

      {/* Optional editorial content below the table */}
      <article className="space-y-4" style={{ color: "var(--text)" }}>
        <h2 className="text-2xl font-semibold">How these channels compare</h2>
        <p style={{ color: "var(--muted)" }}>
          Add your commentary here. You might cover how pricing is set (base fare, fees, commissions),
          who is responsible when things go wrong, what after‑sales support looks like, refund/change rules,
          the breadth of inventory each channel shows, and overall price/transparency differences.
        </p>
      </article>
    </section>
  );
}
