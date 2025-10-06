import { destinations } from "@/lib/destinations";

export function TopDestinationsTable() {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left border-separate border-spacing-y-2">
        <thead>
          <tr className="text-sm" style={{color:"var(--muted)"}}>
            <th className="px-4 py-2">Destination</th>
            <th className="px-4 py-2">Best Season</th>
            <th className="px-4 py-2">7-day Cost (approx)</th>
            <th className="px-4 py-2">Why go</th>
            <th className="px-4 py-2 sr-only">Guide</th>
          </tr>
        </thead>
        <tbody>
          {destinations.map(d => (
            <tr key={d.name} className="card">
              <td className="px-4 py-3 font-medium">{d.name}</td>
              <td className="px-4 py-3">{d.bestSeason}</td>
              <td className="px-4 py-3">{d.cost7d}</td>
              <td className="px-4 py-3">{d.vibe}</td>
              <td className="px-4 py-3">
                {d.guideUrl ? <a className="link" href={d.guideUrl} target="_blank" rel="noreferrer">Guide</a> : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
