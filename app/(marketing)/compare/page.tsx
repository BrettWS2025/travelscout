import type { ProductOffer } from "@/lib/products";
import CompareClient from "./CompareClient";

export const metadata = { title: "Compare" };

// You can fetch real data here on the server;
// for now, sample rows are fine.
const rows: ProductOffer[] = [
  {
    id: "cruise-001",
    vendor: "TravelScout",
    brand: "Princess Cruises",
    priceMin: 1299,
    priceText: "NZ$1,299 pp (inside)",
    currency: "NZD",
    startDate: "2025-11-01",
    endDate: "2026-02-28",
    dateText: "Nov 2025 – Feb 2026",
    url: "/deals/cruise-deals#cruise-001",
  },
  {
    id: "cruise-002",
    vendor: "OceanDeals",
    brand: "Royal Caribbean",
    priceMin: 1499,
    priceText: "from NZ$1,499 pp",
    currency: "NZD",
    startDate: "2025-12-10",
    endDate: "2026-03-20",
    dateText: "Dec 2025 – Mar 2026",
    url: "/deals/cruise-deals#cruise-002",
  },
  {
    id: "cruise-003",
    vendor: "House of Travel",
    brand: "Royal Caribbean – Caribbean Getaway",
    priceMin: 1599,
    priceText: "from NZ$1,599 pp",
    currency: "NZD",
    startDate: "2026-01-15",
    endDate: "2026-04-15",
    dateText: "Jan – Apr 2026",
    url: "https://www.houseoftravel.co.nz/cruises/family-cruises/royal-caribbean/sailings/caribbean-getaway-crs-cmprci0310",
  },
];

export default function Page() {
  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-bold">Compare Cruise Deals</h1>
      <CompareClient rows={rows} />
    </section>
  );
}
