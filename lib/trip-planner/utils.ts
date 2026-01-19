import { buildLegsFromPoints, type TripLeg } from "@/lib/itinerary";
import { NZ_CITIES } from "@/lib/nzCities";
import { getPlacesCache } from "@/lib/places";

export type MapPoint = {
  lat: number;
  lng: number;
  name?: string;
};

export type DayDetail = {
  notes: string;
  accommodation: string;
  isOpen: boolean;
};

export type DayStopMeta = {
  stopIndex: number;
  isFirstForStop: boolean;
};

export type CityLite = {
  id: string;
  name: string;
};

export const RECENT_KEY = "travelscout_recent_city_searches_v1";

export function formatDisplayDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatShortRangeDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
  });
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${Math.round(km)} km`;
}

export function formatDriveHours(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;

  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr${h > 1 ? "s" : ""}`;
  return `${h} hr${h > 1 ? "s" : ""} ${m} min`;
}

export function makeDayKey(date: string, location: string): string {
  return `${date}__${location}`;
}

export function toIsoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function fromIsoDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export async function fetchRoadLegs(points: MapPoint[]): Promise<TripLeg[]> {
  if (!points || points.length < 2) return [];

  // Validate all points have valid coordinates
  const invalidPoints = points.filter((p) => 
    p.lat === 0 && p.lng === 0 || 
    p.lat < -90 || p.lat > 90 || 
    p.lng < -180 || p.lng > 180
  );
  
  if (invalidPoints.length > 0) {
    console.error("Invalid coordinates in points:", invalidPoints);
    throw new Error(`Invalid coordinates detected for: ${invalidPoints.map(p => p.name).join(", ")}`);
  }

  const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=false&geometries=polyline&steps=false`;

  console.log("Fetching route from OSRM:", { 
    pointCount: points.length, 
    points: points.map(p => ({ name: p.name, lat: p.lat, lng: p.lng })),
    url 
  });

  const res = await fetch(url);
  if (!res.ok) {
    const errorText = await res.text();
    console.error("OSRM request failed:", { status: res.status, error: errorText });
    throw new Error(`OSRM request failed with status ${res.status}: ${errorText}`);
  }

  const data = await res.json();
  const route = data.routes?.[0];
  const legsData =
    (route?.legs as { distance: number; duration: number }[]) || [];

  if (!route || !Array.isArray(legsData)) {
    console.error("OSRM response invalid:", data);
    throw new Error("OSRM response did not contain route legs");
  }

  const legs = legsData.map((leg, idx) => ({
    from: points[idx].name ?? `Stop ${idx + 1}`,
    to: points[idx + 1].name ?? `Stop ${idx + 2}`,
    distanceKm: leg.distance / 1000,
    driveHours: leg.duration / 3600,
  }));

  console.log("OSRM route calculated:", legs);
  return legs;
}

/**
 * A safe fallback for road legs. Useful if OSRM fails.
 */
export function buildFallbackLegs(points: MapPoint[]): TripLeg[] {
  return buildLegsFromPoints(points);
}

export function allocateNightsForStops(stopCount: number, totalDays: number): number[] {
  if (stopCount <= 0 || totalDays <= 0) return [];

  const nights = new Array(stopCount).fill(1);
  let remaining = totalDays - stopCount;

  let idx = 0;
  while (remaining > 0) {
    nights[idx % stopCount]++;
    idx++;
    remaining--;
  }

  return nights;
}

export function buildDayStopMeta(stops: string[], nightsPerStop: number[]): DayStopMeta[] {
  const meta: DayStopMeta[] = [];
  for (let i = 0; i < stops.length; i++) {
    const nights = nightsPerStop[i] ?? 0;
    for (let n = 0; n < nights; n++) {
      meta.push({ stopIndex: i, isFirstForStop: n === 0 });
    }
  }
  return meta;
}

export function normalize(s: string) {
  return s.trim().toLowerCase();
}

export function safeReadRecent(): CityLite[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CityLite[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x) => x && typeof x.id === "string" && typeof x.name === "string"
    );
  } catch {
    return [];
  }
}

export function safeWriteRecent(items: CityLite[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(items.slice(0, 8)));
  } catch {
    // ignore
  }
}

export function pickSuggestedCities(): CityLite[] {
  // Try to get from cache first (most up-to-date), then fallback to NZ_CITIES
  const cache = getPlacesCache();
  const cities = (cache && cache.length > 0) ? cache : (NZ_CITIES.length > 0 ? NZ_CITIES : []);
  
  const ranked = cities.filter((c) => typeof c.rank === "number")
    .sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999))
    .slice(0, 6)
    .map((c) => ({ id: c.id, name: c.name }));

  if (ranked.length >= 4) return ranked;
  return cities.slice(0, 6).map((c) => ({ id: c.id, name: c.name }));
}
