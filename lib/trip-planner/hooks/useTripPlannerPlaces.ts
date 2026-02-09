"use client";

import { useMemo, useState } from "react";
import { getCityById, type Place } from "@/lib/nzCities";
import { NZ_STOPS } from "@/lib/nzStops";
import type { CityLite } from "@/lib/trip-planner/utils";
import { pushRecent } from "@/lib/trip-planner/useTripPlanner.utils";
import { fetchPlaceCoordinates } from "@/lib/trip-planner/useTripPlanner.api";

/**
 * Places and Things selection state and logic
 */
export function useTripPlannerPlaces(
  recent: CityLite[],
  setRecent: (recent: CityLite[]) => void,
  placesSearchResults: CityLite[]
) {
  const [selectedPlaceIds, setSelectedPlaceIds] = useState<string[]>([]);
  const [selectedPlaceData, setSelectedPlaceData] = useState<Map<string, Place>>(new Map());
  const [selectedThingIds, setSelectedThingIds] = useState<string[]>([]);

  const selectedPlaces = useMemo(() => {
    return selectedPlaceIds.map((id) => {
      // First try stored data, then cache lookup
      return selectedPlaceData.get(id) || getCityById(id);
    }).filter((c): c is NonNullable<typeof c> => c !== undefined);
  }, [selectedPlaceIds, selectedPlaceData]);

  const selectedThings = useMemo(() => {
    return selectedThingIds.map((id) => NZ_STOPS.find((s) => s.id === id)).filter((s): s is NonNullable<typeof s> => s !== undefined);
  }, [selectedThingIds]);

  const placesSummary = selectedPlaces.length > 0 
    ? `${selectedPlaces.length} place${selectedPlaces.length > 1 ? 's' : ''} selected`
    : "Add trip stops";

  const thingsSummary = selectedThings.length > 0
    ? `${selectedThings.length} thing${selectedThings.length > 1 ? 's' : ''} selected`
    : "Add things to do";

  async function selectPlace(cityId: string) {
    try {
      // Try to get from cache first
      let c: Place | null | undefined = getCityById(cityId);
      
      // If not in cache, fetch from database
      if (!c) {
        c = await fetchPlaceCoordinates(cityId);
      }
      
      // If still not found, try search results as fallback
      if (!c) {
        const found = placesSearchResults.find((r) => r.id === cityId);
        if (found) {
          c = await fetchPlaceCoordinates(found.id, found.name);
        }
      }
      
      if (!c) {
        console.error(`Could not find place with ID: ${cityId}`);
        return;
      }

      // Validate coordinates - allow if they're in valid range (not just check for 0,0)
      const hasValidCoords = (c.lat >= -90 && c.lat <= 90 && c.lng >= -180 && c.lng <= 180);
      if (!hasValidCoords || (c.lat === 0 && c.lng === 0)) {
        console.warn(`Place ${c.name} has invalid coordinates (lat=${c.lat}, lng=${c.lng}), but adding anyway - will try to fetch coordinates later`);
      }

      // Add to array if not already selected
      if (!selectedPlaceIds.includes(cityId)) {
        setSelectedPlaceIds([...selectedPlaceIds, cityId]);
        // Store the place data
        setSelectedPlaceData((prev) => new Map(prev).set(cityId, c));
      }
      setRecent(pushRecent({ id: c.id, name: c.name }, recent));
    } catch (error) {
      console.error("Error selecting place:", error);
    }
  }

  function removePlace(cityId: string) {
    setSelectedPlaceIds(selectedPlaceIds.filter((id) => id !== cityId));
    setSelectedPlaceData((prev) => {
      const next = new Map(prev);
      next.delete(cityId);
      return next;
    });
  }

  function selectThing(stopId: string) {
    const stop = NZ_STOPS.find((s) => s.id === stopId);
    if (!stop) return;

    // Add to array if not already selected
    if (!selectedThingIds.includes(stopId)) {
      setSelectedThingIds([...selectedThingIds, stopId]);
    }
  }

  function removeThing(stopId: string) {
    setSelectedThingIds(selectedThingIds.filter((id) => id !== stopId));
  }

  return {
    selectedPlaceIds,
    setSelectedPlaceIds,
    selectedPlaceData,
    setSelectedPlaceData,
    selectedThingIds,
    setSelectedThingIds,
    selectedPlaces,
    selectedThings,
    placesSummary,
    thingsSummary,
    selectPlace,
    removePlace,
    selectThing,
    removeThing,
  };
}
