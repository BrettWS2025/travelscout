export type Destination = {
  name: string;
  bestSeason: string;   // e.g. "Nov–Mar"
  cost7d: string;       // e.g. "$1.6k–$2.2k"
  vibe: string;         // short descriptor
  guideUrl?: string;    // optional link
};

export const destinations: Destination[] = [
  { name: "Queenstown, NZ", bestSeason: "Dec–Mar", cost7d: "$1.8k–$2.5k", vibe: "Lakes, hikes, wine", guideUrl: "#" },
  { name: "Tokyo, Japan", bestSeason: "Mar–May / Oct–Nov", cost7d: "$2.2k–$3.0k", vibe: "Food, culture, neon", guideUrl: "#" },
  { name: "Bali, Indonesia", bestSeason: "Apr–Oct", cost7d: "$1.5k–$2.1k", vibe: "Beaches & villas", guideUrl: "#" },
  { name: "Sydney, Australia", bestSeason: "Sep–Apr", cost7d: "$1.3k–$1.9k", vibe: "Harbour & city breaks", guideUrl: "#" },
  { name: "Rarotonga, Cooks", bestSeason: "May–Oct", cost7d: "$1.9k–$2.6k", vibe: "Lagoon chill", guideUrl: "#" },
];
