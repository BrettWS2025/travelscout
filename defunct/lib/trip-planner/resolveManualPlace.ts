import type { NearbyPlace } from "@/lib/hooks/useNearbyPlaces";

export type ResolvePlaceOptions = {
  /** Search radius in metres (default 60000). Server uses up to 50km for the Google circle, then filters to this. */
  radiusMeters?: number;
  /** Prefer results inside the circle and filter to `radiusMeters` (name-only hotel search near destination). */
  strictLocal?: boolean;
  /** Restrict to Google lodging type (hotels). */
  preferLodging?: boolean;
};

/**
 * Resolve a free-text place query via server Places text search (optional map bias).
 */
export async function resolvePlaceFromText(
  textQuery: string,
  bias?: { lat: number; lng: number },
  options?: ResolvePlaceOptions
): Promise<{ place: NearbyPlace | null; error?: string }> {
  const q = textQuery.trim();
  if (!q) return { place: null };

  const sp = new URLSearchParams();
  sp.set("textQuery", q);
  if (bias && Number.isFinite(bias.lat) && Number.isFinite(bias.lng)) {
    sp.set("lat", String(bias.lat));
    sp.set("lng", String(bias.lng));
  }
  const radius = options?.radiusMeters ?? 60000;
  sp.set("radiusMeters", String(radius));
  if (options?.strictLocal) sp.set("strict", "1");
  if (options?.preferLodging) sp.set("preferLodging", "1");

  const res = await fetch(`/api/google-places-text-search?${sp.toString()}`);
  const data = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    place?: NearbyPlace | null;
    message?: string;
    error?: string;
  };

  if (!res.ok) {
    return {
      place: null,
      error: data?.message || data?.error || "Could not look up that place",
    };
  }
  if (!data.success || !data.place) {
    return { place: null };
  }
  return { place: data.place };
}
