/**
 * Places helpers backed by `nz_places_final`.
 * Used for geolocation → region defaulting on search surfaces.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { canonicalizeRegion, mergeRegionLists, NZ_REGIONS_ALPHA } from "./regions";

export type NearbyPlace = {
  id: string;
  name: string;
  displayName?: string;
  lat: number;
  lng: number;
  regionName: string | null;
  /** Canonical TravelScout region used for search / operators. */
  region: string | null;
};

function createAnonClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function mapPlaceRow(row: {
  id: string | number;
  name: string;
  display_name?: string | null;
  lat: number;
  lon: number;
  region_name?: string | null;
}): NearbyPlace {
  const regionName = row.region_name?.trim() || null;
  return {
    id: String(row.id),
    name: row.name,
    displayName: row.display_name ?? undefined,
    lat: row.lat,
    lng: row.lon,
    regionName,
    region: canonicalizeRegion(regionName),
  };
}

/**
 * Distinct region names from `nz_places_final`, normalized to the canonical list.
 * Falls back to the static NZ region list when the DB is unavailable.
 */
export async function listNzRegions(
  client?: SupabaseClient | null
): Promise<string[]> {
  const supabase = client ?? createAnonClient();
  if (!supabase) return [...NZ_REGIONS_ALPHA];

  try {
    const { data, error } = await supabase.rpc("list_nz_regions");
    if (!error && Array.isArray(data) && data.length > 0) {
      const names = data
        .map((row: { region_name?: string } | string) =>
          typeof row === "string" ? row : row.region_name
        )
        .filter((v): v is string => typeof v === "string" && !!v.trim());
      return mergeRegionLists(names);
    }
  } catch {
    // Fall through to table select
  }

  const { data, error } = await supabase
    .from("nz_places_final")
    .select("region_name")
    .not("region_name", "is", null)
    .limit(5000);

  if (error || !data) {
    return [...NZ_REGIONS_ALPHA];
  }

  const distinct = Array.from(
    new Set(
      data
        .map((r: { region_name: string | null }) => r.region_name?.trim() || "")
        .filter(Boolean)
    )
  );
  return mergeRegionLists(distinct);
}

/**
 * Find the nearest city/town/village/hamlet to a point, preferring places
 * that already have a `region_name` so search can default correctly.
 */
export async function findNearestPlace(
  lat: number,
  lng: number,
  radiusKm = 50,
  client?: SupabaseClient | null
): Promise<NearbyPlace | null> {
  const supabase = client ?? createAnonClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase.rpc("find_nearest_nz_place", {
      p_lat: lat,
      p_lon: lng,
      p_radius_m: radiusKm * 1000,
    });
    if (!error && Array.isArray(data) && data.length > 0) {
      return mapPlaceRow(data[0]);
    }
  } catch {
    // Fall through to bounding-box query
  }

  const latRadius = radiusKm / 111;
  const lngRadius = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));

  const { data, error } = await supabase
    .from("nz_places_final")
    .select("id, name, display_name, lat, lon, region_name, place_type")
    .in("place_type", ["city", "town", "village", "hamlet"])
    .gte("lat", lat - latRadius)
    .lte("lat", lat + latRadius)
    .gte("lon", lng - lngRadius)
    .lte("lon", lng + lngRadius)
    .limit(200);

  if (error || !data || data.length === 0) return null;

  const ranked = data
    .map((row) => ({
      row,
      distance: haversineKm(lat, lng, row.lat, row.lon),
    }))
    .filter((item) => item.distance <= radiusKm)
    .sort((a, b) => {
      const aHasRegion = a.row.region_name ? 0 : 1;
      const bHasRegion = b.row.region_name ? 0 : 1;
      if (aHasRegion !== bHasRegion) return aHasRegion - bHasRegion;
      return a.distance - b.distance;
    });

  if (ranked.length === 0) return null;
  return mapPlaceRow(ranked[0].row);
}

/** Rough NZ mainland / island bounds check. */
export function isInsideNewZealand(lat: number, lng: number): boolean {
  return lat >= -47.5 && lat <= -34 && lng >= 166 && lng <= 179.5;
}
