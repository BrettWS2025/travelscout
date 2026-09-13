import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "See how TravelScout showcases New Zealand deals and helps you search by region.",
};

const STEPS = [
  {
    n: "01",
    title: "Browse the showcase",
    copy: "The home page puts destination stories and featured deals on display — no clutter, just inspiration.",
  },
  {
    n: "02",
    title: "Search by region",
    copy: "Use Find Deals (or the hero search) to narrow in on the places you actually want to go.",
  },
  {
    n: "03",
    title: "Book with operators",
    copy: "When partners are live, you’ll jump from TravelScout straight to verified operator offers for that region.",
  },
];

export default function HowItWorksPage() {
  return (
    <div className="ts-page min-h-screen">
      <section className="relative overflow-hidden px-4 pb-20 pt-28 md:px-8 md:pt-36">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -right-16 top-20 h-72 w-72 rounded-full bg-[var(--ts-lime)]/20 blur-3xl" />
          <div className="absolute bottom-10 left-0 h-80 w-80 rounded-full bg-[var(--ts-teal)]/15 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-4xl">
          <p className="mb-4 font-[family-name:var(--font-sora)] text-xs font-semibold uppercase tracking-[0.22em] text-[var(--ts-teal)]">
            How it works
          </p>
          <h1 className="max-w-3xl font-[family-name:var(--font-instrument)] text-5xl leading-[1.05] tracking-tight text-[var(--ts-ink)] md:text-7xl">
            Showcase first.{" "}
            <span className="italic text-[var(--ts-teal)]">Search when ready.</span>
          </h1>
          <p className="mt-6 max-w-xl font-[family-name:var(--font-sora)] text-lg text-[var(--ts-muted)]">
            TravelScout separates discovery from hunting. Soak up New Zealand on
            the home page, then filter by region when you&apos;re ready to book.
          </p>
        </div>
      </section>

      <section className="border-t border-[var(--ts-ink)]/10 px-4 py-16 md:px-8">
        <div className="mx-auto grid max-w-5xl gap-10 md:grid-cols-3">
          {STEPS.map((step) => (
            <div key={step.n} className="space-y-3">
              <p className="font-[family-name:var(--font-sora)] text-xs font-semibold tracking-[0.2em] text-[var(--ts-teal)]">
                {step.n}
              </p>
              <h2 className="font-[family-name:var(--font-instrument)] text-2xl text-[var(--ts-ink)] md:text-3xl">
                {step.title}
              </h2>
              <p className="font-[family-name:var(--font-sora)] text-sm leading-relaxed text-[var(--ts-muted)]">
                {step.copy}
              </p>
            </div>
          ))}
        </div>

        <div className="mx-auto mt-14 flex max-w-5xl flex-wrap gap-4">
          <Link
            href="/find-deals"
            className="inline-flex items-center gap-2 bg-[var(--ts-ink)] px-6 py-3 font-[family-name:var(--font-sora)] text-sm font-semibold text-white transition hover:bg-[var(--ts-teal)]"
          >
            Find deals
            <span aria-hidden>→</span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 border-b border-[var(--ts-ink)]/40 pb-1 font-[family-name:var(--font-sora)] text-sm font-medium text-[var(--ts-ink)] transition hover:border-[var(--ts-teal)] hover:text-[var(--ts-teal)]"
          >
            Back to showcase
          </Link>
        </div>
      </section>
    </div>
  );
}
