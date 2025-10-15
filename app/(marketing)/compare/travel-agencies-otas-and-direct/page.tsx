import ComparisonTable, { type ProductsColumn } from "@/components/ComparisonTable";
import type { ProductOffer } from "@/lib/products";

export const metadata = {
  title: "Travel Agencies, OTAs and Direct — Compare",
  description:
    "High-level comparison of travel agencies, online travel agencies (OTAs), and booking direct.",
};

type ChannelRow = ProductOffer & {
  // convenience fields we’ll map onto existing ProductOffer keys
  cost?: string;
  protections?: string;
  afterSales?: string;
  inventoryText?: string;
  transparencyText?: string;
};

// NOTE: ProductOffer requires id, vendor, and url. We map our textual values
// to existing keys used by ComparisonTable’s default cells so we don’t pass
// any custom cell functions from a Server Component to a Client Component.
const rows: ChannelRow[] = [
  {
    id: "agency",
    vendor: "Travel Agencies",
    url: "#",
    // Map our fields to existing display keys
    priceText: "—",                 // shows under the "Cost" (price) column
    policy: "—",                    // shows under "Consumer Protections"
    title: "—",                     // shows under "After Sales Service"
    destination: "—",               // shows under "Inventory"
    brand: "—",                     // shows under "Transparency"
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

// Columns use built-in keys so we avoid custom render functions (safe for RSC).
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
    <section className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold" style={{ color: "var(--text)" }}>
          Travel Agencies, OTAs and Direct
        </h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          A top‑level look at the differences between agency, OTA, and direct booking channels.
        </p>
      </header>

      {/* Shared table on dark background: now uses the new `tone` prop */}
      <ComparisonTable
        rows={rows}
        columns={columns}
        maxColumns={6}
        emptyText="No comparison rows yet."
        tone="onDark"
      />

      {/* Editorial section below the table */}
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
