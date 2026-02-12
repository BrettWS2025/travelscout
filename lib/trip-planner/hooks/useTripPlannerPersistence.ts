"use client";

import { useState } from "react";
import type { TripInput, TripPlan } from "@/lib/itinerary";
import { NZ_CITIES } from "@/lib/nzCities";
import { NZ_STOPS } from "@/lib/nzStops";
import { saveItineraryToSupabase } from "@/lib/trip-planner/useTripPlanner.api";
import {
  buildDayStopMeta,
  fromIsoDate,
  type DayStopMeta,
  type MapPoint,
  type StartEndSectorType,
} from "@/lib/trip-planner/utils";
import { syncDayDetailsFromPlan } from "@/lib/trip-planner/useTripPlanner.utils";
import type { Place } from "@/lib/nzCities";
import type { User } from "@supabase/supabase-js";
import type { TripLeg } from "@/lib/itinerary";
import type { DayDetail } from "@/lib/trip-planner/utils";

/**
 * Persistence logic for saving and loading trip plans
 * Handles both Supabase (server) and localStorage (client) persistence
 */
export function useTripPlannerPersistence(
  // State values
  user: User | null,
  plan: TripPlan | null,
  startCity: Place | undefined,
  endCity: Place | undefined,
  startCityId: string,
  endCityId: string,
  startDate: string,
  endDate: string,
  selectedPlaceIds: string[],
  selectedThingIds: string[],
  selectedPlaces: Place[],
  selectedThings: Array<{ id: string; name: string; lat: number; lng: number }>,
  routeStops: string[],
  nightsPerStop: number[],
  dayStopMeta: DayStopMeta[],
  dayDetails: Record<string, DayDetail>,
  mapPoints: MapPoint[],
  legs: TripLeg[],
  startSectorType: StartEndSectorType,
  endSectorType: StartEndSectorType,
  // State setters
  setStartCityId: (id: string) => void,
  setEndCityId: (id: string) => void,
  setStartDate: (date: string) => void,
  setEndDate: (date: string) => void,
  setDateRange: (range: { from: Date; to: Date } | undefined) => void,
  setCalendarMonth: (month: Date) => void,
  setSelectedPlaceIds: (ids: string[]) => void,
  setSelectedThingIds: (ids: string[]) => void,
  setRouteStops: (stops: string[]) => void,
  setNightsPerStop: (nights: number[]) => void,
  setDayStopMeta: (meta: DayStopMeta[]) => void,
  setPlan: (plan: TripPlan | null) => void,
  setDayDetails: React.Dispatch<React.SetStateAction<Record<string, DayDetail>>>,
  setMapPoints: (points: MapPoint[]) => void,
  setLegs: (legs: TripLeg[]) => void,
  setHasSubmitted: (submitted: boolean) => void,
  setError: (error: string | null) => void,
  setStartSectorType: (type: StartEndSectorType) => void,
  setEndSectorType: (type: StartEndSectorType) => void
) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  /**
   * Save itinerary to Supabase
   */
  async function saveItinerary(
    title: string,
    itineraryId?: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!user) {
      return { success: false, error: "You must be logged in to save an itinerary" };
    }

    if (!plan || plan.days.length === 0) {
      return { success: false, error: "No itinerary to save" };
    }

    if (!startCity || !endCity) {
      return { success: false, error: "Start and end cities are required" };
    }

    if (!startDate || !endDate) {
      return { success: false, error: "Start and end dates are required" };
    }

    setSaving(true);
    setSaveError(null);

    try {
      // Build trip_input
      const waypoints: string[] = [];
      
      // Add selected places as waypoints
      selectedPlaces.forEach((city) => {
        if (city.name && city.name !== startCity.name && city.name !== endCity.name) {
          waypoints.push(city.name);
        }
      });

      // Add selected things (stops) as waypoints
      selectedThings.forEach((stop) => {
        if (stop.name && stop.name !== startCity.name && stop.name !== endCity.name) {
          waypoints.push(stop.name);
        }
      });

      const trip_input: TripInput = {
        startCity,
        endCity,
        startDate,
        endDate,
        waypoints,
      };

      // Build extended trip_plan with additional data
      const extended_trip_plan = {
        ...plan,
        routeStops,
        nightsPerStop,
        dayStopMeta,
        dayDetails,
        mapPoints,
        legs,
        selectedPlaceIds,
        selectedThingIds,
        startSectorType,
        endSectorType,
      };

      const result = await saveItineraryToSupabase(
        user.id,
        title || `Trip from ${startCity.name} to ${endCity.name}`,
        trip_input,
        extended_trip_plan,
        itineraryId
      );

      if (!result.success) {
        setSaveError(result.error || "Failed to save itinerary");
        return result;
      }

      setSaving(false);
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to save itinerary";
      setSaveError(errorMessage);
      setSaving(false);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Load itinerary from saved data
   */
  function loadItinerary(
    trip_input: TripInput,
    trip_plan: any
  ): { success: boolean; error?: string } {
    try {
      // Validate required data
      if (!trip_input || !trip_plan) {
        return { success: false, error: "Invalid itinerary data" };
      }

      if (!trip_input.startCity || !trip_input.endCity) {
        return { success: false, error: "Start and end cities are required" };
      }

      // Restore basic trip input
      setStartCityId(trip_input.startCity.id);
      setEndCityId(trip_input.endCity.id);
      setStartDate(trip_input.startDate);
      setEndDate(trip_input.endDate);

      // Restore date range
      const start = fromIsoDate(trip_input.startDate);
      const end = fromIsoDate(trip_input.endDate);
      if (start && end) {
        setDateRange({ from: start, to: end });
        setCalendarMonth(start);
      }

      // Restore selected places and things
      if (trip_plan.selectedPlaceIds && Array.isArray(trip_plan.selectedPlaceIds)) {
        setSelectedPlaceIds(trip_plan.selectedPlaceIds);
      } else {
        // Fall back to reconstructing from waypoints
        const waypoints = trip_input.waypoints || [];
        const placeIds: string[] = [];
        waypoints.forEach((waypoint: string) => {
          const city = NZ_CITIES.find((c) => c.name === waypoint);
          if (city) {
            placeIds.push(city.id);
          }
        });
        setSelectedPlaceIds(placeIds);
      }

      if (trip_plan.selectedThingIds && Array.isArray(trip_plan.selectedThingIds)) {
        setSelectedThingIds(trip_plan.selectedThingIds);
      } else {
        // Fall back to reconstructing from waypoints
        const waypoints = trip_input.waypoints || [];
        const thingIds: string[] = [];
        waypoints.forEach((waypoint: string) => {
          const stop = NZ_STOPS.find((s) => s.name === waypoint);
          if (stop) {
            thingIds.push(stop.id);
          }
        });
        setSelectedThingIds(thingIds);
      }

      // Restore route stops and nights
      const savedRouteStops = trip_plan.routeStops || [];
      const savedNightsPerStop = trip_plan.nightsPerStop || [];

      if (savedRouteStops.length > 0 && savedNightsPerStop.length > 0) {
        setRouteStops(savedRouteStops);
        setNightsPerStop(savedNightsPerStop);
        setDayStopMeta(buildDayStopMeta(savedRouteStops, savedNightsPerStop));
      }

      // Restore sector types (with fallback to infer from nightsPerStop for backward compatibility)
      if (trip_plan.startSectorType && (trip_plan.startSectorType === "road" || trip_plan.startSectorType === "itinerary")) {
        setStartSectorType(trip_plan.startSectorType);
      } else if (savedNightsPerStop.length > 0) {
        // Infer from nights: if first stop has 0 nights, it's a road sector
        setStartSectorType(savedNightsPerStop[0] === 0 ? "road" : "itinerary");
      }

      if (trip_plan.endSectorType && (trip_plan.endSectorType === "road" || trip_plan.endSectorType === "itinerary")) {
        setEndSectorType(trip_plan.endSectorType);
      } else if (savedNightsPerStop.length > 0) {
        // Infer from nights: if last stop has 0 nights, it's a road sector
        const lastIndex = savedNightsPerStop.length - 1;
        setEndSectorType(savedNightsPerStop[lastIndex] === 0 ? "road" : "itinerary");
      }

      // Restore plan
      if (trip_plan.days && trip_plan.days.length > 0) {
        setPlan(trip_plan);
        setDayDetails((prev) => syncDayDetailsFromPlan(trip_plan, prev));
      }

      // Restore day details
      if (trip_plan.dayDetails) {
        setDayDetails(trip_plan.dayDetails);
      }

      // Restore map points and legs
      if (trip_plan.mapPoints && trip_plan.mapPoints.length > 0) {
        setMapPoints(trip_plan.mapPoints);
      }

      if (trip_plan.legs && trip_plan.legs.length > 0) {
        setLegs(trip_plan.legs);
      }

      // Mark as submitted so the UI shows the plan
      setHasSubmitted(true);
      setError(null);

      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load itinerary";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Save current state to localStorage for persistence across navigation
   */
  function saveStateToLocalStorage(): void {
    try {
      if (!startCity || !endCity || !startDate || !endDate) {
        return; // Don't save incomplete state
      }

      const state = {
        startCityId,
        endCityId,
        startDate,
        endDate,
        selectedPlaceIds,
        selectedThingIds,
        routeStops,
        nightsPerStop,
        startSectorType,
        endSectorType,
        plan: plan ? {
          ...plan,
          routeStops,
          nightsPerStop,
          dayStopMeta,
          dayDetails,
          mapPoints,
          legs,
          selectedPlaceIds,
          selectedThingIds,
          startSectorType,
          endSectorType,
        } : null,
      };

      localStorage.setItem("tripPlanner_draft", JSON.stringify(state));
    } catch (err) {
      console.error("Failed to save trip planner state:", err);
    }
  }

  /**
   * Restore state from localStorage
   */
  function restoreStateFromLocalStorage(): boolean {
    try {
      const saved = localStorage.getItem("tripPlanner_draft");
      if (!saved) return false;

      const state = JSON.parse(saved);
      
      if (!state.startCityId || !state.endCityId || !state.startDate || !state.endDate) {
        return false;
      }

      // Restore basic trip input
      setStartCityId(state.startCityId);
      setEndCityId(state.endCityId);
      setStartDate(state.startDate);
      setEndDate(state.endDate);

      // Restore date range
      const start = fromIsoDate(state.startDate);
      const end = fromIsoDate(state.endDate);
      if (start && end) {
        setDateRange({ from: start, to: end });
        setCalendarMonth(start);
      }

      // Restore selected places and things
      if (state.selectedPlaceIds) {
        setSelectedPlaceIds(state.selectedPlaceIds);
      }
      if (state.selectedThingIds) {
        setSelectedThingIds(state.selectedThingIds);
      }

      // Restore route stops and nights
      if (state.routeStops && state.nightsPerStop) {
        setRouteStops(state.routeStops);
        setNightsPerStop(state.nightsPerStop);
        setDayStopMeta(buildDayStopMeta(state.routeStops, state.nightsPerStop));
      }

      // Restore sector types (with fallback to infer from nightsPerStop for backward compatibility)
      if (state.startSectorType && (state.startSectorType === "road" || state.startSectorType === "itinerary")) {
        setStartSectorType(state.startSectorType);
      } else if (state.nightsPerStop && state.nightsPerStop.length > 0) {
        // Infer from nights: if first stop has 0 nights, it's a road sector
        setStartSectorType(state.nightsPerStop[0] === 0 ? "road" : "itinerary");
      }

      if (state.endSectorType && (state.endSectorType === "road" || state.endSectorType === "itinerary")) {
        setEndSectorType(state.endSectorType);
      } else if (state.nightsPerStop && state.nightsPerStop.length > 0) {
        // Infer from nights: if last stop has 0 nights, it's a road sector
        const lastIndex = state.nightsPerStop.length - 1;
        setEndSectorType(state.nightsPerStop[lastIndex] === 0 ? "road" : "itinerary");
      }

      // Restore plan if it exists
      if (state.plan && state.plan.days && state.plan.days.length > 0) {
        setPlan(state.plan);
        setDayDetails((prev) => syncDayDetailsFromPlan(state.plan, prev));
        
        // Restore extended plan data
        if (state.plan.dayDetails) {
          setDayDetails(state.plan.dayDetails);
        }
        if (state.plan.mapPoints) {
          setMapPoints(state.plan.mapPoints);
        }
        if (state.plan.legs) {
          setLegs(state.plan.legs);
        }
        
        setHasSubmitted(true);
      }

      return true;
    } catch (err) {
      console.error("Failed to restore trip planner state:", err);
      return false;
    }
  }

  /**
   * Clear saved state from localStorage
   */
  function clearSavedState(): void {
    try {
      localStorage.removeItem("tripPlanner_draft");
    } catch (err) {
      console.error("Failed to clear saved state:", err);
    }
  }

  return {
    saving,
    saveError,
    saveItinerary,
    loadItinerary,
    saveStateToLocalStorage,
    restoreStateFromLocalStorage,
    clearSavedState,
  };
}
