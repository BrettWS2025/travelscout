// File: components/AllTravelDeals.tsx
"use client";
import React from "react";
import Link from "next/link";

export type Deal = {
  id: string;
  title: string;
  subtitle?: string;
  price: string; // e.g. "$1,299 pp"
  priceLabel?: string; // e.g. "from"
  imageUrl: string;
  ctaUrl: string;
  tag?: "Flights" | "Cruise" | "Package" | string;
  location?: string;
  validUntil?: string; // e.g. "Book by 31 Dec"
};

const defaultDeals: Deal[] = [
  {
    id: "deal-fiji-flights",
    title: "Auckland → Fiji Return",
    subtitle: "Checked bag + seat select",
    price: "$699",
    priceLabel: "from",
    imageUrl:
      "https://images.unsplash.com/photo-1579264670959-286d7b06f1ae?q=80&w=1470&auto=format&fit=crop",
    ctaUrl: "/deals/fiji-flights",
    tag: "Flights",
    location: "Nadi, Fiji",
    validUntil: "Book by 30 Nov",
  },
  {
    id: "deal-sydney-weekender",
    title: "Sydney Weekender 3N",
    subtitle: "4★ stay near Darling Harbour",
    price: "$899",
    priceLabel: "pp",
    imageUrl:
      "https://images.unsplash.com/photo-1549180030-48bf079fb38a?w=1512&auto=format&fit=crop",
    ctaUrl: "/deals/sydney-weekender",
    tag: "Package",
    location: "Sydney, Australia",
    validUntil: "Limited seats",
  },
  {
    id: "deal-south-pacific-cruise",
    title: "South Pacific Cruise 7N",
    subtitle: "All meals + onboard credit",
    price: "$1,499",
    priceLabel: "pp",
    imageUrl:
      "https://images.unsplash.com/photo-1617170788899-ef9587d6e63f?w=600&auto=format&fit=crop",
    ctaUrl: "/deals/south-pacific-cruise",
    tag: "Cruise",
    location: "Roundtrip Auckland",
    validUntil: "Sails Feb–Mar",
  },
  {
    id: "deal-queenstown-escape",
    title: "Queenstown Escape 4N",
    subtitle: "Boutique lodge + car hire",
    price: "$1,059",
    priceLabel: "pp",
    imageUrl:
      "https://images.unsplash.com/photo-1600585154084-4e5fe7c39151?q=80&w=1470&auto=format&fit=crop",
    ctaUrl: "/deals/queenstown-escape",
    tag: "Package",
    location: "Queenstown, NZ",
    validUntil: "Ends Sunday",
  },
  {
    id: "deal-tokyo-fare",
    title: "Auckland → Tokyo Return",
    subtitle: "Great times via Singapore",
    price: "$1,399",
    priceLabel: "from",
    imageUrl:
      "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?q=80&w=1470&auto=format&fit=crop",
    ctaUrl: "/deals/tokyo-flights",
    tag: "Flights",
    location: "Tokyo, Japan",
    validUntil: "Book by 10 Dec",
  },
  {
    id: "deal-rarotonga-family",
    title: "Rarotonga Family 5N",
    subtitle: "Kids stay & eat free",
    price: "$2,199",
    priceLabel: "family",
    imageUrl:
      "https://images.unsplash.com/photo-1546483875-ad9014c88eba?q=80&w=1470&auto=format&fit=crop",
    ctaUrl: "/deals/rarotonga-family",
    tag: "Package",
    location: "Rarotonga, Cooks",
    validUntil: "Free changes",
  },
  {
    id: "deal-europe-cruise",
    title: "Mediterranean Cruise 10N",
    subtitle: "Drinks & Wi-Fi included",
    price: "$2,799",
    priceLabel: "pp",
    imageUrl:
      "https://images.unsplash.com/photo-1502850911033-9f3755a50d78?q=80&w=1470&auto=format&fit=crop",
    ctaUrl: "/deals/med-cruise",
    tag: "Cruise",
    location: "Italy • Greece • Spain",
    validUntil: "Sails May–Jul",
  },
  {
    id: "deal-gold-coast",
    title: "Gold Coast 4N",
    subtitle: "Beachfront apartment",
    price: "$749",
    priceLabel: "pp",
    imageUrl:
      "https://images.unsplash.com/photo-1500375592092-40eb2168fd21?q=80&w=1470&auto=format&fit=crop",
    ctaUrl: "/deals/gold-coast",
    tag: "Package",
    location: "Surfers Paradise, AU",
    validUntil: "Travel Jan–Mar",
  },
  {
    id: "deal-hawaii",
    title: "Auckland → Honolulu",
    subtitle: "Direct flights",
    price: "$1,199",
    priceLabel: "from",
    imageUrl:
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=1470&auto=format&fit=crop",
    ctaUrl: "/deals/hawaii-flights",
    tag: "Flights",
    location: "Honolulu, USA",
    validUntil: "Sale ends soon",
  },
];

