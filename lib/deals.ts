export type Deal = {
  route: string;        // "AKL ⇄ SYD"
  airline: string;      // "Air New Zealand"
  fare: string;         // "from $299 return"
  travelWindow: string; // "Feb–Jun 2026"
  bookUrl: string;      // link to book/details
  note?: string;        // optional "bag not included" etc.
};

export const deals: Deal[] = [
  { route: "AKL ⇄ SYD", airline: "Air New Zealand", fare: "from $299 return", travelWindow: "Feb–Jun 2026", bookUrl: "#" , note: "Carry-on only" },
  { route: "AKL ⇄ NAN", airline: "Fiji Airways",    fare: "from $499 return", travelWindow: "Mar–May 2026", bookUrl: "#" },
  { route: "CHC ⇄ MEL", airline: "Jetstar",         fare: "from $219 return", travelWindow: "Apr–Jun 2026", bookUrl: "#", note: "Limited seats" },
  { route: "AKL ⇄ TYO", airline: "Qantas",          fare: "from $1,199 return", travelWindow: "Sep–Nov 2026", bookUrl: "#" },
  { route: "AKL ⇄ RAR", airline: "Air New Zealand", fare: "from $649 return", travelWindow: "May–Aug 2026", bookUrl: "#" },
];
