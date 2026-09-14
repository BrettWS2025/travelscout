"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MapPin, Search } from "lucide-react";

export const NZ_REGIONS = [
  "Northland",
  "Auckland",
  "Coromandel",
  "Waikato",
  "Bay of Plenty",
  "Rotorua",
  "Taupō",
  "Hawke's Bay",
  "Taranaki",
  "Manawatū",
  "Wellington",
  "Nelson / Tasman",
  "Marlborough",
  "West Coast",
  "Canterbury",
  "Mackenzie",
  "Queenstown",
  "Wānaka",
  "Fiordland",
  "Southland",
] as const;

export function HeroRegionSearch() {
  const router = useRouter();
  const [region, setRegion] = useState("");

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = region.trim();
    if (!trimmed) {
      router.push("/find-deals");
      return;
    }
    router.push(`/find-deals?region=${encodeURIComponent(trimmed)}`);
  };

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto w-full max-w-xl"
      aria-label="Search deals by region"
    >
      <label htmlFor="hero-region" className="sr-only">
        Search by region
      </label>
      <div className="flex flex-col gap-2 rounded-2xl border border-white/20 bg-white/12 p-2 text-left shadow-[0_20px_50px_rgba(0,0,0,0.25)] backdrop-blur-md sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-3 px-3 py-2">
          <MapPin className="h-5 w-5 shrink-0 text-[var(--ts-lime)]" />
          <input
            id="hero-region"
            list="nz-regions"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            placeholder="Queenstown, Rotorua, Bay of Plenty…"
            className="w-full bg-transparent font-[family-name:var(--font-sora)] text-base text-white outline-none placeholder:text-white/55"
            autoComplete="off"
          />
          <datalist id="nz-regions">
            {NZ_REGIONS.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </div>
        <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--ts-lime)] px-5 py-3 font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--ts-ink)] transition hover:brightness-105"
        >
          <Search className="h-4 w-4" />
          Find deals
        </button>
      </div>
    </form>
  );
}
