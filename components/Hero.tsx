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
          Transparent comparisons, plain‑English guides and tools that help you squeeze more out of every trip.
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
      <Link
        href="https://www.houseoftravel.co.nz/deals/pacific-islands/fiji/plantation-island-resort-cmptffj2010#Inclusions"
        target="_blank"
        rel="noopener noreferrer"
        className="block group"
      >
        <div
          className="
            relative h-64 md:h-full rounded-2xl border overflow-hidden
          "
          style={{
            // Keeps your subtle background in case the image is still loading
            background: "linear-gradient(135deg, rgba(110,231,255,0.3), rgba(68,255,154,0.2))",
            borderColor: "rgba(255,255,255,0.10)",
          }}
        >
          <Image
            src="/7th_Nov_Deal_of_the_Day.png"
            alt="Deal of the Day — Plantation Island Resort"
            fill
            priority
            className="object-cover object-center transition-transform duration-300 group-hover:scale-[1.02]"
            sizes="(max-width: 768px) 100vw, 50vw"
          />
        </div>
      </Link>
    </section>
  );
}
