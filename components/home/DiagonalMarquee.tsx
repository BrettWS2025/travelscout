"use client";

const DESTINATIONS = [
  "Wānaka",
  "Bay of Islands",
  "Queenstown",
  "Rotorua",
  "Fiordland",
  "Auckland",
  "Coromandel",
  "Nelson",
  "Franz Josef",
  "Wellington",
  "Taranaki",
  "Kaikōura",
];

function MarqueeRow({ reverse = false }: { reverse?: boolean }) {
  const items = [...DESTINATIONS, ...DESTINATIONS];

  return (
    <div
      className={`flex w-max gap-10 whitespace-nowrap ${
        reverse ? "animate-marquee-reverse" : "animate-marquee"
      }`}
      aria-hidden={reverse}
    >
      {items.map((name, i) => (
        <span
          key={`${name}-${i}`}
          className="inline-flex items-center gap-10 font-[family-name:var(--font-instrument)] text-4xl md:text-6xl tracking-tight text-[var(--ts-ink)]/90"
        >
          <span className={i % 2 === 0 ? "italic" : "not-italic font-medium"}>
            {name}
          </span>
          <span className="inline-block h-2 w-2 rotate-45 bg-[var(--ts-lime)]" />
        </span>
      ))}
    </div>
  );
}

export function DiagonalMarquee() {
  return (
    <section
      className="relative overflow-hidden py-16 md:py-24"
      aria-label="Destinations across New Zealand"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(212,230,67,0.18),transparent_65%)]" />
      <div className="relative -rotate-[7deg] scale-110 py-6">
        <div className="mb-6 overflow-hidden border-y border-[var(--ts-ink)]/10 py-5">
          <MarqueeRow />
        </div>
        <div className="overflow-hidden border-y border-[var(--ts-ink)]/10 py-5 opacity-55">
          <MarqueeRow reverse />
        </div>
      </div>
    </section>
  );
}
