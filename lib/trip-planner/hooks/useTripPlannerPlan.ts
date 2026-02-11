"use client";

import type { FormEvent } from "react";
import React from "react";
import { getCityById, searchPlacesByName, type Place } from "@/lib/nzCities";
import { NZ_STOPS, orderWaypointNamesByRoute } from "@/lib/nzStops";
import { NZ_CITIES } from "@/lib/nzCities";
import {
  buildTripPlanFromStopsAndNights,
  countDaysInclusive,
  countNights,
  type TripPlan,
} from "@/lib/itinerary";
import {
  allocateNightsForStops,
  buildDayStopMeta,
  buildFallbackLegs,
  fetchRoadLegs,
  makeDayKey,
  addDaysToIsoDate,
  type DayDetail,
  type DayStopMeta,
  type MapPoint,
  type RoadSectorDetail,
  type StartEndSectorType,
} from "@/lib/trip-planner/utils";
import { arrayMove, syncDayDetailsFromPlan } from "@/lib/trip-planner/useTripPlanner.utils";
import { fetchPlaceCoordinates } from "@/lib/trip-planner/useTripPlanner.api";

/**
 * Plan generation and modification logic
 * This is the core business logic for building and updating trip plans
 */
export function useTripPlannerPlan(
  // State values
  startCity: Place | undefined,
  endCity: Place | undefined,
  startCityId: string,
  endCityId: string,
  startDate: string,
  endDate: string,
  selectedPlaceIds: string[],
  selectedPlaceData: Map<string, Place>,
  selectedThingIds: string[],
  destinationIds: string[],
  destinationData: Map<string, Place>,
  routeStops: string[],
  nightsPerStop: number[],
  mapPoints: MapPoint[],
  roadSectorDetails: Record<number, RoadSectorDetail>,
  openStops: Record<number, boolean>,
  // State setters
  setPlan: (plan: TripPlan | null) => void,
  setError: (error: string | null) => void,
  setHasSubmitted: (submitted: boolean) => void,
  setRouteStops: (stops: string[]) => void,
  setNightsPerStop: (nights: number[]) => void,
  setDayStopMeta: (meta: DayStopMeta[]) => void,
  setMapPoints: (points: MapPoint[]) => void,
  setLegs: (legs: import("@/lib/itinerary").TripLeg[]) => void,
  setLegsLoading: (loading: boolean) => void,
  setDayDetails: React.Dispatch<React.SetStateAction<Record<string, DayDetail>>>,
  setRoadSectorDetails: React.Dispatch<React.SetStateAction<Record<number, RoadSectorDetail>>>,
  setStartSectorType: (type: StartEndSectorType) => void,
  setEndSectorType: (type: StartEndSectorType) => void,
  setOpenStops: React.Dispatch<React.SetStateAction<Record<number, boolean>>>,
  setEndDate: (date: string) => void,
  setStartCityData: (city: Place | null) => void,
  setEndCityData: (city: Place | null) => void,
  setSelectedPlaceData: React.Dispatch<React.SetStateAction<Map<string, Place>>>,
  setDestinationData: React.Dispatch<React.SetStateAction<Map<string, Place>>>
) {
  /**
   * Main form submission handler
   * Builds the trip plan from selected cities, dates, places, and things
   */
  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setHasSubmitted(true);
    setError(null);

    const start = startCity;
    const end = endCity;

    if (!start) {
      setPlan(null);
      setMapPoints([]);
      setLegs([]);
      setError("Please select a start city.");
      return;
    }

    if (!startDate || !endDate) {
      setPlan(null);
      setMapPoints([]);
      setLegs([]);
      setError("Please select your trip dates.");
      return;
    }

    try {
      // Get selected places using stored data (includes places not in cache)
      // Also fetch any missing coordinates from database
      const selectedPlacesDataPromises = selectedPlaceIds.map(async (id) => {
        // Try stored data first, then cache lookup
        let place = selectedPlaceData.get(id) || getCityById(id);
        
        // If not found or has invalid coordinates, try fetching from database
        if (!place || (place.lat === 0 && place.lng === 0) || !place.lat || !place.lng) {
          console.log(`Fetching coordinates for place ID: ${id}`);
          const { getPlaceById } = await import("@/lib/nzCities");
          
          // First try by ID
          let fetched = await getPlaceById(id);
          
          // If still not found or invalid coords, try searching by name if we have it
          if ((!fetched || (fetched.lat === 0 && fetched.lng === 0)) && place?.name) {
            console.log(`Trying to find ${place.name} by name search`);
            const searchResults = await searchPlacesByName(place.name, 5);
            const placeName = place.name.toLowerCase();
            const exactMatch = searchResults.find(p => p.id === id || p.name.toLowerCase() === placeName);
            if (exactMatch && (exactMatch.lat !== 0 || exactMatch.lng !== 0)) {
              fetched = exactMatch;
            }
          }
          
          if (fetched && (fetched.lat !== 0 || fetched.lng !== 0) && fetched.lat && fetched.lng) {
            place = fetched;
            // Update stored data
            setSelectedPlaceData((prev) => new Map(prev).set(id, fetched));
            console.log(`Found coordinates for ${fetched.name}: lat=${fetched.lat}, lng=${fetched.lng}`);
          } else {
            console.error(`Could not fetch valid coordinates for place ID: ${id}, name: ${place?.name}`);
          }
        }
        
        return place;
      });
      
      const selectedPlacesData = (await Promise.all(selectedPlacesDataPromises))
        .filter((c): c is Place => c !== undefined && c !== null);

      // Get destinations using stored data (includes destinations not in cache)
      // Also fetch any missing coordinates from database
      const destinationsDataPromises = destinationIds.map(async (id) => {
        // Try stored data first, then cache lookup
        let place = destinationData.get(id) || getCityById(id);
        
        // If not found or has invalid coordinates, try fetching from database
        if (!place || (place.lat === 0 && place.lng === 0) || !place.lat || !place.lng) {
          console.log(`Fetching coordinates for destination ID: ${id}`);
          const { getPlaceById } = await import("@/lib/nzCities");
          
          // First try by ID
          let fetched = await getPlaceById(id);
          
          // If still not found or invalid coords, try searching by name if we have it
          if ((!fetched || (fetched.lat === 0 && fetched.lng === 0)) && place?.name) {
            console.log(`Trying to find ${place.name} by name search`);
            const searchResults = await searchPlacesByName(place.name, 5);
            const placeName = place.name.toLowerCase();
            const exactMatch = searchResults.find(p => p.id === id || p.name.toLowerCase() === placeName);
            if (exactMatch && (exactMatch.lat !== 0 || exactMatch.lng !== 0)) {
              fetched = exactMatch;
            }
          }
          
          if (fetched && (fetched.lat !== 0 || fetched.lng !== 0) && fetched.lat && fetched.lng) {
            place = fetched;
            // Update stored data
            setDestinationData((prev) => new Map(prev).set(id, fetched));
            console.log(`Found coordinates for destination ${fetched.name}: lat=${fetched.lat}, lng=${fetched.lng}`);
          } else {
            console.error(`Could not fetch valid coordinates for destination ID: ${id}, name: ${place?.name}`);
          }
        }
        
        return place;
      });
      
      const destinationsData = (await Promise.all(destinationsDataPromises))
        .filter((c): c is Place => c !== undefined && c !== null);
      
      // Also ensure start city has valid coordinates
      if ((start.lat === 0 && start.lng === 0) || !start.lat || !start.lng) {
        console.log(`Fetching coordinates for start city: ${start.name} (${startCityId})`);
        const { getPlaceById } = await import("@/lib/nzCities");
        let fetched = await getPlaceById(startCityId);
        if ((!fetched || (fetched.lat === 0 && fetched.lng === 0)) && start.name) {
          const searchResults = await searchPlacesByName(start.name, 5);
          const exactMatch = searchResults.find(p => p.id === startCityId || p.name.toLowerCase() === start.name.toLowerCase());
          if (exactMatch) fetched = exactMatch;
        }
        if (fetched && (fetched.lat !== 0 || fetched.lng !== 0) && fetched.lat && fetched.lng) {
          setStartCityData(fetched);
          Object.assign(start, { lat: fetched.lat, lng: fetched.lng });
          console.log(`Updated start city coordinates: ${fetched.name} lat=${fetched.lat}, lng=${fetched.lng}`);
        }
      }
      
      // Only fetch end city coordinates if end city exists
      if (end) {
        if ((end.lat === 0 && end.lng === 0) || !end.lat || !end.lng) {
          console.log(`Fetching coordinates for end city: ${end.name} (${endCityId})`);
          const { getPlaceById } = await import("@/lib/nzCities");
          let fetched = await getPlaceById(endCityId);
          if ((!fetched || (fetched.lat === 0 && fetched.lng === 0)) && end.name) {
            const searchResults = await searchPlacesByName(end.name, 5);
            const exactMatch = searchResults.find(p => p.id === endCityId || p.name.toLowerCase() === end.name.toLowerCase());
            if (exactMatch) fetched = exactMatch;
          }
          if (fetched && (fetched.lat !== 0 || fetched.lng !== 0) && fetched.lat && fetched.lng) {
            setEndCityData(fetched);
            Object.assign(end, { lat: fetched.lat, lng: fetched.lng });
            console.log(`Updated end city coordinates: ${fetched.name} lat=${fetched.lat}, lng=${fetched.lng}`);
          }
        }
      }

      // Combine destinations, selected places (city names) and things (stop names) into waypoint names
      const destinationNames = destinationsData.map((city) => city.name);
      const placeNames = selectedPlacesData.map((city) => city.name);
      
      const thingNames = selectedThingIds.map((id) => {
        const stop = NZ_STOPS.find((s) => s.id === id);
        return stop?.name ?? "";
      }).filter(Boolean);
      
      const rawWaypointNames = [...destinationNames, ...placeNames, ...thingNames];

      // Build a map of waypoint names to their coordinates for better routing
      const waypointCoordinates = new Map<string, { lat: number; lng: number }>();
      for (const city of [...destinationsData, ...selectedPlacesData]) {
        if (city.lat !== 0 || city.lng !== 0) {
          waypointCoordinates.set(city.name, { lat: city.lat, lng: city.lng });
        }
      }

      const { orderedNames, matchedStopsInOrder } = orderWaypointNamesByRoute(
        start,
        end || null,
        rawWaypointNames,
        waypointCoordinates
      );

      console.log("Waypoint processing:", {
        destinationIds,
        destinationsData: destinationsData.map(p => ({ id: p.id, name: p.name, lat: p.lat, lng: p.lng })),
        selectedPlaceIds,
        selectedPlacesData: selectedPlacesData.map(p => ({ id: p.id, name: p.name, lat: p.lat, lng: p.lng })),
        destinationNames,
        placeNames,
        rawWaypointNames,
        orderedNames,
        start: start.name,
        end: end?.name || "none"
      });

      // Build stops array: start + ordered waypoints + end (if exists)
      const stops: string[] = [start.name, ...orderedNames];
      if (end) {
        stops.push(end.name);
      }
      setRouteStops(stops);

      // Calculate total days and nights
      const totalDays = countDaysInclusive(startDate, endDate);
      const totalNights = countNights(startDate, endDate);
      const initialNights = allocateNightsForStops(stops.length, totalNights);
      
      if (!end) {
        // No end city - all stops are destinations (itinerary sectors)
        // Start is a road sector (0 nights), all destinations get nights
        initialNights[0] = 0;
        
        if (stops.length > 1 && totalNights > 0) {
          const destinationCount = stops.length - 1;
          const baseNightsPerDestination = Math.floor(totalNights / destinationCount);
          const extraNights = totalNights % destinationCount;
          
          for (let i = 1; i < stops.length; i++) {
            initialNights[i] = baseNightsPerDestination + (i - 1 < extraNights ? 1 : 0);
          }
        }
        
        setStartSectorType("road");
        // Last destination is an itinerary sector
        setEndSectorType("itinerary");
      } else if (stops.length === 2 && start.name === end.name) {
        // Same start/end with no middle stops - end is a road sector (return trip)
        initialNights[0] = 0;
        initialNights[1] = 0; // End is road sector, no nights
        setStartSectorType("road");
        setEndSectorType("road");
      } else if (stops.length === 2) {
        // Just start and end (different cities) - end should be itinerary by default
        initialNights[0] = 0;
        initialNights[1] = Math.max(1, totalNights);
        setStartSectorType("road");
        setEndSectorType("itinerary");
      } else {
        // Check if it's a return trip (start and end are the same city)
        const isReturnTrip = start.name === end.name;
        
        if (isReturnTrip) {
          // Return trip: start is road, middle stops get nights, end is road (0 nights)
          initialNights[0] = 0; // Start is a road sector
          initialNights[stops.length - 1] = 0; // End is a road sector, no nights
          
          // Allocate all nights to middle stops only (not start or end)
          if (stops.length > 2 && totalNights > 0) {
            const middleStopCount = stops.length - 2; // Exclude start and end
            const baseNightsPerMiddle = Math.floor(totalNights / middleStopCount);
            const extraNights = totalNights % middleStopCount;
            
            for (let i = 1; i < stops.length - 1; i++) {
              initialNights[i] = baseNightsPerMiddle + (i - 1 < extraNights ? 1 : 0);
            }
          }
          
          setStartSectorType("road");
          setEndSectorType("road");
        } else {
          // Has end city - all destinations (including end) are itinerary sectors
          // Start is a road sector (0 nights), all destinations get nights
          initialNights[0] = 0;
          
          // Allocate all nights to destinations (middle stops + end)
          if (stops.length > 1 && totalNights > 0) {
            const destinationCount = stops.length - 1; // All stops except start
            const baseNightsPerDestination = Math.floor(totalNights / destinationCount);
            const extraNights = totalNights % destinationCount;
            
            for (let i = 1; i < stops.length; i++) {
              initialNights[i] = baseNightsPerDestination + (i - 1 < extraNights ? 1 : 0);
            }
          }
          
          setStartSectorType("road");
          // End is an itinerary sector
          setEndSectorType("itinerary");
        }
      }
      
      setNightsPerStop(initialNights);

      const nextPlan = buildTripPlanFromStopsAndNights(stops, initialNights, startDate);
      setPlan(nextPlan);
      setDayDetails((prev) => syncDayDetailsFromPlan(nextPlan, prev));
      setDayStopMeta(buildDayStopMeta(stops, initialNights));
      setOpenStops({});

      // Build map points from all selected places, destinations, and matched stops
      const placeCoordsMap = new Map<string, { lat: number; lng: number; name: string }>();
      
      // Add destinations first (they take priority)
      destinationsData.forEach((place) => {
        const key = place.name.toLowerCase();
        if (place.lat !== 0 || place.lng !== 0) {
          placeCoordsMap.set(key, { lat: place.lat, lng: place.lng, name: place.name });
        }
      });
      
      // Add selected places
      selectedPlacesData.forEach((place) => {
        const key = place.name.toLowerCase();
        if (!placeCoordsMap.has(key) && (place.lat !== 0 || place.lng !== 0)) {
          placeCoordsMap.set(key, { lat: place.lat, lng: place.lng, name: place.name });
        }
      });
      
      // Add matched stops
      matchedStopsInOrder.forEach((stop) => {
        const key = stop.name.toLowerCase();
        if (!placeCoordsMap.has(key)) {
          placeCoordsMap.set(key, { lat: stop.lat, lng: stop.lng, name: stop.name });
        }
      });

      const waypointPoints: MapPoint[] = orderedNames.map((name) => {
        const key = name.toLowerCase();
        const coords = placeCoordsMap.get(key);
        if (coords) {
          return { lat: coords.lat, lng: coords.lng, name: coords.name };
        }
        // Fallback checks
        const destination = destinationsData.find((p) => p.name.toLowerCase() === key);
        if (destination && (destination.lat !== 0 || destination.lng !== 0)) {
          return { lat: destination.lat, lng: destination.lng, name: destination.name };
        }
        const place = selectedPlacesData.find((p) => p.name.toLowerCase() === key);
        if (place && (place.lat !== 0 || place.lng !== 0)) {
          return { lat: place.lat, lng: place.lng, name: place.name };
        }
        const stop = matchedStopsInOrder.find((s) => s.name.toLowerCase() === key);
        if (stop) {
          return { lat: stop.lat, lng: stop.lng, name: stop.name };
        }
        console.warn(`Could not find coordinates for waypoint: ${name}`);
        return { lat: 0, lng: 0, name };
      }).filter((p) => p.lat !== 0 || p.lng !== 0);

      const points: MapPoint[] = [
        { lat: start.lat, lng: start.lng, name: start.name },
        ...waypointPoints,
      ];
      // Only add end city if it exists
      if (end) {
        points.push({ lat: end.lat, lng: end.lng, name: end.name });
      }

      // Validate all points have valid coordinates
      const validPoints = points.filter((p) => {
        const isValid = p.lat !== 0 && p.lng !== 0 && 
                       p.lat >= -90 && p.lat <= 90 && 
                       p.lng >= -180 && p.lng <= 180;
        if (!isValid) {
          console.warn(`Invalid coordinates for ${p.name}: lat=${p.lat}, lng=${p.lng}`);
        }
        return isValid;
      });

      if (validPoints.length < 2) {
        console.error("Not enough valid map points:", validPoints);
        const missingPlaces = points
          .filter(p => {
            const isValid = p.lat !== 0 && p.lng !== 0 && 
                           p.lat >= -90 && p.lat <= 90 && 
                           p.lng >= -180 && p.lng <= 180;
            return !isValid;
          })
          .map(p => p.name);
        
        if (missingPlaces.length > 0) {
          setError(`Could not generate map: missing valid coordinates for: ${missingPlaces.join(", ")}. Please try selecting these places again.`);
        } else {
          setError("Could not generate map: missing valid coordinates for selected places.");
        }
        setMapPoints(validPoints);
        return;
      }

      setMapPoints(validPoints);

      setLegsLoading(true);
      try {
        if (validPoints.length >= 2) {
          const roadLegs = await fetchRoadLegs(validPoints);
          setLegs(roadLegs);
        } else {
          console.warn("Not enough valid points for routing, using fallback");
          setLegs(buildFallbackLegs(validPoints));
        }
      } catch (routingErr) {
        console.error("Road routing failed, falling back:", routingErr);
        setLegs(buildFallbackLegs(validPoints));
      } finally {
        setLegsLoading(false);
      }
    } catch (err) {
      setPlan(null);
      setMapPoints([]);
      setLegs([]);
      setLegsLoading(false);
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  /**
   * Update the number of nights for a specific stop
   */
  function handleChangeNights(idx: number, newValue: number) {
    if (!routeStops.length) return;
    if (!startDate) return;

    const safe = Math.max(1, Math.floor(Number.isNaN(newValue) ? 1 : newValue));
    const next = [...nightsPerStop];
    next[idx] = safe;

    setNightsPerStop(next);

    const nextPlan = buildTripPlanFromStopsAndNights(routeStops, next, startDate);
    setPlan(nextPlan);
    setDayDetails((prev) => syncDayDetailsFromPlan(nextPlan, prev));
    setDayStopMeta(buildDayStopMeta(routeStops, next));
    
    if (nextPlan.days.length > 0) {
      const last = nextPlan.days[nextPlan.days.length - 1];
      // Check if the end stop is a road sector (0 nights)
      const endIndex = routeStops.length - 1;
      const endNights = next[endIndex] ?? 0;
      if (endNights === 0) {
        // When end is a road sector (0 nights), the road sector arrives on the day after the last day in the plan
        // So endDate should be last.date + 1 day
        setEndDate(addDaysToIsoDate(last.date, 1));
      } else {
        setEndDate(last.date);
      }
    }
  }

  /**
   * Remove a stop from the route
   */
  function handleRemoveStop(idx: number) {
    if (idx <= 0 || idx >= routeStops.length - 1) {
      alert("You can't remove your start or end city from here.");
      return;
    }
    if (
      !window.confirm(
        `Remove ${routeStops[idx]} from this trip? All days for this stop will be deleted.`
      )
    ) {
      return;
    }

    const endCityName = endCity?.name;
    if (!endCity || !endCityName) {
      console.error("End city not found");
      return;
    }

    const newRouteStops = routeStops.filter((_, i) => i !== idx);
    const newNightsPerStop = nightsPerStop.filter((_, i) => i !== idx);
    
    if (newRouteStops[newRouteStops.length - 1] !== endCityName) {
      newRouteStops[newRouteStops.length - 1] = endCityName;
    }

    const newMapPoints: MapPoint[] = [];
    
    if (startCity) {
      newMapPoints.push({
        lat: startCity.lat,
        lng: startCity.lng,
        name: startCity.name,
      });
    }

    for (let i = 1; i < newRouteStops.length - 1; i++) {
      const stopName = newRouteStops[i];
      const matchingPoint = mapPoints.find((p, origIdx) => {
        return p.name === stopName && origIdx !== idx && origIdx !== 0 && origIdx !== mapPoints.length - 1;
      });
      
      if (matchingPoint) {
        newMapPoints.push(matchingPoint);
      } else {
        const stop = NZ_STOPS.find((s) => s.name === stopName);
        if (stop) {
          newMapPoints.push({
            lat: stop.lat,
            lng: stop.lng,
            name: stop.name,
          });
        } else {
          const city = NZ_CITIES.find((c) => c.name === stopName);
          if (city) {
            newMapPoints.push({
              lat: city.lat,
              lng: city.lng,
              name: city.name,
            });
          }
        }
      }
    }

    newMapPoints.push({
      lat: endCity.lat,
      lng: endCity.lng,
      name: endCity.name,
    });

    setRouteStops(newRouteStops);
    setNightsPerStop(newNightsPerStop);
    setMapPoints(newMapPoints);

    const nextPlan = buildTripPlanFromStopsAndNights(newRouteStops, newNightsPerStop, startDate);
    setPlan(nextPlan);
    setDayDetails((prev) => syncDayDetailsFromPlan(nextPlan, prev));
    setDayStopMeta(buildDayStopMeta(newRouteStops, newNightsPerStop));
    setOpenStops({});
    
    if (nextPlan.days.length > 0) {
      const last = nextPlan.days[nextPlan.days.length - 1];
      // Check if the end stop is a road sector (0 nights)
      const endIndex = newRouteStops.length - 1;
      const endNights = newNightsPerStop[endIndex] ?? 0;
      if (endNights === 0) {
        // When end is a road sector (0 nights), the road sector arrives on the day after the last day in the plan
        // So endDate should be last.date + 1 day
        setEndDate(addDaysToIsoDate(last.date, 1));
      } else {
        setEndDate(last.date);
      }
    }
    
    if (newMapPoints.length >= 2) {
      setLegsLoading(true);
      fetchRoadLegs(newMapPoints)
        .then((roadLegs) => setLegs(roadLegs))
        .catch((routingErr) => {
          console.error("Road routing failed, falling back:", routingErr);
          setLegs(buildFallbackLegs(newMapPoints));
        })
        .finally(() => setLegsLoading(false));
    } else {
      setLegs([]);
    }
  }

  /**
   * Reorder stops via drag and drop
   */
  function handleReorderStops(fromIndex: number, toIndex: number) {
    if (!startDate) return;
    if (!routeStops.length) return;

    const minIndex = 1;
    const maxIndex = routeStops.length - 2;

    if (routeStops.length < 3) return;

    const from = Math.min(Math.max(fromIndex, minIndex), maxIndex);
    const to = Math.min(Math.max(toIndex, minIndex), maxIndex);

    if (from === to) return;

    const newRouteStops = arrayMove(routeStops, from, to);
    const newNightsPerStop = arrayMove(nightsPerStop, from, to);
    const newMapPoints = arrayMove(mapPoints, from, to);

    // Reorder road sector details
    const newRoadSectorDetails: Record<number, RoadSectorDetail> = {};
    for (let newIdx = 0; newIdx < newRouteStops.length; newIdx++) {
      let oldIdx: number;
      if (newIdx === from) {
        oldIdx = to;
      } else if (newIdx === to) {
        oldIdx = from;
      } else {
        oldIdx = newIdx;
      }
      if (roadSectorDetails[oldIdx]) {
        newRoadSectorDetails[newIdx] = roadSectorDetails[oldIdx];
      }
    }
    setRoadSectorDetails(newRoadSectorDetails);

    // Preserve open state by stop name
    const nextOpenStops: Record<number, boolean> = {};
    for (let oldIdx = 0; oldIdx < routeStops.length; oldIdx++) {
      if (!openStops[oldIdx]) continue;
      const stopName = routeStops[oldIdx];
      const newIdx = newRouteStops.indexOf(stopName);
      if (newIdx >= 0) nextOpenStops[newIdx] = true;
    }

    setRouteStops(newRouteStops);
    setNightsPerStop(newNightsPerStop);
    setMapPoints(newMapPoints);
    setOpenStops(nextOpenStops);

    const nextPlan = buildTripPlanFromStopsAndNights(newRouteStops, newNightsPerStop, startDate);
    setPlan(nextPlan);
    setDayDetails((prev) => syncDayDetailsFromPlan(nextPlan, prev));
    setDayStopMeta(buildDayStopMeta(newRouteStops, newNightsPerStop));
    
    if (nextPlan.days.length > 0) {
      const last = nextPlan.days[nextPlan.days.length - 1];
      // Check if the end stop is a road sector (0 nights)
      const endIndex = newRouteStops.length - 1;
      const endNights = newNightsPerStop[endIndex] ?? 0;
      if (endNights === 0) {
        // When end is a road sector (0 nights), the road sector arrives on the day after the last day in the plan
        // So endDate should be last.date + 1 day
        setEndDate(addDaysToIsoDate(last.date, 1));
      } else {
        setEndDate(last.date);
      }
    }
    
    if (newMapPoints.length >= 2) {
      setLegsLoading(true);
      fetchRoadLegs(newMapPoints)
        .then((roadLegs) => setLegs(roadLegs))
        .catch((routingErr) => {
          console.error("Road routing failed, falling back:", routingErr);
          setLegs(buildFallbackLegs(newMapPoints));
        })
        .finally(() => setLegsLoading(false));
    } else {
      setLegs([]);
    }
  }

  /**
   * Start adding a new stop after the specified index
   */
  function handleStartAddStop(afterIndex: number) {
    // This is handled by state setters passed in
  }

  /**
   * Cancel adding a new stop
   */
  function handleCancelAddStop() {
    // This is handled by state setters passed in
  }

  /**
   * Confirm adding a new stop
   */
  async function handleConfirmAddStop(
    addingStopAfterIndex: number | null,
    newStopCityId: string | null,
    setAddingStopAfterIndex: (idx: number | null) => void
  ) {
    if (addingStopAfterIndex === null || !newStopCityId) return;

    let city: Place | null = getCityById(newStopCityId) || null;
    
    if (!city) {
      city = await fetchPlaceCoordinates(newStopCityId);
    }
    
    if (!city) {
      alert("Please select a valid stop.");
      return;
    }

    const insertIndex = addingStopAfterIndex + 1;

    const newRouteStops = [...routeStops];
    newRouteStops.splice(insertIndex, 0, city.name);

    const newNightsPerStop = [...nightsPerStop];
    newNightsPerStop.splice(insertIndex, 0, 1);

    const newMapPoints = [...mapPoints];
    newMapPoints.splice(insertIndex, 0, {
      lat: city.lat,
      lng: city.lng,
      name: city.name,
    });

    setRouteStops(newRouteStops);
    setNightsPerStop(newNightsPerStop);
    setMapPoints(newMapPoints);
    setAddingStopAfterIndex(null);
    
    const nextPlan = buildTripPlanFromStopsAndNights(newRouteStops, newNightsPerStop, startDate);
    setPlan(nextPlan);
    setDayDetails((prev) => syncDayDetailsFromPlan(nextPlan, prev));
    setDayStopMeta(buildDayStopMeta(newRouteStops, newNightsPerStop));
    setOpenStops({});
    
    if (nextPlan.days.length > 0) {
      const last = nextPlan.days[nextPlan.days.length - 1];
      // Check if the end stop is a road sector (0 nights)
      const endIndex = newRouteStops.length - 1;
      const endNights = newNightsPerStop[endIndex] ?? 0;
      if (endNights === 0) {
        // When end is a road sector (0 nights), the road sector arrives on the day after the last day in the plan
        // So endDate should be last.date + 1 day
        setEndDate(addDaysToIsoDate(last.date, 1));
      } else {
        setEndDate(last.date);
      }
    }
    
    if (newMapPoints.length >= 2) {
      setLegsLoading(true);
      fetchRoadLegs(newMapPoints)
        .then((roadLegs) => setLegs(roadLegs))
        .catch((routingErr) => {
          console.error("Road routing failed, falling back:", routingErr);
          setLegs(buildFallbackLegs(newMapPoints));
        })
        .finally(() => setLegsLoading(false));
    }
  }

  /**
   * Day details management
   */
  function toggleDayOpen(date: string, location: string) {
    const key = makeDayKey(date, location);
    setDayDetails((prev) => {
      const existing = prev[key];
      if (!existing) {
        return { ...prev, [key]: { notes: "", accommodation: "", isOpen: true, experiences: [] } };
      }
      return { ...prev, [key]: { ...existing, isOpen: !existing.isOpen } };
    });
  }

  function updateDayNotes(date: string, location: string, notes: string) {
    const key = makeDayKey(date, location);
    setDayDetails((prev) => ({
      ...prev,
      [key]: {
        notes,
        accommodation: prev[key]?.accommodation ?? "",
        isOpen: prev[key]?.isOpen ?? true,
        experiences: prev[key]?.experiences ?? [],
      },
    }));
  }

  function updateDayAccommodation(date: string, location: string, accommodation: string) {
    const key = makeDayKey(date, location);
    setDayDetails((prev) => ({
      ...prev,
      [key]: {
        notes: prev[key]?.notes ?? "",
        accommodation,
        isOpen: prev[key]?.isOpen ?? true,
        experiences: prev[key]?.experiences ?? [],
      },
    }));
  }

  function addExperienceToDay(date: string, location: string, experience: import("@/lib/walkingExperiences").WalkingExperience) {
    const key = makeDayKey(date, location);
    setDayDetails((prev) => {
      const existing = prev[key];
      const currentExperiences = existing?.experiences ?? [];
      // Check if experience already exists (by id)
      if (currentExperiences.some((e) => e.id === experience.id)) {
        return prev; // Don't add duplicates
      }
      return {
        ...prev,
        [key]: {
          notes: existing?.notes ?? "",
          accommodation: existing?.accommodation ?? "",
          isOpen: existing?.isOpen ?? true,
          experiences: [...currentExperiences, experience],
        },
      };
    });
  }

  function removeExperienceFromDay(date: string, location: string, experienceId: string) {
    const key = makeDayKey(date, location);
    setDayDetails((prev) => {
      const existing = prev[key];
      if (!existing) return prev;
      const filteredExperiences = (existing.experiences ?? []).filter((e) => e.id !== experienceId);
      return {
        ...prev,
        [key]: {
          ...existing,
          experiences: filteredExperiences,
        },
      };
    });
  }

  /**
   * Road sector details management
   */
  function toggleRoadSectorOpen(destinationStopIndex: number) {
    setRoadSectorDetails((prev) => {
      const existing = prev[destinationStopIndex];
      if (!existing) {
        return { ...prev, [destinationStopIndex]: { activities: "", isOpen: true, experiences: [] } };
      }
      return { ...prev, [destinationStopIndex]: { ...existing, isOpen: !existing.isOpen } };
    });
  }

  function updateRoadSectorActivities(destinationStopIndex: number, activities: string) {
    setRoadSectorDetails((prev) => ({
      ...prev,
      [destinationStopIndex]: {
        activities,
        isOpen: prev[destinationStopIndex]?.isOpen ?? true,
        experiences: prev[destinationStopIndex]?.experiences ?? [],
      },
    }));
  }

  function addExperienceToRoadSector(destinationStopIndex: number, experience: import("@/lib/walkingExperiences").WalkingExperience) {
    setRoadSectorDetails((prev) => {
      const existing = prev[destinationStopIndex];
      const currentExperiences = existing?.experiences ?? [];
      // Check if experience already exists (by id)
      if (currentExperiences.some((e) => e.id === experience.id)) {
        return prev; // Don't add duplicates
      }
      return {
        ...prev,
        [destinationStopIndex]: {
          activities: existing?.activities ?? "",
          isOpen: existing?.isOpen ?? true,
          experiences: [...currentExperiences, experience],
        },
      };
    });
  }

  function removeExperienceFromRoadSector(destinationStopIndex: number, experienceId: string) {
    setRoadSectorDetails((prev) => {
      const existing = prev[destinationStopIndex];
      if (!existing) return prev;
      const filteredExperiences = (existing.experiences ?? []).filter((e) => e.id !== experienceId);
      return {
        ...prev,
        [destinationStopIndex]: {
          ...existing,
          experiences: filteredExperiences,
        },
      };
    });
  }

  /**
   * Sector type conversions
   */
  function convertStartToItinerary() {
    if (!startDate || routeStops.length === 0) return;
    
    const newNightsPerStop = [...nightsPerStop];
    if (newNightsPerStop[0] === 0) {
      newNightsPerStop[0] = 1;
    }
    
    setNightsPerStop(newNightsPerStop);
    setStartSectorType("itinerary");
    
    if (routeStops.length > 1) {
      const targetIndex = routeStops.length > 2 ? 1 : routeStops.length - 1;
      setRoadSectorDetails((prev) => {
        if (!prev[targetIndex]) {
          return { ...prev, [targetIndex]: { activities: "", isOpen: false } };
        }
        return prev;
      });
    }
    
    const nextPlan = buildTripPlanFromStopsAndNights(routeStops, newNightsPerStop, startDate);
    setPlan(nextPlan);
    setDayDetails((prev) => syncDayDetailsFromPlan(nextPlan, prev));
    setDayStopMeta(buildDayStopMeta(routeStops, newNightsPerStop));
    
    if (nextPlan.days.length > 0) {
      const last = nextPlan.days[nextPlan.days.length - 1];
      setEndDate(last.date);
    }
  }

  function convertStartToRoad() {
    if (!startDate || routeStops.length === 0) return;
    
    const newNightsPerStop = [...nightsPerStop];
    newNightsPerStop[0] = 0;
    
    setNightsPerStop(newNightsPerStop);
    setStartSectorType("road");
    
    if (routeStops.length > 1) {
      const targetIndex = routeStops.length > 2 ? 1 : routeStops.length - 1;
      setRoadSectorDetails((prev) => {
        const next = { ...prev };
        delete next[targetIndex];
        return next;
      });
    }
    
    const nextPlan = buildTripPlanFromStopsAndNights(routeStops, newNightsPerStop, startDate);
    setPlan(nextPlan);
    setDayDetails((prev) => syncDayDetailsFromPlan(nextPlan, prev));
    setDayStopMeta(buildDayStopMeta(routeStops, newNightsPerStop));
    
    if (nextPlan.days.length > 0) {
      const last = nextPlan.days[nextPlan.days.length - 1];
      setEndDate(last.date);
    }
  }

  function convertEndToItinerary() {
    if (!startDate || routeStops.length === 0) return;
    
    const newNightsPerStop = [...nightsPerStop];
    const endIndex = routeStops.length - 1;
    if (newNightsPerStop[endIndex] === 0) {
      newNightsPerStop[endIndex] = 1;
    }
    
    setNightsPerStop(newNightsPerStop);
    setEndSectorType("itinerary");
    
    setRoadSectorDetails((prev) => {
      if (!prev[endIndex]) {
        return { ...prev, [endIndex]: { activities: "", isOpen: false } };
      }
      return prev;
    });
    
    const nextPlan = buildTripPlanFromStopsAndNights(routeStops, newNightsPerStop, startDate);
    setPlan(nextPlan);
    setDayDetails((prev) => syncDayDetailsFromPlan(nextPlan, prev));
    setDayStopMeta(buildDayStopMeta(routeStops, newNightsPerStop));
    
    if (nextPlan.days.length > 0) {
      const last = nextPlan.days[nextPlan.days.length - 1];
      setEndDate(last.date);
    }
  }

  function convertEndToRoad() {
    if (!startDate || routeStops.length === 0) return;
    
    const newNightsPerStop = [...nightsPerStop];
    const endIndex = routeStops.length - 1;
    newNightsPerStop[endIndex] = 0;
    
    setNightsPerStop(newNightsPerStop);
    // Note: End is now default itinerary, but user can convert to road if needed
    setEndSectorType("road");
    
    setRoadSectorDetails((prev) => {
      const next = { ...prev };
      delete next[endIndex];
      return next;
    });
    
    const nextPlan = buildTripPlanFromStopsAndNights(routeStops, newNightsPerStop, startDate);
    setPlan(nextPlan);
    setDayDetails((prev) => syncDayDetailsFromPlan(nextPlan, prev));
    setDayStopMeta(buildDayStopMeta(routeStops, newNightsPerStop));
    
    if (nextPlan.days.length > 0) {
      const last = nextPlan.days[nextPlan.days.length - 1];
      // When end is a road sector (0 nights), the road sector arrives on the day after the last day in the plan
      // So endDate should be last.date + 1 day
      setEndDate(addDaysToIsoDate(last.date, 1));
    }
  }

  /**
   * Stop UI management
   */
  function toggleStopOpen(stopIndex: number) {
    setOpenStops((prev: Record<number, boolean>) => ({ ...prev, [stopIndex]: !(prev[stopIndex] ?? false) }));
  }

  function expandAllStops() {
    const next: Record<number, boolean> = {};
    for (let i = 0; i < routeStops.length; i++) next[i] = true;
    setOpenStops(next);
  }

  function collapseAllStops() {
    setOpenStops({});
  }

  return {
    handleSubmit,
    handleChangeNights,
    handleRemoveStop,
    handleReorderStops,
    handleStartAddStop,
    handleCancelAddStop,
    handleConfirmAddStop,
    toggleDayOpen,
    updateDayNotes,
    updateDayAccommodation,
    addExperienceToDay,
    removeExperienceFromDay,
    toggleRoadSectorOpen,
    updateRoadSectorActivities,
    addExperienceToRoadSector,
    removeExperienceFromRoadSector,
    convertStartToItinerary,
    convertStartToRoad,
    convertEndToItinerary,
    convertEndToRoad,
    toggleStopOpen,
    expandAllStops,
    collapseAllStops,
  };
}
