import ComparisonTable, { type ProductsColumn } from "@/components/ComparisonTable";
import type { ProductOffer } from "@/lib/products";

export const metadata = {
  title: "Travel Agencies, OTAs and Direct — Compare",
  description: "High-level comparison of travel agencies, online travel agencies (OTAs), and booking direct.",
};

type ChannelRow = ProductOffer & {
  cost?: string;
  protections?: string;
  afterSales?: string;
  inventory?: string;
  transparency?: string;
};

const rows: ChannelRow[] = [
  {
    id: "agency",
    vendor: "Travel Agencies",
    cost: "—",
    protections: "—",
    afterSales: "—",
    inventory: "—",
    transparency: "—",
  },
  {
    id: "ota",
    vendor: "OTAs",
    cost: "—",
    protections: "—",
    afterSales: "—",
    inventory: "—",
    transparency: "—",
  },
  {
    id: "direct",
    vendor: "Direct Booking",
    cost: "—",
    protections: "—",
    afterSales: "—",
    inventory: "—",
    transparency: "—",
  },
];

// Use ComparisonTable’s column model; we provide custom cells to show our fields.
// Keys are from the component’s union and are fine even if not used for sorting.
const columns: ProductsColumn[] = [
  { key: "vendor", header: "Comparison", sortable: false },
  { key: "price", header: "Cost", sortable: false, cell: (row) => (row as ChannelRow).cost ?? "—" },
  { key: "policy", header: "Consumer Protections", sortable: false, cell: (row) => (row as ChannelRow).protections ?? "—" },
  { key: "policy", header: "After Sales Service", sortable: false, cell: (row) => (row as ChannelRow).afterSales ?? "—" },
  { key: "policy", header: "Inventory", sortable: false, cell: (row) => (row as ChannelRow).inventory ?? "—" },
  { key: "policy", header: "Transparency", sortable: false, cell: (row) => (row as ChannelRow).transparency ?? "—" },
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

      {/* Comparison table using the shared component, on a dark background */}
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
          who is responsible when things go wrong, after‑sales support, refund/change rules, how much
          inventory each channel shows, and price/transparency differences.
        </p>
      </article>
    </section>
  );
}
