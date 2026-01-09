// lib/places.ts
// Service layer for querying places from Supabase
// Replaces the static NZCities library

import { supabase } from "@/lib/supabase/client";

export type Place = {
  id: string; // short code, typically IATA in lowercase (e.g. "akl")
  name: string; // display name
  lat: number;
  lng: number;
  /**
   * Optional UI ranking for suggestions / ordering.
   * Lower = more prominent (e.g. 1 is top suggested).
   */
  rank?: number;
  geometry?: unknown; // PostGIS geometry (internal use, not typically needed in frontend)
  created_at?: string;
  updated_at?: string;
};

// Type alias for backward compatibility
export type NzCity = Place;

// Cache for places to avoid repeated queries
let placesCache: Place[] | null = null;
let cacheTimestamp: number | null = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch all places from Supabase
 * Results are cached for 5 minutes
 */
export async function getAllPlaces(): Promise<Place[]> {
  // Return cached data if still valid
  if (placesCache && cacheTimestamp && Date.now() - cacheTimestamp < CACHE_DURATION) {
    return placesCache;
  }

  const { data, error } = await supabase
    .from("places")
    .select("id, name, lat, lng, rank")
    .order("rank", { ascending: true, nullsLast: true })
    .order("name", { ascending: true });

  if (error) {
    console.error("Error fetching places:", error);
    // Return empty array on error, or could throw if preferred
    return [];
  }

  placesCache = (data || []) as Place[];
  cacheTimestamp = Date.now();
  return placesCache;
}

/**
 * Get a place by its ID
 */
export async function getPlaceById(id: string): Promise<Place | undefined> {
  const places = await getAllPlaces();
  return places.find((p) => p.id === id);
}

/**
 * Get a place by its ID (synchronous version using cache)
 * Returns undefined if cache is not populated yet
 */
export function getPlaceByIdSync(id: string): Place | undefined {
  if (!placesCache) return undefined;
  return placesCache.find((p) => p.id === id);
}

/**
 * Get suggested cities (those with rank, ordered by rank)
 * Returns top 6 ranked places
 */
export async function getSuggestedPlaces(count: number = 6): Promise<Place[]> {
  const places = await getAllPlaces();
  const ranked = places
    .filter((p) => typeof p.rank === "number")
    .sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999))
    .slice(0, count);

  if (ranked.length >= 4) return ranked;
  
  // Fallback: return first N places if not enough ranked
  return places.slice(0, count);
}

/**
 * Search places by name (case-insensitive partial match)
 */
export async function searchPlacesByName(query: string, limit: number = 20): Promise<Place[]> {
  if (!query.trim()) return [];

  const { data, error } = await supabase
    .from("places")
    .select("id, name, lat, lng, rank")
    .ilike("name", `%${query}%`)
    .limit(limit);

  if (error) {
    console.error("Error searching places:", error);
    return [];
  }

  return (data || []) as Place[];
}

/**
 * Find places within a radius (using PostGIS)
 * @param centerLat Latitude of center point
 * @param centerLng Longitude of center point
 * @param radiusKm Radius in kilometers
 */
export async function findPlacesNearby(
  centerLat: number,
  centerLng: number,
  radiusKm: number = 50
): Promise<Place[]> {
  // Convert radius from km to degrees (approximate: 1 degree ≈ 111 km)
  // For more accurate results, we use PostGIS distance functions
  const { data, error } = await supabase.rpc("find_places_within_radius", {
    center_lat: centerLat,
    center_lng: centerLng,
    radius_km: radiusKm,
  });

  if (error) {
    console.error("Error finding nearby places:", error);
    // Fallback to simple distance calculation if RPC doesn't exist
    return findPlacesNearbyFallback(centerLat, centerLng, radiusKm);
  }

  return (data || []) as Place[];
}

/**
 * Fallback function using haversine formula when PostGIS function isn't available
 */
