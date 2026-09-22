import { deals } from "@/lib/deals";

export function TopDealsTable() {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left border-separate border-spacing-y-2">
        <thead>
          <tr className="text-sm" style={{color:"var(--muted)"}}>
            <th className="px-4 py-2">Route</th>
            <th className="px-4 py-2">Airline</th>
            <th className="px-4 py-2">Fare</th>
            <th className="px-4 py-2">Travel Window</th>
            <th className="px-4 py-2 sr-only">Link</th>
          </tr>
        </thead>
        <tbody>
          {deals.map(deal => (
            <tr key={`${deal.route}-${deal.airline}-${deal.fare}`} className="card">
              <td className="px-4 py-3 font-medium">
                {deal.route}
                {deal.note ? <span className="ml-2 text-xs" style={{color:"var(--muted)"}}>({deal.note})</span> : null}
              </td>
              <td className="px-4 py-3">{deal.airline}</td>
              <td className="px-4 py-3">{deal.fare}</td>
              <td className="px-4 py-3">{deal.travelWindow}</td>
              <td className="px-4 py-3">
                <a className="link" href={deal.bookUrl} target="_blank" rel="noreferrer">See deal</a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
