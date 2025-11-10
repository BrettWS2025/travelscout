"use client";

import ProductsTable, { type ProductsColumn } from "@/components/ComparisonTable";
import type { ProductOffer } from "@/lib/products";
import React from "react";

// — Data moved out of the page —
const rows: ProductOffer[] = [
  {
    id: "cmp-Princess",
    vendor: "Princess Cruises",
    url: "#",
    priceText: "$$",
    policy: "Classic vibe",
    title: "Princess Plus/Premier - $$-$$$",
    destination: "—",
    brand: "No - additional costs apply",
  },
  {
    id: "cmp-NCL",
    vendor: "Norwegian Cruise Lines",
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

const columns: ProductsColumn[] = [
  { key: "vendor", header: "Cruise Line", sortable: false },
  { key: "price", header: "Cost", sortable: false, align: "left" },
  { key: "title", header: "Add Ons", sortable: false },
  { key: "policy", header: "Vibe Check", sortable: false },
  { key: "brand", header: "Free wifi", sortable: false },
  { key: "link", header: "", sortable: false, align: "right", widthClass: "whitespace-nowrap" },
];

type Props = {
  tone?: "onDark" | "onLight";
  maxColumns?: number;
  emptyText?: string;
};

export default function CruiseComparisonsTable({
  tone = "onDark",
  maxColumns = 7,
  emptyText = "No comparison rows yet.",
}: Props) {
  return (
    <ProductsTable
      rows={rows}
      columns={columns}
      maxColumns={maxColumns}
      emptyText={emptyText}
      tone={tone}
    />
  );
}
