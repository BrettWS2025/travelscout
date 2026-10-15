"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { RegionPicker } from "@/components/RegionPicker";
import { useGeolocationRegion } from "@/hooks/useGeolocationRegion";
import { canonicalizeRegion } from "@/lib/regions";

type FindDealsRegionSearchProps = {
  initialRegion?: string;
};

export function FindDealsRegionSearch({
  initialRegion = "",
}: FindDealsRegionSearchProps) {
  const router = useRouter();
  const canonicalInitial = canonicalizeRegion(initialRegion) ?? "";
  const [region, setRegion] = useState(canonicalInitial);
  const [userPicked, setUserPicked] = useState(!!canonicalInitial);
  const shellRef = useRef<HTMLDivElement>(null);
  const { region: detectedRegion, isLoading: locating } = useGeolocationRegion(
    !canonicalInitial
  );

  useEffect(() => {
    if (userPicked || region) return;
    if (!detectedRegion) return;
    setRegion(detectedRegion);
  }, [detectedRegion, region, userPicked]);

  const onRegionChange = (next: string) => {
    setUserPicked(true);
    setRegion(next);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = region.trim();
    if (!trimmed) {
      router.push("/find-deals");
      return;
    }
    const canonical = canonicalizeRegion(trimmed);
    if (!canonical) {
      router.push("/find-deals");
      return;
    }
    router.push(`/find-deals?region=${encodeURIComponent(canonical)}`);
  };

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto w-full max-w-xl"
      aria-label="Search deals by region"
    >
      <div
        ref={shellRef}
        className="flex flex-col gap-2 rounded-2xl border border-[var(--ts-ink)]/10 bg-white/80 p-2 text-left shadow-[0_24px_60px_rgba(16,36,28,0.08)] backdrop-blur-md sm:flex-row sm:items-center"
      >
        <RegionPicker
          value={region}
          onChange={onRegionChange}
          variant="light"
          placeholder={
            locating && !region
              ? "Detecting your region…"
              : "Auckland, Otago, Canterbury…"
          }
          dropdownAnchorRef={shellRef}
        />
        <button
          type="submit"
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[var(--ts-ink)] px-5 py-3 font-[family-name:var(--font-sora)] text-sm font-semibold text-white transition hover:bg-[var(--ts-teal)]"
        >
          <Search className="h-4 w-4" />
          Search deals
        </button>
      </div>
    </form>
  );
}
