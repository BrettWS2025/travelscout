// lib/places.ts
// Service layer for querying places from Supabase
// Replaces the static NZCities library

import { supabase } from "@/lib/supabase/client";

export type Place = {
  id: string; // UUID from nz_places_final or short code from places table
  name: string; // city name (without region info) - used in itinerary
  display_name?: string; // full display name with region (e.g., "Auckland, Auckland, Auckland") - used in selection UI
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

// Export a getter for the cache (for use in pickSuggestedCities)
export function getPlacesCache(): Place[] | null {
  return placesCache;
}

/**
 * Fetch all places from Supabase
 * Results are cached for 5 minutes
 * Uses nz_places_final table only
 */
export async function getAllPlaces(): Promise<Place[]> {
  // Return cached data if still valid
  if (placesCache && cacheTimestamp && Date.now() - cacheTimestamp < CACHE_DURATION) {
    return placesCache;
  }

  const { data, error } = await supabase
    .from("nz_places_final")
    .select("id, name, display_name, lat, lon, tags")
    .in("place_type", ["city", "town", "village", "hamlet"])
    .order("name", { ascending: true });

  if (error) {
    console.error("Error fetching places:", error);
    // Return empty array on error, or could throw if preferred
    return [];
  }

  // Map nz_places_final data to Place format
  placesCache = (data || []).map((p: any) => ({
    id: p.id.toString(),
    name: p.name,
    display_name: p.display_name,
    lat: p.lat,
    lng: p.lon, // Note: nz_places_final uses 'lon' not 'lng'
    rank: p.tags?.population ? parseInt(p.tags.population) : undefined,
  })) as Place[];
  
  cacheTimestamp = Date.now();
  return placesCache;
}

/**
 * Get a place by its ID
 * Uses nz_places_final table only
 */
export async function getPlaceById(id: string): Promise<Place | undefined> {
  // First try cache
  const places = await getAllPlaces();
  const cached = places.find((p) => p.id === id);
  if (cached) return cached;
  
  // Query nz_places_final (by UUID)
  const { data: nzPlaceData, error: nzPlaceError } = await supabase
    .from("nz_places_final")
    .select("id, name, display_name, lat, lon, tags")
    .eq("id", id)
    .single();
  
  if (!nzPlaceError && nzPlaceData) {
    const place = {
      id: nzPlaceData.id.toString(),
      name: nzPlaceData.name,
      display_name: nzPlaceData.display_name,
      lat: nzPlaceData.lat,
      lng: nzPlaceData.lon,
      rank: nzPlaceData.tags?.population ? parseInt(nzPlaceData.tags.population) : undefined,
    };
    
    // Update cache with this place so it's available next time
    if (placesCache) {
      placesCache.push(place);
    }
    
    return place;
  }
  
  if (nzPlaceError) {
    console.warn(`Place not found in database: ${id}`, nzPlaceError);
  }
  
  return undefined;
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
 * Helper function to normalize search query (strip macrons, lowercase, trim)
 * This matches the normalization used in the name_search column
 */
function normalizeSearchQuery(query: string): string {
  return query
    .toLowerCase()
    .trim()
    .replace(/ā/g, 'a')
    .replace(/ē/g, 'e')
    .replace(/ī/g, 'i')
    .replace(/ō/g, 'o')
    .replace(/ū/g, 'u')
    .replace(/\s+/g, ' ');
}

/**
 * Search places by name (case-insensitive partial match)
 * Uses nz_places_final table and orders by population to ensure larger cities appear first
 * Now supports searching with or without macrons (e.g., "Otorohanga" will find "Ōtorohanga")
 */
export async function searchPlacesByName(query: string, limit: number = 20): Promise<Place[]> {
  if (!query.trim()) return [];

  // First, try searching nz_places_final (ordered by population)
  // Note: We'll sort by population in JavaScript since Supabase doesn't support nullsLast in order()
  const trimmedQuery = query.trim();
  const normalizedQuery = normalizeSearchQuery(trimmedQuery);
  const queryPattern = `%${normalizedQuery}%`;
  
  // Strategy: Search name_search field first (macron-stripped, for matching "Otorohanga" with "Ōtorohanga")
  // This ensures users can search without macrons and still find places with macrons
  let { data: nzPlacesData, error: nzPlacesError } = await supabase
    .from("nz_places_final")
    .select("id, name, display_name, lat, lon, tags, name_norm, name_search")
    .ilike("name_search", queryPattern)
    .in("place_type", ["city", "town", "village", "hamlet"])
    .limit(limit * 2);
  
  // If name_search doesn't return enough results, also search display_name and name_norm
  // But prioritize name_search matches
  if (!nzPlacesError && nzPlacesData && nzPlacesData.length < limit) {
    const { data: additionalData, error: additionalError } = await supabase
      .from("nz_places_final")
      .select("id, name, display_name, lat, lon, tags, name_norm, name_search")
      .or(`display_name.ilike.${queryPattern},name_norm.ilike.${queryPattern}`)
      .in("place_type", ["city", "town", "village", "hamlet"])
      .limit(limit * 2);
    
    if (!additionalError && additionalData) {
      // Merge results, avoiding duplicates
      const existingIds = new Set(nzPlacesData.map(p => p.id));
      const newResults = additionalData.filter(p => !existingIds.has(p.id));
      nzPlacesData = [...nzPlacesData, ...newResults];
    }
  }
  
  // Enhanced logging for debugging
  if (nzPlacesError) {
    console.error("[searchPlacesByName] Error searching nz_places_final:", {
      error: nzPlacesError,
      query: trimmedQuery,
      queryPattern
    });
  }
  
  // Debug logging for Wellington specifically
  if (trimmedQuery.toLowerCase() === "wellington") {
    const wellingtonFound = nzPlacesData?.find(p => p.name.toLowerCase() === "wellington");
    console.log("[searchPlacesByName] Wellington search - RAW RESULTS:", {
      hasError: !!nzPlacesError,
      resultCount: nzPlacesData?.length || 0,
      wellingtonFound: !!wellingtonFound,
      wellingtonData: wellingtonFound ? {
        id: wellingtonFound.id,
        name: wellingtonFound.name,
        display_name: wellingtonFound.display_name,
        name_norm: wellingtonFound.name_norm,
        population: wellingtonFound.tags?.population
      } : null,
      first10Results: nzPlacesData?.slice(0, 10).map(p => ({ 
        name: p.name, 
        display_name: p.display_name,
        name_norm: p.name_norm
      })) || []
    });
  }
  
  // Debug: log if no results found for common queries
  if (!nzPlacesError && (!nzPlacesData || nzPlacesData.length === 0) && trimmedQuery.toLowerCase() === "wellington") {
    console.warn("[searchPlacesByName] No results found for 'wellington' - this may indicate a query issue");
  }

  // If or() query failed, try a simpler name_search-only search as fallback
  if (nzPlacesError) {
    console.warn("[searchPlacesByName] or() query failed, trying name_search-only search", {
      error: nzPlacesError,
      query: trimmedQuery
    });
    
    // Fallback: search just the name_search field
    const { data: fallbackData, error: fallbackError } = await supabase
      .from("nz_places_final")
      .select("id, name, display_name, lat, lon, tags, name_norm, name_search")
      .ilike("name_search", queryPattern)
      .in("place_type", ["city", "town", "village", "hamlet"])
      .limit(limit * 2);
    
    if (!fallbackError && fallbackData) {
      nzPlacesData = fallbackData;
      nzPlacesError = null;
      console.log("[searchPlacesByName] Fallback name_search-only search succeeded", {
        resultCount: fallbackData.length
      });
    }
  }

  if (!nzPlacesError && nzPlacesData && nzPlacesData.length > 0) {
    const queryLower = query.toLowerCase().trim();
    
    // Sort with priority: exact match > prefix match > contains match, then by population
    const sorted = [...nzPlacesData].sort((a: any, b: any) => {
      const nameALower = a.name.toLowerCase();
      const nameBLower = b.name.toLowerCase();
      const displayALower = a.display_name?.toLowerCase() || "";
      
      // Priority 1: Exact name match
      const aExact = nameALower === queryLower;
      const bExact = nameBLower === queryLower;
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      
      // Priority 2: Name starts with query
      const aPrefix = nameALower.startsWith(queryLower);
      const bPrefix = nameBLower.startsWith(queryLower);
      if (aPrefix && !bPrefix) return -1;
      if (!aPrefix && bPrefix) return 1;
      
      // Priority 3: Display name starts with query (but name doesn't)
      const aDisplayPrefix = !aPrefix && displayALower.startsWith(queryLower);
      const bDisplayPrefix = !bPrefix && (b.display_name?.toLowerCase() || "").startsWith(queryLower);
      if (aDisplayPrefix && !bDisplayPrefix) return -1;
      if (!aDisplayPrefix && bDisplayPrefix) return 1;
      
      // Priority 4: Population (largest first)
      const popA = a.tags?.population ? parseInt(a.tags.population) : 0;
      const popB = b.tags?.population ? parseInt(b.tags.population) : 0;
      if (popA > 0 && popB > 0) {
        return popB - popA;
      }
      if (popA > 0 && popB === 0) return -1;
      if (popB > 0 && popA === 0) return 1;
      
      // Priority 5: Alphabetical by name
      return a.name.localeCompare(b.name);
    });
    
    // Map the search results to Place format and limit
    return sorted.slice(0, limit).map((p: any) => ({
      id: p.id.toString(), // Convert UUID to string
      name: p.name, // Just the name (without region) - for itinerary display
      display_name: p.display_name, // Full display name with region - for selection UI
      lat: p.lat,
      lng: p.lon, // Note: nz_places_final uses 'lon' not 'lng'
      rank: p.tags?.population ? parseInt(p.tags.population) : undefined,
    }));
  }

  // No results found in nz_places_final
  return [];
}

/**
 * Find places within a radius (using PostGIS)
 * Uses nz_places_final table only
 * @param centerLat Latitude of center point
 * @param centerLng Longitude of center point
 * @param radiusKm Radius in kilometers
 */
export async function findPlacesNearby(
  centerLat: number,
  centerLng: number,
  radiusKm: number = 50
): Promise<Place[]> {
  // Query nz_places_final and filter by distance using haversine formula
  // Note: For better performance with large datasets, consider creating a database function using ST_DWithin
  const { data, error } = await supabase
    .from("nz_places_final")
    .select("id, name, display_name, lat, lon, tags, geometry")
    .in("place_type", ["city", "town", "village", "hamlet"])
    .limit(50);

  if (error) {
    console.error("Error finding nearby places:", error);
    // Fallback to simple distance calculation if query fails
    return findPlacesNearbyFallback(centerLat, centerLng, radiusKm);
  }

  if (!data || data.length === 0) {
    return [];
  }

  // Filter places within radius using haversine (since Supabase client doesn't support ST_DWithin directly)
  // For better performance, we could create a database function, but this works for now
  const nearbyPlaces = data.filter((place: any) => {
    const distance = haversineDistance(centerLat, centerLng, place.lat, place.lon);
    return distance <= radiusKm;
  });

  // Sort by distance
  nearbyPlaces.sort((a: any, b: any) => {
    const distA = haversineDistance(centerLat, centerLng, a.lat, a.lon);
    const distB = haversineDistance(centerLat, centerLng, b.lat, b.lon);
    return distA - distB;
  });

  // Map to Place format
  return nearbyPlaces.map((p: any) => ({
    id: p.id.toString(),
    name: p.name,
    display_name: p.display_name,
    lat: p.lat,
    lng: p.lon,
    rank: p.tags?.population ? parseInt(p.tags.population) : undefined,
  }));
}

/**
 * Fallback function using haversine formula when PostGIS query fails
 * Uses nz_places_final via getAllPlaces()
 */
async function findPlacesNearbyFallback(
  centerLat: number,
  centerLng: number,
  radiusKm: number
): Promise<Place[]> {
  const places = await getAllPlaces();
  
  const nearby = places.filter((place) => {
    const distance = haversineDistance(centerLat, centerLng, place.lat, place.lng);
    return distance <= radiusKm;
  });
  
  // Sort by distance
  nearby.sort((a, b) => {
    const distA = haversineDistance(centerLat, centerLng, a.lat, a.lng);
    const distB = haversineDistance(centerLat, centerLng, b.lat, b.lng);
    return distA - distB;
  });
  
  return nearby;
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