function classNames(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export type AllTravelDealsProps = {
  deals?: Deal[];
  max?: number;
};

export default function AllTravelDeals({ deals = defaultDeals, max = 9 }: AllTravelDealsProps) {
  const items = deals.slice(0, Math.min(max, 9)); // 3 rows x 3 items

  return (
    <section aria-labelledby="top-deals-heading" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <header className="hidden mb-6 flex items-end justify-between gap-3">
        <div>
          <h2 id="top-deals-heading" className="text-2xl font-semibold tracking-tight text-[#1e2c4b]">
            Top deals
          </h2>
          <p className="text-sm text-[#2f3e5b]">
            Hand-picked offers across flights, cruises, and holiday packages.
          </p>
        </div>
      </header>

      <div className={classNames("grid gap-6", "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3")}>
        {items.map((deal) => (
          <Link
            key={deal.id}
            href={deal.ctaUrl}
            aria-label={`Open deal: ${deal.title}${deal.price ? ` — ${deal.price}` : ""}`}
            className="group block overflow-hidden rounded-2xl bg-white shadow ring-1 ring-black/5 transition hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1e2c4b]"
          >
            {/* Split tile: image + text */}
            <div className="grid h-full grid-cols-1 md:grid-cols-2">
              {/* Image half */}
              <div className="relative min-h-44 md:min-h-56">
                <img
                  src={deal.imageUrl}
                  alt={deal.title}
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover"
                />
                {deal.tag && (
                  <span className="pointer-events-none absolute left-3 top-3 inline-flex items-center rounded-full bg-white/90 px-3 py-1 text-xs font-medium shadow text-[#1e2c4b]">
                    {deal.tag}
                  </span>
                )}
              </div>

              {/* Text half */}
              <div className="flex flex-col justify-between p-4">
                <div>
                  <h3 className="text-base font-semibold leading-tight text-[#1e2c4b]">
                    {deal.title}
                  </h3>
                  {deal.subtitle && (
                    <p className="mt-1 text-sm text-[#2f3e5b]">{deal.subtitle}</p>
                  )}
                  {deal.location && (
                    <p className="mt-1 text-sm text-[#2f3e5b]">{deal.location}</p>
                  )}
                </div>

                <div className="mt-4 flex items-end justify-between">
                  <div>
                    {deal.priceLabel && (
                      <span className="block text-xs uppercase tracking-wide text-[#2f3e5b]">
                        {deal.priceLabel}
                      </span>
                    )}
                    <span className="text-2xl font-bold leading-none text-[#1e2c4b]">
                      {deal.price}
                    </span>
                    {deal.validUntil && (
                      <p className="mt-1 text-[11px] text-[#2f3e5b]">{deal.validUntil}</p>
                    )}
                  </div>

                  {/* Visual affordance only (not a button) */}
                  <svg
                    aria-hidden
                    viewBox="0 0 24 24"
                    className="ml-3 h-5 w-5 opacity-60 transition group-hover:translate-x-1"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path d="M5 12h14M13 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

// Optional: named export to reuse the default seed data elsewhere
export { defaultDeals };
