"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { RegionPicker } from "@/components/RegionPicker";
import { useGeolocationRegion } from "@/hooks/useGeolocationRegion";
import { canonicalizeRegion } from "@/lib/regions";

export { NZ_REGIONS } from "@/components/RegionPicker";

export function HeroRegionSearch() {
  const router = useRouter();
  const [region, setRegion] = useState("");
  const [userPicked, setUserPicked] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const { region: detectedRegion, isLoading: locating } =
    useGeolocationRegion(true);

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
        className="liquid-glass flex flex-col gap-2 p-2 text-left sm:flex-row sm:items-center"
      >
        <RegionPicker
          value={region}
          onChange={onRegionChange}
          variant="hero"
          placeholder={
            locating
              ? "Detecting your region…"
              : "Auckland, Otago, Canterbury…"
          }
          dropdownAnchorRef={shellRef}
        />
        <button
          type="submit"
          className="liquid-glass-cta inline-flex shrink-0 items-center justify-center gap-2 px-5 py-3 font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--ts-ink)] transition hover:brightness-105"
        >
          <Search className="h-4 w-4" />
          Find deals
        </button>
      </div>
    </form>
  );
}
