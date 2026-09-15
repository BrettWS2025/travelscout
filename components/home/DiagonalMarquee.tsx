"use client";

export type ShowcaseDeal = {
  id: string;
  title: string;
  region: string;
  category: string;
  priceLabel: string;
  tone: "ink" | "teal" | "lime" | "mist";
};

export const PLACEHOLDER_DEALS: ShowcaseDeal[] = [
  {
    id: "1",
    title: "Alpine lake day pass",
    region: "Wānaka",
    category: "Experience",
    priceLabel: "from $89",
    tone: "teal",
  },
  {
    id: "2",
    title: "Island hop & sail",
    region: "Bay of Islands",
    category: "Cruise",
    priceLabel: "from $149",
    tone: "ink",
  },
  {
    id: "3",
    title: "Glow-worm evening",
    region: "Waitomo",
    category: "Tour",
    priceLabel: "from $65",
    tone: "lime",
  },
  {
    id: "4",
    title: "Fiord overnight",
    region: "Milford Sound",
    category: "Stay",
    priceLabel: "from $320",
    tone: "mist",
  },
  {
    id: "5",
    title: "City harbour walk",
    region: "Wellington",
    category: "Culture",
    priceLabel: "from $45",
    tone: "teal",
  },
  {
    id: "6",
    title: "Thermal pools escape",
    region: "Rotorua",
    category: "Wellness",
    priceLabel: "from $79",
    tone: "ink",
  },
  {
    id: "7",
    title: "Vineyard tasting flight",
    region: "Marlborough",
    category: "Food & drink",
    priceLabel: "from $55",
    tone: "lime",
  },
  {
    id: "8",
    title: "Glacier valley hike",
    region: "Franz Josef",
    category: "Adventure",
    priceLabel: "from $110",
    tone: "mist",
  },
];

const TONE_STYLES: Record<ShowcaseDeal["tone"], string> = {
  ink: "bg-[var(--ts-ink)] text-white",
  teal: "bg-[var(--ts-teal)] text-white",
  lime: "bg-[var(--ts-lime)] text-[var(--ts-ink)]",
  mist: "bg-white text-[var(--ts-ink)] border border-[var(--ts-ink)]/10",
};

function DealCard({ deal }: { deal: ShowcaseDeal }) {
  return (
    <article
      className={`relative flex h-[168px] w-[240px] shrink-0 flex-col justify-between overflow-hidden rounded-2xl p-4 shadow-[0_18px_40px_rgba(16,36,28,0.12)] md:h-[180px] md:w-[260px] ${TONE_STYLES[deal.tone]}`}
      aria-label={`${deal.title} in ${deal.region}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-full bg-black/10 px-2.5 py-1 font-[family-name:var(--font-sora)] text-[10px] font-semibold uppercase tracking-[0.14em]">
          {deal.category}
        </span>
        <span className="font-[family-name:var(--font-sora)] text-xs font-medium opacity-80">
          {deal.region}
        </span>
      </div>
      <div>
        <h3 className="font-[family-name:var(--font-instrument)] text-2xl leading-tight tracking-tight md:text-[1.65rem]">
          {deal.title}
        </h3>
        <p className="mt-2 font-[family-name:var(--font-sora)] text-sm font-semibold">
          {deal.priceLabel}
        </p>
      </div>
    </article>
  );
}

function MarqueeRow({ reverse = false }: { reverse?: boolean }) {
  const items = [...PLACEHOLDER_DEALS, ...PLACEHOLDER_DEALS];

  return (
    <div
      className={`flex w-max gap-4 md:gap-5 ${
        reverse ? "animate-marquee-reverse" : "animate-marquee"
      }`}
      aria-hidden={reverse}
    >
      {items.map((deal, i) => (
        <DealCard key={`${deal.id}-${i}-${reverse ? "b" : "a"}`} deal={deal} />
      ))}
    </div>
  );
}

export function DiagonalMarquee() {
  return (
    <section
      className="relative z-0 -mt-16 overflow-hidden pb-16 pt-24 md:-mt-20 md:pb-24 md:pt-28"
      aria-label="Featured deals showcase"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(212,230,67,0.16),transparent_65%)]" />
      <div className="relative mx-auto mb-8 max-w-6xl px-5 md:px-10 lg:px-16">
        <p className="font-[family-name:var(--font-sora)] text-xs font-semibold uppercase tracking-[0.24em] text-[var(--ts-teal)]">
          On show
        </p>
        <h2 className="mt-2 font-[family-name:var(--font-instrument)] text-3xl text-[var(--ts-ink)] md:text-4xl">
          Deals drifting through <span className="italic">Aotearoa</span>
        </h2>
        <p className="mt-2 max-w-xl font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
          Placeholder cards for now — operator offers will fill this ribbon once
          partners come aboard. Display only; nothing to click yet.
        </p>
      </div>
      <div className="relative -rotate-[7deg] scale-110 py-4">
        <div className="mb-5 overflow-hidden py-2">
          <MarqueeRow />
        </div>
        <div className="overflow-hidden py-2 opacity-80">
          <MarqueeRow reverse />
        </div>
      </div>
    </section>
  );
}
