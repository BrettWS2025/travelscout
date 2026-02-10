"use client";

import { useEffect, useState } from "react";
import type { DateRange } from "react-day-picker";
import type { TripPlan } from "@/lib/itinerary";
import { getCityById, getAllPlaces, type Place } from "@/lib/nzCities";
import { DEFAULT_START_CITY_ID, DEFAULT_END_CITY_ID } from "@/lib/nzCities";
import {
  pickSuggestedCities,
  safeReadRecent,
  type CityLite,
  type DayDetail,
  type DayStopMeta,
  type MapPoint,
  type RoadSectorDetail,
  type StartEndSectorType,
} from "@/lib/trip-planner/utils";
import type { TripLeg } from "@/lib/itinerary";

/**
 * Core state management for trip planner
 * Manages cities, dates, plan, and related state
 */
export function useTripPlannerState() {
  // City selection state
  const [startCityId, setStartCityId] = useState("");
  const [endCityId, setEndCityId] = useState(""); // Kept for backward compatibility, but optional now
  const [destinationIds, setDestinationIds] = useState<string[]>([]); // Multiple destinations
  const [startCityData, setStartCityData] = useState<Place | null>(null);
  const [endCityData, setEndCityData] = useState<Place | null>(null);
  const [destinationData, setDestinationData] = useState<Map<string, Place>>(new Map());

  // Date state
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => new Date());

  // Plan state
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  // Route state
  const [routeStops, setRouteStops] = useState<string[]>([]);
  const [nightsPerStop, setNightsPerStop] = useState<number[]>([]);
  const [dayStopMeta, setDayStopMeta] = useState<DayStopMeta[]>([]);

  // Map state
  const [mapPoints, setMapPoints] = useState<MapPoint[]>([]);
  const [legs, setLegs] = useState<TripLeg[]>([]);
  const [legsLoading, setLegsLoading] = useState(false);

  // Day details state
  const [dayDetails, setDayDetails] = useState<Record<string, DayDetail>>({});
  const [roadSectorDetails, setRoadSectorDetails] = useState<Record<number, RoadSectorDetail>>({});
  const [startSectorType, setStartSectorType] = useState<StartEndSectorType>("road");
  const [endSectorType, setEndSectorType] = useState<StartEndSectorType>("itinerary");

  // UI state for "add stop after this"
  const [addingStopAfterIndex, setAddingStopAfterIndex] = useState<number | null>(null);
  const [newStopCityId, setNewStopCityId] = useState<string | null>(null);

  // UI state for nested stop groups (collapsed by default)
  const [openStops, setOpenStops] = useState<Record<number, boolean>>({});

  // Recent and suggested cities
  const [recent, setRecent] = useState<CityLite[]>([]);
  const [suggested, setSuggested] = useState<CityLite[]>(() => pickSuggestedCities());

  // Use stored data if available, otherwise fall back to cache lookup
  const startCity = startCityData || getCityById(startCityId);
  const endCity = endCityData || getCityById(endCityId);

  // Sync stored city data with cache when it becomes available
  useEffect(() => {
    if (!startCityId) {
      setStartCityData(null);
    } else if (!startCityData || startCityData.id !== startCityId) {
      const cached = getCityById(startCityId);
      if (cached) {
        setStartCityData(cached);
      }
    }
  }, [startCityId, startCityData]);

  useEffect(() => {
    if (!endCityId) {
      setEndCityData(null);
    } else if (!endCityData || endCityData.id !== endCityId) {
      const cached = getCityById(endCityId);
      if (cached) {
        setEndCityData(cached);
      }
    }
  }, [endCityId, endCityData]);

  // Load recent cities and suggested cities on mount
  useEffect(() => {
    setRecent(safeReadRecent());
    
    // Load places from Supabase and update suggested cities when ready
    getAllPlaces().then(() => {
      // Places are now loaded, update suggested cities
      setSuggested(pickSuggestedCities());
    });
  }, []);

  return {
    // City state
    startCityId,
    setStartCityId,
    endCityId,
    setEndCityId,
    destinationIds,
    setDestinationIds,
    startCityData,
    setStartCityData,
    endCityData,
    setEndCityData,
    destinationData,
    setDestinationData,
    startCity,
    endCity,

    // Date state
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    dateRange,
    setDateRange,
    calendarMonth,
    setCalendarMonth,

    // Plan state
    plan,
    setPlan,
    error,
    setError,
    hasSubmitted,
    setHasSubmitted,

    // Route state
    routeStops,
    setRouteStops,
    nightsPerStop,
    setNightsPerStop,
    dayStopMeta,
    setDayStopMeta,

    // Map state
    mapPoints,
    setMapPoints,
    legs,
    setLegs,
    legsLoading,
    setLegsLoading,

    // Day details state
    dayDetails,
    setDayDetails,
    roadSectorDetails,
    setRoadSectorDetails,
    startSectorType,
    setStartSectorType,
    endSectorType,
    setEndSectorType,

    // UI state
    addingStopAfterIndex,
    setAddingStopAfterIndex,
    newStopCityId,
    setNewStopCityId,
    openStops,
    setOpenStops,

    // Recent and suggested
    recent,
    setRecent,
    suggested,
    setSuggested,
  };
}
