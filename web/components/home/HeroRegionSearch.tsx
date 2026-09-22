"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { RegionPicker } from "@/components/RegionPicker";

export { NZ_REGIONS } from "@/components/RegionPicker";

export function HeroRegionSearch() {
  const router = useRouter();
  const [region, setRegion] = useState("");
  const shellRef = useRef<HTMLDivElement>(null);

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
      <div
        ref={shellRef}
        className="flex flex-col gap-2 rounded-2xl border border-white/20 bg-white/12 p-2 text-left shadow-[0_20px_50px_rgba(0,0,0,0.25)] backdrop-blur-md sm:flex-row sm:items-center"
      >
        <RegionPicker
          value={region}
          onChange={setRegion}
          variant="hero"
          placeholder="Queenstown, Rotorua, Bay of Plenty…"
          dropdownAnchorRef={shellRef}
        />
        <button
          type="submit"
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[var(--ts-lime)] px-5 py-3 font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--ts-ink)] transition hover:brightness-105"
        >
          <Search className="h-4 w-4" />
          Find deals
        </button>
      </div>
    </form>
  );
}
