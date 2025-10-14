import ComparisonTable, { type ProductsColumn } from "@/components/ComparisonTable";
import type { ProductOffer } from "@/lib/products";

export const metadata = {
  title: "Travel Agencies, OTAs and Direct — Compare",
  description:
    "High-level comparison of travel agencies, online travel agencies (OTAs), and booking direct.",
};

type ChannelRow = ProductOffer & {
  cost?: string;
  protections?: string;
  afterSales?: string;
  inventory?: string;
  transparency?: string;
};

// Note: ProductOffer requires `id`, `vendor`, and `url`
const rows: ChannelRow[] = [
  {
    id: "agency",
    vendor: "Travel Agencies",
    url: "#",
    cost: "—",
    protections: "—",
    afterSales: "—",
    inventory: "—",
    transparency: "—",
  },
  {
    id: "ota",
    vendor: "OTAs",
    url: "#",
    cost: "—",
    protections: "—",
    afterSales: "—",
    inventory: "—",
    transparency: "—",
  },
  {
    id: "direct",
    vendor: "Direct Booking",
    url: "#",
    cost: "—",
    protections: "—",
    afterSales: "—",
    inventory: "—",
    transparency: "—",
  },
];

// IMPORTANT: give each column a UNIQUE ColumnKey to avoid duplicate React keys
const columns: ProductsColumn[] = [
  { key: "vendor",      header: "Comparison",           sortable: false },
  { key: "price",       header: "Cost",                 sortable: false, cell: r => (r as ChannelRow).cost ?? "—" },
  { key: "policy",      header: "Consumer Protections", sortable: false, cell: r => (r as ChannelRow).protections ?? "—" },
  { key: "rating",      header: "After Sales Service",  sortable: false, cell: r => (r as ChannelRow).afterSales ?? "—" },
  { key: "destination", header: "Inventory",            sortable: false, cell: r => (r as ChannelRow).inventory ?? "—" },
  { key: "title",       header: "Transparency",         sortable: false, cell: r => (r as ChannelRow).transparency ?? "—" },
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

      {/* Table on dark background using the shared component */}
      <div className="onDarkTable">
        <ComparisonTable rows={rows} columns={columns} maxColumns={6} emptyText="No comparison rows yet." />
      </div>

      {/* Editorial content below the table */}
      <article className="space-y-4" style={{ color: "var(--text)" }}>
        <h2 className="text-2xl font-semibold">How these channels compare</h2>
        <p style={{ color: "var(--muted)" }}>
          Add your commentary here. You might cover how pricing is set (base fare, fees, commissions),
          who is responsible when things go wrong, what after‑sales support looks like, refund/change rules,
          the breadth of inventory exposed by each channel, and overall price/transparency differences.
        </p>
      </article>

      {/* Page-scoped overrides to enforce white fonts via your theme vars, without touching the table component */}
      <style jsx>{`
        .onDarkTable :global(thead) { background: transparent; }
        .onDarkTable :global(thead tr),
        .onDarkTable :global(th),
        .onDarkTable :global(td) { color: var(--text); }
        .onDarkTable :global(.text-gray-600) { color: var(--text); }
        .onDarkTable :global(.text-gray-500) { color: var(--muted); }
      `}</style>
    </section>
  );
}
