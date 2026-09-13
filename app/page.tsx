import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { DiagonalMarquee } from "@/components/home/DiagonalMarquee";
import { Reveal } from "@/components/home/Reveal";

export const metadata: Metadata = {
  title: "TravelScout | Discover New Zealand",
  description:
    "A showcase of New Zealand travel — destinations, events, and deals worth chasing. Search specific locations on Find a Deal.",
  openGraph: {
    title: "TravelScout | Discover New Zealand",
    description:
      "A showcase of New Zealand travel — destinations, events, and deals worth chasing.",
  },
};

export default function Home() {
  return (
    <div className="ts-page">
      {/* Hero — one composition: brand, headline, line, CTA, full-bleed image */}
      <section className="relative min-h-[100svh] w-full overflow-hidden">
        <Image
          src="/Main_Page_Pic.jpg"
          alt="New Zealand landscape"
          fill
          priority
          className="object-cover object-center scale-105 animate-hero-drift"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--ts-ink)]/75 via-[var(--ts-ink)]/45 to-[var(--ts-teal)]/35" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_20%,rgba(212,230,67,0.18),transparent_50%)]" />

        <div className="relative z-10 flex min-h-[100svh] flex-col justify-end px-5 pb-16 pt-28 md:px-10 md:pb-24 lg:px-16">
          <div className="max-w-4xl animate-hero-rise">
            <p className="mb-5 font-[family-name:var(--font-sora)] text-sm font-semibold uppercase tracking-[0.28em] text-[var(--ts-lime)] md:text-base">
              TravelScout
            </p>
            <h1 className="font-[family-name:var(--font-instrument)] text-5xl leading-[0.98] tracking-tight text-white md:text-7xl lg:text-8xl">
              Journeys that
              <br />
              <span className="italic text-[var(--ts-lime)]">matter</span>
            </h1>
            <p className="mt-6 max-w-lg font-[family-name:var(--font-sora)] text-base text-white/85 md:text-lg">
              A curated look at New Zealand — then hunt the offer that fits your
              place and pace.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-5">
              <Link
                href="/find-deals"
                className="inline-flex items-center gap-2 bg-[var(--ts-lime)] px-6 py-3 font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--ts-ink)] transition hover:brightness-105"
              >
                Find a deal
                <span aria-hidden>→</span>
              </Link>
              <a
                href="#escape"
                className="font-[family-name:var(--font-sora)] text-sm font-medium text-white/80 underline decoration-white/30 underline-offset-4 transition hover:text-white hover:decoration-white"
              >
                Explore the showcase
              </a>
            </div>
          </div>
        </div>
      </section>

      <DiagonalMarquee />

      {/* Editorial statement — Creativeans-style big type */}
      <section className="relative px-5 py-20 md:px-10 md:py-28 lg:px-16">
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
              The home page is the showcase — destinations, atmosphere, and the
              moments that pull you south. When you&apos;re ready to go specific,
              Find a Deal is where the search lives.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Destinations showcase */}
      <section
        id="escape"
        className="relative overflow-hidden px-5 py-8 md:px-10 md:py-12 lg:px-16"
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
                  href="/find-deals"
                  className="mt-6 inline-flex items-center gap-2 font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--ts-ink)] transition hover:text-[var(--ts-teal)]"
                >
                  Find deals nearby
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
                  A subtropical scatter of 144 islands — sail, fly, and wander
                  through history wrapped in turquoise water.
                </p>
                <Link
                  href="/find-deals"
                  className="mt-6 inline-flex items-center gap-2 font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--ts-ink)] transition hover:text-[var(--ts-teal)]"
                >
                  Find deals nearby
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

      {/* Events — one job */}
      <section className="mt-20 bg-[var(--ts-ink)] px-5 py-20 text-white md:mt-28 md:px-10 md:py-28 lg:px-16">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <p className="font-[family-name:var(--font-sora)] text-xs font-semibold uppercase tracking-[0.24em] text-[var(--ts-lime)]">
              On the calendar
            </p>
            <h2 className="mt-3 font-[family-name:var(--font-instrument)] text-4xl md:text-6xl">
              Next big <span className="italic">moments</span>
            </h2>
          </Reveal>

          <div className="mt-14 space-y-16">
            <Reveal>
              <article className="grid items-center gap-8 md:grid-cols-2">
                <div className="relative overflow-hidden">
                  <img
                    src="/gunsnrosesbanner.jpg"
                    alt="Guns N' Roses World Tour 2026"
                    className="h-auto w-full object-contain"
                  />
                </div>
                <div>
                  <h3 className="font-[family-name:var(--font-instrument)] text-3xl md:text-4xl">
                    Guns N&apos; Roses · World Tour 2026
                  </h3>
                  <p className="mt-3 font-[family-name:var(--font-sora)] text-sm text-white/70">
                    Back on stage for the first time since 2022 — Eden Park,
                    Auckland, 17 December.
                  </p>
                </div>
              </article>
            </Reveal>

            <Reveal delayMs={60}>
              <article className="grid items-center gap-8 md:grid-cols-2">
                <div className="order-2 md:order-1">
                  <h3 className="font-[family-name:var(--font-instrument)] text-2xl md:text-3xl">
                    DHL Super Rugby Pacific Super Round
                  </h3>
                  <p className="mt-3 font-[family-name:var(--font-sora)] text-sm text-white/70">
                    Three days of world-class rugby in Ōtautahi — 24–26 April at
                    One NZ Stadium, Christchurch.
                  </p>
                </div>
                <div className="order-1 mx-auto w-full max-w-[240px] md:order-2 md:mx-0 md:justify-self-end">
                  <img
                    src="/superrugbysuperround.jpg"
                    alt="DHL Super Rugby Pacific Super Round"
                    className="h-auto w-full object-contain"
                  />
                </div>
              </article>
            </Reveal>

            <Reveal delayMs={90}>
              <article className="grid items-center gap-8 md:grid-cols-2">
                <div className="relative overflow-hidden">
                  <img
                    src="/jazzfestival.jpg"
                    alt="2026 National Jazz Festival"
                    className="h-auto w-full object-contain"
                  />
                </div>
                <div>
                  <h3 className="font-[family-name:var(--font-instrument)] text-2xl md:text-3xl">
                    2026 National Jazz Festival
                  </h3>
                  <p className="mt-3 font-[family-name:var(--font-sora)] text-sm text-white/70">
                    Eleven days of jazz across Tauranga and Mount Maunganui —
                    27 March to 7 April.
                  </p>
                </div>
              </article>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="relative overflow-hidden px-5 py-24 md:px-10 md:py-32 lg:px-16">
        <div className="pointer-events-none absolute -left-20 top-10 h-64 w-64 rounded-full bg-[var(--ts-lime)]/25 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-80 w-80 rounded-full bg-[var(--ts-teal)]/20 blur-3xl" />
        <Reveal>
          <div className="relative mx-auto max-w-4xl text-center">
            <h2 className="font-[family-name:var(--font-instrument)] text-4xl text-[var(--ts-ink)] md:text-6xl">
              Ready when you are
            </h2>
            <p className="mx-auto mt-4 max-w-xl font-[family-name:var(--font-sora)] text-[var(--ts-muted)]">
              Skip the scroll — search the places you care about and surface the
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
