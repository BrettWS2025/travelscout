import type { DayDetail, ManualTripEntry, MapPoint } from "@/lib/trip-planner/utils";

export type { ManualEntrySection, ManualTripEntry } from "@/lib/trip-planner/utils";

/** Lat/lng from a Google-resolved manual hotel on this day (for anchoring nearby restaurants). */
export function getResolvedHotelCoords(detail: DayDetail | undefined): { lat: number; lng: number } | undefined {
  const h = detail?.manualEntries?.find((e) => e.section === "hotel");
  if (!h) return undefined;
  const lat = h.place?.lat ?? h.lat;
  const lng = h.place?.lng ?? h.lng;
  if (typeof lat !== "number" || typeof lng !== "number") return undefined;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  return { lat, lng };
}

/** Resolved manual hotel with a display name (for map pins / labels). */
export function getResolvedHotelPin(
  detail: DayDetail | undefined
): { lat: number; lng: number; label: string } | undefined {
  const coords = getResolvedHotelCoords(detail);
  if (!coords) return undefined;
  const h = detail?.manualEntries?.find((e) => e.section === "hotel");
  const label = (h?.place?.name || h?.name || "Your hotel").trim() || "Your hotel";
  return { ...coords, label };
}

export function createManualEntryId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `me_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Map markers for manual entries that have coordinates (summary / route map). */
export function collectManualMapPoints(
  dayDetails: Record<string, DayDetail> | undefined | null
): MapPoint[] {
  if (!dayDetails) return [];
  const out: MapPoint[] = [];
  const seen = new Set<string>();

  for (const detail of Object.values(dayDetails)) {
    const entries = detail.manualEntries;
    if (!entries?.length) continue;
    for (const e of entries) {
      const lat = e.lat ?? e.place?.lat;
      const lng = e.lng ?? e.place?.lng;
      if (typeof lat !== "number" || typeof lng !== "number") continue;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const label = e.place?.name || e.name || e.locationText || "Your place";
      const key = `${lat.toFixed(5)},${lng.toFixed(5)},${label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ lat, lng, name: label });
    }
  }
  return out;
}
