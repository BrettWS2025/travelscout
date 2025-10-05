export const metadata = { title: "Travel Guides" };
export default function Guides() {
  return (
    <section className="space-y-4">
      <h1 className="text-3xl font-bold">Travel Guides</h1>
      <p className="text-[var(--muted)]">Destination deep-dives, airport hacks, loyalty sweet spots.</p>
      <ul className="grid md:grid-cols-2 gap-4">
        <li className="card p-4">How to squeeze more from Airpoints</li>
        <li className="card p-4">Sydney on $150/day</li>
        <li className="card p-4">Best stopovers to break a long-haul</li>
        <li className="card p-4">Auckland airport: everything you need</li>
      </ul>
    </section>
  );
}
