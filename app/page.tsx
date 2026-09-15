import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { DiagonalMarquee } from "@/components/home/DiagonalMarquee";
import { HeroDealCarousel } from "@/components/home/HeroDealCarousel";
import { Reveal } from "@/components/home/Reveal";
import { HeroRegionSearch } from "@/components/home/HeroRegionSearch";

export const metadata: Metadata = {
  title: "TravelScout | Discover New Zealand",
  description:
    "A showcase of New Zealand travel and deals worth chasing. Search by region on Find Deals.",
  openGraph: {
    title: "TravelScout | Discover New Zealand",
    description:
      "A showcase of New Zealand travel and deals worth chasing. Search by region on Find Deals.",
  },
};

export default function Home() {
  return (
    <div className="ts-page">
      <div className="relative">
        <section className="relative w-full overflow-hidden">
          <Image
            src="/Main_Page_Pic.jpg"
            alt="New Zealand landscape"
            fill
            priority
            className="animate-hero-drift scale-105 object-cover object-center"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-[var(--ts-ink)]/75 via-[var(--ts-ink)]/45 to-[var(--ts-teal)]/35" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_20%,rgba(212,230,67,0.18),transparent_50%)]" />

          <div className="relative z-10 flex min-h-[100svh] flex-col items-center justify-center px-5 pb-36 pt-28 md:px-10 md:pb-44 lg:px-16">
            <div className="w-full max-w-xl animate-hero-rise text-center">
              <h1 className="mb-5 font-[family-name:var(--font-instrument)] text-3xl leading-tight tracking-tight text-white md:text-4xl lg:text-[2.75rem]">
                Today, Tomorrow or the next day - always pay less
              </h1>
              <HeroRegionSearch />
            </div>
          </div>
        </section>

        {/* Flat page-surface slab from the hero edge down — same colour as Wānaka /
            Bay of Islands below. Solid fill only; no gradient or shadow. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-full z-10"
          style={{ backgroundColor: "var(--bg)", height: "50vh" }}
        />

        {/* Title sits on the hero just above the cards */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 mb-[min(42vw,148px)] md:mb-[160px]">
          <div className="mx-auto max-w-6xl px-5 md:px-14 lg:px-16">
            <p className="font-[family-name:var(--font-sora)] text-[10px] font-semibold uppercase tracking-[0.22em] text-white/85">
              Last-minute from operators
            </p>
            <h2 className="mt-1 font-[family-name:var(--font-instrument)] text-2xl text-white md:text-3xl">
              Deals worth taking today
            </h2>
          </div>
        </div>

        {/* Cards only straddle the seam */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-20"
          style={{ transform: "translateY(50%)" }}
        >
          <div className="pointer-events-auto relative">
            <HeroDealCarousel />
          </div>
        </div>
      </div>

      <div style={{ backgroundColor: "var(--bg)" }}>
        <DiagonalMarquee />
      </div>

      <section
        className="relative px-5 py-20 md:px-10 md:py-28 lg:px-16"
        style={{ backgroundColor: "var(--bg)" }}
      >
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <p className="font-[family-name:var(--font-sora)] text-xs font-semibold uppercase tracking-[0.24em] text-[var(--ts-teal)]">
              Why TravelScout
            </p>
            <h2 className="mt-4 max-w-4xl font-[family-name:var(--font-instrument)] text-4xl leading-[1.08] text-[var(--ts-ink)] md:text-6xl">
              Less noise. More New Zealand.
              <span className="italic text-[var(--ts-teal)]"> Worth taking.</span>
            </h2>
            <p className="mt-6 max-w-2xl font-[family-name:var(--font-sora)] text-lg text-[var(--ts-muted)]">
              Home is the showcase — destinations and deals on display. When
              you&apos;re ready to go specific, search by region and Find Deals
              takes it from there.
            </p>
          </Reveal>
        </div>
      </section>

      <section
        id="escape"
        className="relative overflow-hidden px-5 py-8 md:px-10 md:py-12 lg:px-16"
        style={{ backgroundColor: "var(--bg)" }}
      >
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-[var(--ts-mist)] to-transparent" />
        <div className="relative mx-auto max-w-6xl space-y-24 md:space-y-32">
          <Reveal>
            <div className="grid items-end gap-8 md:grid-cols-12 md:gap-10">
              <div className="md:col-span-7">
                <div className="relative aspect-[16/10] overflow-hidden">
                  <Image
                    src="/wanakatree.jpg"
                    alt="That Wanaka Tree at dusk"
                    fill
                    className="object-cover transition duration-700 hover:scale-[1.03]"
                    sizes="(max-width: 768px) 100vw, 60vw"
                  />
                </div>
              </div>
              <div className="md:col-span-5 md:pb-4">
                <p className="font-[family-name:var(--font-sora)] text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--ts-teal)]">
                  Southern Alps
                </p>
                <h3 className="mt-2 font-[family-name:var(--font-instrument)] text-4xl text-[var(--ts-ink)] md:text-5xl">
                  Wānaka
                </h3>
                <p className="mt-4 font-[family-name:var(--font-sora)] text-sm leading-relaxed text-[var(--ts-muted)] md:text-base">
                  Lakeside calm under alpine light — ski Cardrona, swim the lake,
                  or chase festival nights when the Southern Alps glow.
                </p>
                <Link
                  href="/find-deals?region=W%C4%81naka"
                  className="mt-6 inline-flex items-center gap-2 font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--ts-ink)] transition hover:text-[var(--ts-teal)]"
                >
                  Find deals in Wānaka
                  <span aria-hidden>→</span>
                </Link>
              </div>
            </div>
          </Reveal>

          <Reveal delayMs={80}>
            <div className="grid items-end gap-8 md:grid-cols-12 md:gap-10">
              <div className="order-2 md:order-1 md:col-span-5 md:pb-4 md:text-right">
                <p className="font-[family-name:var(--font-sora)] text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--ts-teal)]">
                  Northland
                </p>
                <h3 className="mt-2 font-[family-name:var(--font-instrument)] text-4xl text-[var(--ts-ink)] md:text-5xl">
                  Bay of Islands
                </h3>
                <p className="mt-4 font-[family-name:var(--font-sora)] text-sm leading-relaxed text-[var(--ts-muted)] md:text-base">
                  A subtropical scatter of islands — sail, fly, and wander through
                  history wrapped in turquoise water.
                </p>
                <Link
                  href="/find-deals?region=Northland"
                  className="mt-6 inline-flex items-center gap-2 font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--ts-ink)] transition hover:text-[var(--ts-teal)]"
                >
                  Find deals in Northland
                  <span aria-hidden>→</span>
                </Link>
              </div>
              <div className="order-1 md:order-2 md:col-span-7">
                <div className="relative aspect-[16/10] overflow-hidden">
                  <Image
                    src="/BayOfislands.jpg"
                    alt="Bay of Islands coastline"
                    fill
                    className="object-cover transition duration-700 hover:scale-[1.03]"
                    sizes="(max-width: 768px) 100vw, 60vw"
                  />
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="relative overflow-hidden px-5 py-24 md:px-10 md:py-32 lg:px-16">
        <div className="pointer-events-none absolute -left-20 top-10 h-64 w-64 rounded-full bg-[var(--ts-lime)]/25 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-80 w-80 rounded-full bg-[var(--ts-teal)]/20 blur-3xl" />
        <Reveal>
          <div className="relative mx-auto max-w-4xl text-center">
            <h2 className="font-[family-name:var(--font-instrument)] text-4xl text-[var(--ts-ink)] md:text-6xl">
              Ready when you are
            </h2>
            <p className="mx-auto mt-4 max-w-xl font-[family-name:var(--font-sora)] text-[var(--ts-muted)]">
              Skip the scroll — search the region you care about and surface the
              deals that belong there.
            </p>
            <Link
              href="/find-deals"
              className="mt-8 inline-flex items-center gap-2 bg-[var(--ts-ink)] px-7 py-3.5 font-[family-name:var(--font-sora)] text-sm font-semibold text-white transition hover:bg-[var(--ts-teal)]"
            >
              Find a deal
              <span aria-hidden>→</span>
            </Link>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
