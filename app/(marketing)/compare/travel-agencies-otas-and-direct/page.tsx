import ComparisonTable, { type ProductsColumn } from "@/components/ComparisonTable";
import type { ProductOffer } from "@/lib/products";

export const metadata = {
  title: "Travel Agencies, OTAs and Direct — Compare",
  description:
    "High-level comparison of travel agencies, online travel agencies (OTAs), and booking direct.",
};

type ChannelRow = ProductOffer;

// Minimal placeholder rows (fill these in as you go)
const rows: ChannelRow[] = [
  {
    id: "agency",
    vendor: "Travel Agencies",
    url: "#",
    // map to existing keys used by ComparisonTable (no custom cells needed)
    priceText: "—",         // Cost
    policy: "—",            // Consumer Protections
    title: "—",             // After Sales Service
    destination: "—",       // Inventory
    brand: "—",             // Transparency
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
          A top-level look at the differences between agency, OTA, and direct booking channels.
        </p>
      </header>

      {/* Shared table on dark background */}
      <ComparisonTable
        rows={rows}
        columns={columns}
        maxColumns={6}
        emptyText="No comparison rows yet."
        tone="onDark"
      />

      {/* ---- Article content ---- */}
      <article className="space-y-6" style={{ color: "var(--text)" }}>
        {/* Meta */}
        <div className="text-xs" style={{ color: "var(--muted)" }}>
          Created <time dateTime="2025-10-16">16 Oct 2025</time> · Updated{" "}
          <time dateTime="2025-10-16">16 Oct 2025</time>
        </div>

        <h2 className="text-2xl font-semibold">
          Travel Agents vs Online Travel Agents vs Direct Bookings
        </h2>
        <p style={{ color: "var(--muted)" }}>
          This guide seeks to give you as much information as possible before proceeding with your travel plans.
        </p>

        {/* What’s the difference */}
        <section className="space-y-4">
          <h3 className="text-xl font-semibold">What’s the difference?</h3>

          <div className="space-y-2">
            <h4 className="font-semibold">Travel Agency</h4>
            <p style={{ color: "var(--muted)" }}>
              A travel agency or travel agent can go by many names—Travel Adviser, Consultant, Broker, Agent, or Expert.
              A typical travel agent is a travel specialist with broad access to most travel options you can think of.
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="font-semibold">Online Travel Agency (OTA)</h4>
            <p style={{ color: "var(--muted)" }}>
              An OTA is an online service that lets you browse live inventory across flights, hotels, cars, cruises,
              attractions, and more. Examples include Booking.com and Expedia.
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="font-semibold">Direct</h4>
            <p style={{ color: "var(--muted)" }}>
              Direct booking is when you book with the supplier—e.g., the Air New Zealand website or a hotel’s own site.
            </p>
          </div>
        </section>

        {/* How do they compare */}
        <section className="space-y-4">
          <h3 className="text-xl font-semibold">How do they compare?</h3>

          {/* Travel Agencies */}
          <div className="space-y-2">
            <h4 className="font-semibold">Travel Agencies</h4>
            <div className="grid gap-2 md:grid-cols-2">
              <div>
                <p className="font-semibold">Pros</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Offloads research and booking responsibility</li>
                  <li>Vast range of products</li>
                  <li>Tailored itineraries to your preferences and budget</li>
                  <li>Finance options may be available</li>
                  <li>Ongoing after-sales care (changes/cancellations/disruptions)</li>
                  <li>Pre-designed packages are typically good value</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold">Cons</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Can take time with back-and-forth</li>
                  <li>Pricing can be less transparent (often packaged)</li>
                  <li>Talking to someone may feel anxiety-inducing for some</li>
                  <li>Sales tactics can be high pressure</li>
                  <li>Booking fees may be charged up front (adds to overall cost)</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Online Travel Agencies */}
          <div className="space-y-2">
            <h4 className="font-semibold">Online Travel Agencies</h4>
            <div className="grid gap-2 md:grid-cols-2">
              <div>
                <p className="font-semibold">Pros</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Vast inventory (including apartments and holiday homes)</li>
                  <li>Highly competitive prices</li>
                  <li>Flight + Hotel/Car packages can be great value</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold">Cons</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Limited access to some airline product types (e.g., Air NZ’s Seat-only/Seat+Bag)</li>
                  <li>After-sales service is limited (or absent)</li>
                  <li>Rules often stricter for changes or refunds</li>
                  <li>Some OTAs can be sketchy—buyer beware</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Direct Booking */}
          <div className="space-y-2">
            <h4 className="font-semibold">Direct Booking</h4>
            <div className="grid gap-2 md:grid-cols-2">
              <div>
                <p className="font-semibold">Pros</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Loyalty points, status upgrades, and perks</li>
                  <li>Rules are clear and obvious</li>
                  <li>Fastest refunds</li>
                  <li>Exclusive promos, deals, and inclusions</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold">Cons</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Price comparisons require checking many individual sites</li>
                  <li>Fewer bundles and packages</li>
                  <li>Some suppliers don’t cater to NZ time zones; support can be hard to reach</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Metasearch */}
        <section className="space-y-2">
          <h3 className="text-xl font-semibold">What about Google Flights or Skyscanner?</h3>
          <p style={{ color: "var(--muted)" }}>
            These are <strong>metasearch</strong> tools: they aggregate pricing and availability from across the internet
            to show options, then redirect you elsewhere to complete the booking. They’re super handy, but be <em>wary</em>—
            they can sometimes point you to less-trustworthy sellers. They also don’t account for airlines with multiple
            product types (e.g., baggage-inclusive fares vs. seat-only), so the “lowest price” shown may be misleading
            if you need baggage that’s already included with a different airline.
          </p>
        </section>
      </article>
      {/* ---- /Article content ---- */}
    </section>
  );
}
