import Link from "next/link";
import Image from "next/image";

export function Hero() {
  return (
    <section className="card p-8 md:p-12 grid md:grid-cols-2 gap-8 items-center">
      <div>
        <div className="badge">Built for travellers</div>
        <h1 className="mt-4 text-4xl md:text-5xl font-black tracking-tight">
          Compare smarter. Travel further.
        </h1>
        <p className="mt-4 text-lg" style={{ color: "var(--muted)" }}>
          Transparent comparisons, plain-English guides and tools that help you squeeze more out of every trip.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            className="px-5 py-3 rounded-2xl"
            style={{ background: "var(--brand)", color: "#000", boxShadow: "0 10px 25px rgba(0,0,0,0.08)" }}
            href="/(product)/compare"
          >
            Start comparing
          </Link>
          <Link
            className="px-5 py-3 rounded-2xl"
            style={{ background: "var(--brand)", color: "#000", boxShadow: "0 10px 25px rgba(0,0,0,0.08)" }}
            href="/(marketing)/guides"
          >
            Explore guides
          </Link>
        </div>
      </div>

      {/* Right box with image */}
      <div
        className="relative w-full overflow-hidden rounded-2xl border aspect-[4/3] sm:aspect-[3/2] md:aspect-[5/4]"
        style={{
          background: "linear-gradient(135deg, rgba(110,231,255,0.3), rgba(68,255,154,0.2))",
          borderColor: "rgba(255,255,255,0.10)",
        }}
      >
        <Image
          src="/11NovDoD.png"
          alt="Deal of the Day"
          fill
          priority
          className="object-contain md:object-cover object-center"
          sizes="(max-width: 768px) 100vw, 50vw"
        />

        {/* Centered CTA pill */}
        <Link
          href="https://helloworld.gocruising.co.nz/cruise/fly-stay-cruise-hawaiian-islands-NCL53189/"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open the deal (opens in a new tab)"
          className="absolute left-1/2 -translate-x-1/2 bottom-[2px] md:bottom-4 z-10 inline-flex items-center justify-center gap-2 rounded-lg md:rounded-xl px-4 py-2 text-xs sm:text-sm md:px-6 md:py-3 md:text-base font-semibold shadow-md transition-transform hover:scale-[1.02] active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 max-w-[calc(100%-1.5rem)] whitespace-nowrap"
          style={{ background: "#16223A", color: "#FFFFFF" }}
        >
          Take me there →
        </Link>
      </div>
    </section>
  );
}
