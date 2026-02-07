"use client";

import { getCityById, searchPlacesByName, type Place } from "@/lib/nzCities";
import { fetchPlaceCoordinates } from "@/lib/trip-planner/useTripPlanner.api";
import { pushRecent } from "@/lib/trip-planner/useTripPlanner.utils";
import type { CityLite } from "@/lib/trip-planner/utils";

/**
 * City selection logic for start and end cities
 */
export function useTripPlannerCitySelection(
  startSearchResults: CityLite[],
  endSearchResults: CityLite[],
  recent: CityLite[],
  setRecent: (recent: CityLite[]) => void,
  setStartCityId: (id: string) => void,
  setEndCityId: (id: string) => void,
  setStartCityData: (city: Place | null) => void,
  setEndCityData: (city: Place | null) => void,
  setStartQuery: (query: string) => void,
  setEndQuery: (query: string) => void,
  setWhereStep: (step: "start" | "end") => void,
  startCity: Place | undefined
) {
  async function selectStartCity(cityId: string) {
    // Try to get from cache first
    let c: Place | null = getCityById(cityId) || null;
    
    // If not in cache, fetch from database
    if (!c) {
      c = await fetchPlaceCoordinates(cityId);
      
      // If still not found, try search results as fallback
      if (!c) {
        const found = startSearchResults.find((r) => r.id === cityId);
        if (found) {
          c = await fetchPlaceCoordinates(found.id, found.name);
        }
      }
    }
    
    if (!c) {
      // Last resort: try querying database directly by name if we have search results
      const found = startSearchResults.find((r) => r.id === cityId);
      if (found) {
        // Try one more direct database query by name as fallback
        const searchResults = await searchPlacesByName(found.name, 1);
        if (searchResults.length > 0 && searchResults[0].id === cityId) {
          c = searchResults[0];
        } else {
          console.error(`Could not find place in database: ${found.name} (${cityId})`);
          return;
        }
      } else {
        console.error(`Could not find place: ${cityId}`);
        return;
      }
    }

    // Validate coordinates before storing
    if ((c.lat === 0 && c.lng === 0) || !c.lat || !c.lng) {
      console.error(`Place ${c.name} (${cityId}) has invalid coordinates: lat=${c.lat}, lng=${c.lng}`);
    }

    // Store the city data in state so it's immediately available
    setStartCityData(c);
    setStartCityId(cityId);
    setStartQuery(c.display_name || c.name);
    setRecent(pushRecent({ id: c.id, name: c.display_name || c.name }, recent));
    setWhereStep("end");
  }

  async function selectEndCity(cityId: string) {
    // Try to get from cache first
    let c: Place | null = getCityById(cityId) || null;
    
    // If not in cache, fetch from database
    if (!c) {
      c = await fetchPlaceCoordinates(cityId);
      
      // If still not found, try search results as fallback
      if (!c) {
        const found = endSearchResults.find((r) => r.id === cityId);
        if (found) {
          c = await fetchPlaceCoordinates(found.id, found.name);
        }
      }
    }
    
    if (!c) {
      // Last resort: try querying database directly by name if we have search results
      const found = endSearchResults.find((r) => r.id === cityId);
      if (found) {
        // Try one more direct database query by name as fallback
        const searchResults = await searchPlacesByName(found.name, 1);
        if (searchResults.length > 0 && searchResults[0].id === cityId) {
          c = searchResults[0];
        } else {
          console.error(`Could not find place in database: ${found.name} (${cityId})`);
          return;
        }
      } else {
        console.error(`Could not find place: ${cityId}`);
        return;
      }
    }

    // Validate coordinates before storing
    if ((c.lat === 0 && c.lng === 0) || !c.lat || !c.lng) {
      console.error(`Place ${c.name} (${cityId}) has invalid coordinates: lat=${c.lat}, lng=${c.lng}`);
    }

    // Store the city data in state so it's immediately available
    setEndCityData(c);
    setEndCityId(cityId);
    setEndQuery(c.display_name || c.name);
    setRecent(pushRecent({ id: c.id, name: c.display_name || c.name }, recent));
  }

  function selectReturnToStart() {
    if (!startCity) return;
    setEndCityId(startCity.id);
    setEndQuery("Return to start city");
  }

  return {
    selectStartCity,
    selectEndCity,
    selectReturnToStart,
  };
}
