import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Travel Tips",
  description: "Verified travel tips and mistake fares with clear 'gotchas'. Get the best deals and avoid common travel pitfalls when planning your New Zealand journey.",
};
export default function Deals() {
  return (
    <section className="space-y-4">
      <h1 className="text-3xl font-bold">Tips</h1>
      <p className="text-[color:var(--muted)]">Verified travel tips and mistake fares with clear 'gotchas'.</p>
      <div className="grid md:grid-cols-3 gap-4">
        {Array.from({length:6}).map((_,i)=> (
          <article key={i} className="card p-4">
            <div className="badge">Limited</div>
            <h3 className="mt-2 text-xl font-semibold">Sample deal #{i+1}</h3>
            <p className="text-[color:var(--muted)]">AKL ✈ SYD return from $299</p>
            <a className="link" href="#">See details</a>
          </article>
        ))}
      </div>
    </section>
  );
}
