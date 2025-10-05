import { products } from "@/lib/products";
export function ComparisonTable(){
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left border-separate border-spacing-y-2">
        <thead>
          <tr className="text-sm text-[var(--muted)]">
            <th className="px-4 py-2">Product</th>
            <th className="px-4 py-2">FX Fee</th>
            <th className="px-4 py-2">ATM Fee</th>
            <th className="px-4 py-2">Perks</th>
            <th className="px-4 py-2 sr-only">Link</th>
          </tr>
        </thead>
        <tbody>
          {products.map(p => (
            <tr key={p.name} className="card">
              <td className="px-4 py-3 font-medium">{p.name}</td>
              <td className="px-4 py-3">{p.fxFee}</td>
              <td className="px-4 py-3">{p.atm}</td>
              <td className="px-4 py-3">{p.perks}</td>
              <td className="px-4 py-3"><a className="link" href={p.url} target="_blank" rel="noreferrer">Apply</a></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
