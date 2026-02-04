// lib/nzCities.ts
// Backward compatibility wrapper for places service
// This file maintains the same interface as before but now uses Supabase

export type {
  NzCity,
  Place,
  Place as PlaceType,
} from "@/lib/places";

// Re-export from places service
export {
  NZ_CITIES,
  DEFAULT_START_CITY_ID,
  DEFAULT_END_CITY_ID,
  getCityById,
  getAllPlaces,
  getPlaceById,
  getSuggestedPlaces,
  searchPlacesByName,
  findPlacesNearby,
  clearPlacesCache,
} from "@/lib/places";
