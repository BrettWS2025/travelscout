import Link from "next/link";
export function Hero() {
  return (
    <section className="card p-8 md:p-12 grid md:grid-cols-2 gap-8 items-center">
      <div>
        <div className="badge">Built for travellers</div>
        <h1 className="mt-4 text-4xl md:text-5xl font-black tracking-tight">Compare smarter. Travel further.</h1>
        <p className="mt-4 text-lg text-[var(--muted)]">Transparent comparisons, plain‑English guides and tools that help you squeeze more out of every trip.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link className="px-5 py-3 rounded-2xl bg-[var(--brand)] text-black font-semibold shadow-soft" href="/(product)/compare">Start comparing</Link>
          <Link className="px-5 py-3 rounded-2xl bg-white/10 border border-white/10" href="/(marketing)/guides">Explore guides</Link>
        </div>
      </div>
      <div className="h-64 md:h-full rounded-2xl bg-gradient-to-br from-[var(--accent)]/30 to-[var(--brand)]/20 border border-white/10" />
    </section>
  );
}
