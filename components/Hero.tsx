import Link from "next/link";
export function Hero() {
  return (
    <section className="card p-8 md:p-12 grid md:grid-cols-2 gap-8 items-center">
      <div>
        <div className="badge">Built for travellers</div>
        <h1 className="mt-4 text-4xl md:text-5xl font-black tracking-tight">Compare smarter. Travel further.</h1>
        <p className="mt-4 text-lg" style={{color:"var(--muted)"}}>
          Transparent comparisons, plain‑English guides and tools that help you squeeze more out of every trip.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link className="px-5 py-3 rounded-2xl" style={{background:"var(--brand)", color:"#000", boxShadow:"0 10px 25px rgba(0,0,0,0.08)"}} href="/(product)/compare">Start comparing</Link>
          <Link className="px-5 py-3 rounded-2xl border" style={{background:"rgba(255,255,255,0.10)", borderColor:"rgba(255,255,255,0.10)"}} href="/(marketing)/guides">Explore guides</Link>
        </div>
      </div>
      <div className="h-64 md:h-full rounded-2xl border" style={{background:"linear-gradient(135deg, rgba(110,231,255,0.3), rgba(68,255,154,0.2))", borderColor:"rgba(255,255,255,0.10)"}} />
    </section>
  );
}
