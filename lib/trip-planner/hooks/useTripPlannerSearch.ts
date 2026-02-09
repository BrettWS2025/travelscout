"use client";

import { useEffect, useMemo, useState } from "react";
import { searchPlacesByName } from "@/lib/nzCities";
import { NZ_STOPS } from "@/lib/nzStops";
import { normalize, parseDisplayName, type CityLite } from "@/lib/trip-planner/utils";

/**
 * Search functionality for cities, places, and things
 */
export function useTripPlannerSearch() {
  const [startQuery, setStartQuery] = useState("");
  const [endQuery, setEndQuery] = useState("");
  const [placesQuery, setPlacesQuery] = useState("");
  const [thingsQuery, setThingsQuery] = useState("");

  const [startSearchResults, setStartSearchResults] = useState<CityLite[]>([]);
  const [endSearchResults, setEndSearchResults] = useState<CityLite[]>([]);
  const [placesSearchResults, setPlacesSearchResults] = useState<CityLite[]>([]);

  // Search places for start city
  useEffect(() => {
    if (!startQuery.trim()) {
      setStartSearchResults([]);
      return;
    }
    
    const searchPlaces = async () => {
      try {
        const results = await searchPlacesByName(startQuery, 20);
        setStartSearchResults(
          results.slice(0, 8).map((p) => {
            const displayName = p.display_name || p.name;
            const { cityName, district } = parseDisplayName(displayName);
            return {
              id: p.id,
              name: displayName,
              cityName,
              district,
            };
          })
        );
      } catch (error) {
        console.error("Error searching places for start city:", error);
        setStartSearchResults([]);
      }
    };
    
    const timeoutId = setTimeout(searchPlaces, 300);
    return () => clearTimeout(timeoutId);
  }, [startQuery]);

  // Search places for end city
  useEffect(() => {
    if (!endQuery.trim()) {
      setEndSearchResults([]);
      return;
    }
    
    const searchPlaces = async () => {
      try {
        const results = await searchPlacesByName(endQuery, 20);
        setEndSearchResults(
          results.slice(0, 8).map((p) => {
            const displayName = p.display_name || p.name;
            const { cityName, district } = parseDisplayName(displayName);
            return {
              id: p.id,
              name: displayName,
              cityName,
              district,
            };
          })
        );
      } catch (error) {
        console.error("Error searching places for end city:", error);
        setEndSearchResults([]);
      }
    };
    
    const timeoutId = setTimeout(searchPlaces, 300);
    return () => clearTimeout(timeoutId);
  }, [endQuery]);

  // Search places
  useEffect(() => {
    if (!placesQuery.trim()) {
      setPlacesSearchResults([]);
      return;
    }
    
    const searchPlaces = async () => {
      try {
        const results = await searchPlacesByName(placesQuery, 20);
        setPlacesSearchResults(
          results.slice(0, 8).map((p) => {
            const displayName = p.display_name || p.name;
            const { cityName, district } = parseDisplayName(displayName);
            return {
              id: p.id,
              name: displayName,
              cityName,
              district,
            };
          })
        );
      } catch (error) {
        console.error("Error searching places:", error);
        setPlacesSearchResults([]);
      }
    };
    
    const timeoutId = setTimeout(searchPlaces, 300);
    return () => clearTimeout(timeoutId);
  }, [placesQuery]);

  // Things search (filtering from NZ_STOPS)
  const thingsResults = useMemo(() => {
    const q = normalize(thingsQuery);
    if (!q) return [];
    return NZ_STOPS.filter((stop) => {
      if (normalize(stop.name).includes(q)) return true;
      return stop.aliases?.some((alias) => normalize(alias).includes(q));
    }).slice(0, 8);
  }, [thingsQuery]);

  const startResults = useMemo(() => {
    return startSearchResults;
  }, [startSearchResults]);

  const endResults = useMemo(() => {
    return endSearchResults;
  }, [endSearchResults]);
  
  const placesResults = useMemo(() => {
    return placesSearchResults;
  }, [placesSearchResults]);

  return {
    // Query state
    startQuery,
    setStartQuery,
    endQuery,
    setEndQuery,
    placesQuery,
    setPlacesQuery,
    thingsQuery,
    setThingsQuery,

    // Results
    startResults,
    endResults,
    placesResults,
    thingsResults,
  };
}
