import type { Metadata } from "next";
import Link from "next/link";
import { Search, MapPin, Compass } from "lucide-react";

export const metadata: Metadata = {
  title: "Find Deals",
  description:
    "Search travel deals by location across New Zealand. Destination search is coming soon on TravelScout.",
};

export default function FindDealsPage() {
  return (
    <div className="ts-page min-h-screen">
      <section className="relative overflow-hidden px-4 pb-20 pt-28 md:px-8 md:pt-36">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-[var(--ts-teal)]/15 blur-3xl" />
          <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-[var(--ts-lime)]/20 blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.35]"
            style={{
              backgroundImage:
                "linear-gradient(120deg, transparent 40%, rgba(16,36,28,0.04) 40%, rgba(16,36,28,0.04) 41%, transparent 41%), linear-gradient(0deg, transparent 49%, rgba(16,36,28,0.03) 49%, rgba(16,36,28,0.03) 50%, transparent 50%)",
              backgroundSize: "48px 48px",
            }}
          />
        </div>

        <div className="relative mx-auto max-w-4xl">
          <p className="mb-4 font-[family-name:var(--font-sora)] text-xs font-semibold uppercase tracking-[0.22em] text-[var(--ts-teal)]">
            Find a deal
          </p>
          <h1 className="max-w-3xl font-[family-name:var(--font-instrument)] text-5xl leading-[1.05] tracking-tight text-[var(--ts-ink)] md:text-7xl">
            Search New Zealand{" "}
            <span className="italic text-[var(--ts-teal)]">by place</span>
          </h1>
          <p className="mt-6 max-w-xl font-[family-name:var(--font-sora)] text-lg text-[var(--ts-muted)] md:text-xl">
            Location-aware deal search is on the way. Soon you&apos;ll filter
            experiences, stays, and events for the exact region you want to
            explore.
          </p>

          <div className="mt-10">
            <label htmlFor="deal-location" className="sr-only">
              Search by location
            </label>
            <div className="flex flex-col gap-3 rounded-2xl border border-[var(--ts-ink)]/10 bg-white/80 p-3 shadow-[0_24px_60px_rgba(16,36,28,0.08)] backdrop-blur-md sm:flex-row sm:items-center">
              <div className="flex flex-1 items-center gap-3 px-3 py-2">
                <MapPin className="h-5 w-5 shrink-0 text-[var(--ts-teal)]" />
                <input
                  id="deal-location"
                  name="location"
                  type="text"
                  placeholder="Queenstown, Bay of Islands, Rotorua…"
                  disabled
                  className="w-full bg-transparent font-[family-name:var(--font-sora)] text-base text-[var(--ts-ink)] outline-none placeholder:text-[var(--ts-muted)] disabled:cursor-not-allowed disabled:opacity-70"
                />
              </div>
              <button
                type="button"
                disabled
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--ts-ink)] px-6 py-3 font-[family-name:var(--font-sora)] text-sm font-semibold text-white opacity-70"
              >
                <Search className="h-4 w-4" />
                Search deals
              </button>
            </div>
          </div>

          <p className="mt-4 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
            Placeholder — search will go live with location filters next.
          </p>
        </div>
      </section>

      <section className="border-t border-[var(--ts-ink)]/10 px-4 py-16 md:px-8">
        <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-3">
          {[
            {
              icon: MapPin,
              title: "Pick a place",
              copy: "Start with a town, region, or landmark across Aotearoa.",
            },
            {
              icon: Search,
              title: "Scan the offers",
              copy: "Compare curated deals without the noise of endless tabs.",
            },
            {
              icon: Compass,
              title: "Go when it fits",
              copy: "Match timing, budget, and vibe to the trip you actually want.",
            },
          ].map(({ icon: Icon, title, copy }) => (
            <div key={title} className="space-y-3">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--ts-teal)]/10 text-[var(--ts-teal)]">
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="font-[family-name:var(--font-instrument)] text-2xl text-[var(--ts-ink)]">
                {title}
              </h2>
              <p className="font-[family-name:var(--font-sora)] text-sm leading-relaxed text-[var(--ts-muted)]">
                {copy}
              </p>
            </div>
          ))}
        </div>

        <div className="mx-auto mt-14 max-w-5xl">
          <Link
            href="/"
            className="inline-flex items-center gap-2 border-b border-[var(--ts-ink)]/40 pb-1 font-[family-name:var(--font-sora)] text-sm font-medium text-[var(--ts-ink)] transition hover:border-[var(--ts-teal)] hover:text-[var(--ts-teal)]"
          >
            Back to TravelScout
            <span aria-hidden>→</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