async function findPlacesNearbyFallback(
  centerLat: number,
  centerLng: number,
  radiusKm: number
): Promise<Place[]> {
  const places = await getAllPlaces();
  
  return places.filter((place) => {
    const distance = haversineDistance(centerLat, centerLng, place.lat, place.lng);
    return distance <= radiusKm;
  });
}

/**
 * Haversine formula to calculate distance between two points
 */
function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth radius in kilometers
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Clear the places cache (useful after bulk updates)
 */
export function clearPlacesCache(): void {
  placesCache = null;
  cacheTimestamp = null;
}

// Default city IDs for backward compatibility
export const DEFAULT_START_CITY_ID = "chc"; // Christchurch
export const DEFAULT_END_CITY_ID = "zqn"; // Queenstown

// Fallback static data for initial render before Supabase data loads
const FALLBACK_CITIES: Place[] = [
  { id: "akl", name: "Auckland", lat: -36.850886, lng: 174.764509, rank: 1 },
  { id: "wlg", name: "Wellington", lat: -41.276878, lng: 174.773146, rank: 2 },
  { id: "chc", name: "Christchurch", lat: -43.532043, lng: 172.630606, rank: 3 },
  { id: "zqn", name: "Queenstown", lat: -45.03023, lng: 168.66271, rank: 4 },
  { id: "dud", name: "Dunedin", lat: -45.8742, lng: 170.5036, rank: 9 },
  { id: "hlz", name: "Hamilton", lat: -37.7833, lng: 175.2833, rank: 6 },
  { id: "trg", name: "Tauranga", lat: -37.6869, lng: 176.1653, rank: 7 },
  { id: "rot", name: "Rotorua", lat: -38.1381, lng: 176.2529, rank: 10 },
  { id: "gis", name: "Gisborne", lat: -38.6623, lng: 178.0176 },
  { id: "npe", name: "Napier", lat: -39.4928, lng: 176.912, rank: 12 },
  { id: "npl", name: "New Plymouth", lat: -39.057, lng: 174.075 },
  { id: "pmr", name: "Palmerston North", lat: -40.3564, lng: 175.611 },
  { id: "tuo", name: "Taupō", lat: -38.6857, lng: 176.0702 },
  { id: "wag", name: "Whanganui", lat: -39.931, lng: 175.05 },
  { id: "whk", name: "Whakatāne", lat: -37.958, lng: 176.984 },
  { id: "wre", name: "Whangārei", lat: -35.725, lng: 174.323 },
  { id: "kke", name: "Kerikeri", lat: -35.228, lng: 173.947 },
  { id: "kat", name: "Kaitaia", lat: -35.113, lng: 173.262 },
  { id: "nsn", name: "Nelson", lat: -41.2706, lng: 173.284, rank: 11 },
  { id: "bhe", name: "Blenheim", lat: -41.5134, lng: 173.9612 },
  { id: "hkk", name: "Hokitika", lat: -42.7167, lng: 170.9667 },
  { id: "ivc", name: "Invercargill", lat: -46.4132, lng: 168.3538 },
  { id: "tiu", name: "Timaru", lat: -44.396, lng: 171.2536 },
];

// For backward compatibility with existing code that expects synchronous access
// Initialize with fallback data, will be replaced by Supabase data once loaded
export let NZ_CITIES: Place[] = [...FALLBACK_CITIES];

// Initialize cache on module load (non-blocking)
if (typeof window !== "undefined") {
  getAllPlaces()
    .then((places) => {
      if (places.length > 0) {
        NZ_CITIES = places;
        placesCache = places;
      }
    })
    .catch((error) => {
      console.error("Failed to load places from Supabase:", error);
      // Keep fallback data if load fails
    });
}

// Synchronous getter for backward compatibility
// Note: Returns undefined until cache is populated
export function getCityById(id: string): Place | undefined {
  if (placesCache) {
    return placesCache.find((c) => c.id === id);
  }
  return NZ_CITIES.find((c) => c.id === id);
}

