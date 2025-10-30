import { loadPackagesFromFs } from "@/lib/loadPackagesFromFs";

export const dynamic = "force-dynamic";

export default async function PackagesPage() {
  const items = await loadPackagesFromFs();
  return (
    <main className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Packages (latest scrape)</h1>
      <p className="text-sm mb-4">Found {items.length} packages. Showing first 200.</p>
      <ul className="grid md:grid-cols-2 gap-4">
        {items.slice(0, 200).map((p) => (
          <li key={p.package_id} className="border rounded-xl p-4">
            <div className="font-medium">{p.title}</div>
            <div className="text-sm text-gray-600">{p.source} • {p.nights ? `${p.nights} nights` : `${p.duration_days} days`}</div>
            <div className="mt-1 text-sm">
              <span className="font-semibold">NZD {p.price_nzd ?? p.price}</span>
              {p.price_pppn ? <span className="ml-2 text-gray-600">({p.price_pppn} pppn)</span> : null}
            </div>
            <div className="text-xs mt-1">
              {p.includes?.flights ? "✈︎ Flights" : "—"} • {p.includes?.hotel ? "🏨 Hotel" : "—"} {p.includes?.board ? `• 🍽 ${p.includes.board}` : ""}
            </div>
            <a href={p.url} target="_blank" className="text-blue-600 text-sm mt-2 inline-block underline">View deal</a>
          </li>
        ))}
      </ul>
    </main>
  );
}
