'use client';
import { useState } from 'react';
export function FilterBar(){
  const [fx, setFx] = useState('<=1.0%');
  const [minAge, setMinAge] = useState('All');
  return (
    <div className="card p-4 grid md:grid-cols-3 gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm text-[var(--muted)]">FX fee</span>
        <select value={fx} onChange={e=>setFx(e.target.value)} className="bg-transparent border border-white/10 rounded-xl px-3 py-2">
          <option value="<=1.0%">&le; 1.0%</option>
          <option value="<=2.0%">&le; 2.0%</option>
          <option value="Any">Any</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-[var(--muted)]">Minimum age</span>
        <select value={minAge} onChange={e=>setMinAge(e.target.value)} className="bg-transparent border border-white/10 rounded-xl px-3 py-2">
          <option>All</option>
          <option>18+</option>
          <option>21+</option>
        </select>
      </label>
      <button className="rounded-xl px-4 py-2 bg-white/10 border border-white/10 justify-self-start">Apply Filters</button>
    </div>
  )
}
