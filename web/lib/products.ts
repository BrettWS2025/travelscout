export type ProductOffer = {
  id: string;

  // Who sells / operates
  vendor: string;             // e.g. "TravelScout" or OTA (Agency)
  brand?: string;             // e.g. "Princess", "Air NZ", "Hilton"

  // Name/title
  title?: string;             // e.g. "7-Night South Pacific"

  // Pricing
  currency?: string;          // e.g. "NZD"
  priceMin?: number | null;   // e.g. 1299
  priceMax?: number | null;   // e.g. 1899
  priceText?: string;         // e.g. "NZ$1,299 pp (inside)"

  // Dates
  startDate?: string | null;  // ISO "2025-11-01"
  endDate?: string | null;    // ISO "2026-02-28"
  dateText?: string;          // e.g. "Nov 2025 – Feb 2026"

  // Age restrictions
  ageMin?: number | null;     // 18
  ageMax?: number | null;     // null for no upper bound
  ageText?: string;           // "All ages", "18+"

  // Travel-specific extras (use what you need)
  origin?: string;            // e.g. "AKL"
  destination?: string;       // e.g. "NRT"
  routeText?: string;         // e.g. "AKL → NRT"
  durationText?: string;      // "7 nights", "12 days", "10h 35m"
  cabin?: string;             // "Inside", "Premium Economy", "King"
  baggage?: string;           // "1x23kg", "Carry-on only"
  stops?: number | null;      // 0, 1, 2...
  policy?: string;            // "Free changes 24h", "Non-refundable"
  rating?: number | null;     // 4.5

  // Link + tags
  url: string;                // detail or booking link
  tags?: string[];
};
