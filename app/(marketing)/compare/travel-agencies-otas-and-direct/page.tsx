export const metadata = {
  title: "Travel Agencies, OTAs and Direct — Compare",
  description:
    "High-level comparison of travel agencies, online travel agencies (OTAs), and booking direct.",
};

type ChannelRow = {
  name: string;
  cost: string;
  protections: string;
  afterSales: string;
  inventory: string;
  transparency: string;
};

const rows: ChannelRow[] = [
  {
    name: "Travel Agencies",
    cost: "—",
    protections: "—",
    afterSales: "—",
    inventory: "—",
    transparency: "—",
  },
  {
    name: "OTAs",
    cost: "—",
    protections: "—",
    afterSales: "—",
    inventory: "—",
    transparency: "—",
  },
  {
    name: "Direct Booking",
    cost: "—",
    protections: "—",
    afterSales: "—",
    inventory: "—",
    transparency: "—",
  },
];

export default function Page() {
  return (
    <section className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold">Travel Agencies, OTAs and Direct</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          A top‑level look at the differences between agency, OTA, and direct booking channels.
        </p>
      </header>

      {/* Comparison table */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-left border-separate border-spacing-y-2">
          <thead>
            <tr className="text-sm" style={{ color: "var(--muted)" }}>
              <th className="px-4 py-2">Comparison</th>
              <th className="px-4 py-2">Cost</th>
              <th className="px-4 py-2">Consumer Protections</th>
              <th className="px-4 py-2">After Sales Service</th>
              <th className="px-4 py-2">Inventory</th>
              <th className="px-4 py-2">Transparency</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="bg-white rounded-xl shadow">
                <th scope="row" className="px-4 py-3 font-medium">
                  {r.name}
                </th>
                <td className="px-4 py-3">{r.cost}</td>
                <td className="px-4 py-3">{r.protections}</td>
                <td className="px-4 py-3">{r.afterSales}</td>
                <td className="px-4 py-3">{r.inventory}</td>
                <td className="px-4 py-3">{r.transparency}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Editorial section below the table */}
      <article className="space-y-4">
        <h2 className="text-2xl font-semibold">How these channels compare</h2>
        <p className="text-slate-600">
          Add your commentary here. You might cover how pricing is set (base fare, fees, commissions),
          which party holds responsibility when things go wrong, what after‑sales support looks like,
          refund/change rules, how much inventory each channel shows, and fee/price transparency.
        </p>
        <p className="text-slate-600">
          Suggested outline: <strong>Cost</strong>, <strong>Consumer protections</strong>,{" "}
          <strong>After‑sales service</strong>, <strong>Inventory</strong>, and{" "}
          <strong>Transparency</strong>.
        </p>
      </article>
    </section>
  );
}
