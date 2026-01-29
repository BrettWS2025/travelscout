"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { DateRange } from "react-day-picker";
import {
  buildTripPlanFromStopsAndNights,
  type TripPlan,
  countDaysInclusive,
  type TripInput,
} from "@/lib/itinerary";
import {
  NZ_CITIES,
  DEFAULT_START_CITY_ID,
  DEFAULT_END_CITY_ID,
  getCityById,
  getAllPlaces,
  searchPlacesByName,
  type Place,
} from "@/lib/nzCities";
import { orderWaypointNamesByRoute, NZ_STOPS, type NzStop } from "@/lib/nzStops";
import {
  allocateNightsForStops,
  buildDayStopMeta,
  buildFallbackLegs,
  fetchRoadLegs,
  formatShortRangeDate,
  fromIsoDate,
  makeDayKey,
  normalize,
  pickSuggestedCities,
  safeReadRecent,
  safeWriteRecent,
  toIsoDate,
  type CityLite,
  type DayDetail,
  type DayStopMeta,
  type MapPoint,
} from "@/lib/trip-planner/utils";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import type { ActivePill } from "@/lib/trip-planner/useTripPlanner.types";
import { arrayMove, syncDayDetailsFromPlan } from "@/lib/trip-planner/useTripPlanner.utils";
import { fetchPlaceCoordinates, saveItineraryToSupabase } from "@/lib/trip-planner/useTripPlanner.api";

export function useTripPlanner() {
  const [startCityId, setStartCityId] = useState("");
  const [endCityId, setEndCityId] = useState("");

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  // ✅ Controlled month to prevent "jump back to current month"
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => new Date());

  // Desktop popovers
  const [activePill, setActivePill] = useState<ActivePill>(null);
  const [showWherePopover, setShowWherePopover] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);

  // Mobile sheet
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [mobileActive, setMobileActive] = useState<ActivePill>("where");

  // Where typing state
  const [whereStep, setWhereStep] = useState<"start" | "end">("start");
  const [startQuery, setStartQuery] = useState("");
  const [endQuery, setEndQuery] = useState("");
  const [recent, setRecent] = useState<CityLite[]>([]);
  const [suggested, setSuggested] = useState<CityLite[]>(() => pickSuggestedCities());

  const whereRef = useRef<HTMLDivElement | null>(null);
  const whenRef = useRef<HTMLDivElement | null>(null);

  // Places/Things state
  const placesRef = useRef<HTMLDivElement | null>(null);
  const thingsRef = useRef<HTMLDivElement | null>(null);
  const [activePlacesThingsPill, setActivePlacesThingsPill] = useState<"places" | "things" | null>(null);
  const [showPlacesPopover, setShowPlacesPopover] = useState(false);
  const [showThingsPopover, setShowThingsPopover] = useState(false);
  const [placesMobileSheetOpen, setPlacesMobileSheetOpen] = useState(false);
  const [thingsMobileSheetOpen, setThingsMobileSheetOpen] = useState(false);
  const [placesQuery, setPlacesQuery] = useState("");
  const [thingsQuery, setThingsQuery] = useState("");
  const [selectedPlaceIds, setSelectedPlaceIds] = useState<string[]>([]);
  const [selectedPlaceData, setSelectedPlaceData] = useState<Map<string, Place>>(new Map());
  const [selectedThingIds, setSelectedThingIds] = useState<string[]>([]);

  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { user } = useAuth();

  const [routeStops, setRouteStops] = useState<string[]>([]);
  const [nightsPerStop, setNightsPerStop] = useState<number[]>([]);
  const [dayStopMeta, setDayStopMeta] = useState<DayStopMeta[]>([]);

  const [mapPoints, setMapPoints] = useState<MapPoint[]>([]);
  const [legs, setLegs] = useState<import("@/lib/itinerary").TripLeg[]>([]);
  const [legsLoading, setLegsLoading] = useState(false);

  const [dayDetails, setDayDetails] = useState<Record<string, DayDetail>>({});
  const [roadSectorDetails, setRoadSectorDetails] = useState<Record<number, import("@/lib/trip-planner/utils").RoadSectorDetail>>({});
  const [startSectorType, setStartSectorType] = useState<import("@/lib/trip-planner/utils").StartEndSectorType>("road");
  const [endSectorType, setEndSectorType] = useState<import("@/lib/trip-planner/utils").StartEndSectorType>("road");

  // UI state for "add stop after this"
  const [addingStopAfterIndex, setAddingStopAfterIndex] = useState<number | null>(null);
  const [newStopCityId, setNewStopCityId] = useState<string | null>(NZ_CITIES[0]?.id ?? null);

  // ✅ UI state for nested stop groups (collapsed by default)
  const [openStops, setOpenStops] = useState<Record<number, boolean>>({});

  // Store selected city data directly to handle places not yet in cache
  const [startCityData, setStartCityData] = useState<Place | null>(null);
  const [endCityData, setEndCityData] = useState<Place | null>(null);

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

  useEffect(() => {
    setRecent(safeReadRecent());
    
    // Load places from Supabase and update suggested cities when ready
    getAllPlaces().then(() => {
      // Places are now loaded, update suggested cities
      setSuggested(pickSuggestedCities());
    });
  }, []);

  // Close desktop popovers on outside click
  useEffect(() => {
    function onDocMouseDown(e: MouseEvent | TouchEvent) {
      const t = e.target as Node | null;
      if (!t) return;

      // Check if clicking on a button or interactive element - don't close if so
      const target = e.target as HTMLElement;
      if (target.tagName === "BUTTON" || target.closest("button") || target.closest("input")) {
        return;
      }

      const inWhere = whereRef.current?.contains(t);
      const inWhen = whenRef.current?.contains(t);
      const inPlaces = placesRef.current?.contains(t);
      const inThings = thingsRef.current?.contains(t);

      if (!inWhere) {
        setShowWherePopover(false);
        if (activePill === "where") setActivePill(null);
      }
      if (!inWhen) {
        setShowCalendar(false);
        if (activePill === "when") setActivePill(null);
      }
      if (!inPlaces) {
        setShowPlacesPopover(false);
        if (activePlacesThingsPill === "places") setActivePlacesThingsPill(null);
      }
      if (!inThings) {
        setShowThingsPopover(false);
        if (activePlacesThingsPill === "things") setActivePlacesThingsPill(null);
      }
    }

    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("touchstart", onDocMouseDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("touchstart", onDocMouseDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePill, activePlacesThingsPill]);

  // Lock body scroll when mobile sheet open
  useEffect(() => {
    if (!mobileSheetOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileSheetOpen]);


  function handleDateRangeChange(range: DateRange | undefined) {
    setDateRange(range);

    if (!range?.from) {
      setStartDate("");
      setEndDate("");
      return;
    }

    if (!range.to) {
      setStartDate(toIsoDate(range.from));
      setEndDate("");
      setCalendarMonth(range.from);
      return;
    }

    let from = range.from;
    let to = range.to;
    if (to < from) [from, to] = [to, from];

    setStartDate(toIsoDate(from));
    setEndDate(toIsoDate(to));
    setCalendarMonth(from);
  }

  function pushRecent(city: CityLite) {
    const next = [city, ...recent.filter((r) => r.id !== city.id)].slice(0, 8);
    setRecent(next);
    safeWriteRecent(next);
  }

  function openWhereDesktop() {
    setActivePill("where");
    setShowWherePopover(true);
    setShowCalendar(false);
    setWhereStep("start");
    setStartQuery(startCity?.name ?? "");
    setEndQuery(endCity?.name ?? "");
  }

  function openWhenDesktop() {
    setActivePill("when");
    setShowCalendar(true);
    setShowWherePopover(false);

    const anchor = fromIsoDate(startDate) ?? new Date();
    setCalendarMonth(anchor);
  }

  function openPlacesDesktop() {
    // Check if mobile (screen width < 768px)
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setPlacesMobileSheetOpen(true);
      setPlacesQuery("");
    } else {
      setActivePlacesThingsPill("places");
      setShowPlacesPopover(true);
      setShowThingsPopover(false);
      setPlacesQuery("");
    }
  }

  function openThingsDesktop() {
    // Check if mobile (screen width < 768px)
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setThingsMobileSheetOpen(true);
      setThingsQuery("");
    } else {
      setActivePlacesThingsPill("things");
      setShowThingsPopover(true);
      setShowPlacesPopover(false);
      setThingsQuery("");
    }
  }

  function closePlacesMobileSheet() {
    setPlacesMobileSheetOpen(false);
  }

  function closeThingsMobileSheet() {
    setThingsMobileSheetOpen(false);
  }

  async function selectPlace(cityId: string) {
    try {
      // Try to get from cache first
      let c = getCityById(cityId);
      
      // If not in cache, fetch from database
      if (!c) {
        const { getPlaceById } = await import("@/lib/nzCities");
        c = await getPlaceById(cityId);
      }
      
      // If still not found, try search results as fallback
      if (!c) {
        const found = placesSearchResults.find((r) => r.id === cityId);
        if (found) {
          // Fetch from database using the search result
          const { getPlaceById } = await import("@/lib/nzCities");
          c = await getPlaceById(found.id);
        }
      }
      
      if (!c) {
        console.error(`Could not find place with ID: ${cityId}`);
        return;
      }

      // Validate coordinates - allow if they're in valid range (not just check for 0,0)
      // Some places might legitimately be at 0,0 (though unlikely for NZ)
      const hasValidCoords = (c.lat >= -90 && c.lat <= 90 && c.lng >= -180 && c.lng <= 180);
      if (!hasValidCoords || (c.lat === 0 && c.lng === 0)) {
        console.warn(`Place ${c.name} has invalid coordinates (lat=${c.lat}, lng=${c.lng}), but adding anyway - will try to fetch coordinates later`);
        // Don't return - allow it to be added, we'll try to fetch coordinates when generating itinerary
      }

      // Add to array if not already selected
      if (!selectedPlaceIds.includes(cityId)) {
        setSelectedPlaceIds([...selectedPlaceIds, cityId]);
        // Store the place data
        setSelectedPlaceData((prev) => new Map(prev).set(cityId, c));
        console.log(`Added place: ${c.name} (${cityId}) with coordinates: lat=${c.lat}, lng=${c.lng}`);
      }
      setPlacesQuery("");
      pushRecent({ id: c.id, name: c.name });

      // Keep popover open for multiple selections
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
    setThingsQuery("");

    // Keep popover open for multiple selections
  }

  function removeThing(stopId: string) {
    setSelectedThingIds(selectedThingIds.filter((id) => id !== stopId));
  }

  function openMobileSheet() {
    setMobileSheetOpen(true);
    setMobileActive("where");
    setWhereStep("start");
    setStartQuery(startCity?.name ?? "");
    setEndQuery(endCity?.name ?? "");

    const anchor = fromIsoDate(startDate) ?? new Date();
    setCalendarMonth(anchor);
  }

  function closeMobileSheet() {
    setMobileSheetOpen(false);
  }

  async function selectStartCity(cityId: string) {
    // Try to get from cache first
    let c = getCityById(cityId);
    
    // If not in cache, fetch from database
    if (!c) {
      const { getPlaceById } = await import("@/lib/nzCities");
      c = await getPlaceById(cityId);
      
      // If still not found, try search results as fallback
      if (!c) {
        const found = startSearchResults.find((r) => r.id === cityId);
        if (found) {
          // Fetch from database using the search result
          c = await getPlaceById(found.id);
        }
      }
    }
    
    if (!c) {
      // Last resort: try querying database directly by name if we have search results
      const found = startSearchResults.find((r) => r.id === cityId);
      if (found) {
        // Try one more direct database query by name as fallback
        const { searchPlacesByName } = await import("@/lib/nzCities");
        const searchResults = await searchPlacesByName(found.name, 1);
        if (searchResults.length > 0 && searchResults[0].id === cityId) {
          c = searchResults[0];
        } else {
          console.error(`Could not find place in database: ${found.name} (${cityId})`);
          return;
        }
      } else {
        console.error(`Could not find place: ${cityId}`);
        return; // Can't find the city anywhere
      }
    }

    // Validate coordinates before storing
    if ((c.lat === 0 && c.lng === 0) || !c.lat || !c.lng) {
      console.error(`Place ${c.name} (${cityId}) has invalid coordinates: lat=${c.lat}, lng=${c.lng}`);
      // Still store it, but log the error - we'll try to fetch coordinates when generating itinerary
    }

    // Store the city data in state so it's immediately available
    setStartCityData(c);
    setStartCityId(cityId);
    setStartQuery(c.name);
    pushRecent({ id: c.id, name: c.name });

    setWhereStep("end");
  }

  async function selectEndCity(cityId: string) {
    // Try to get from cache first
    let c = getCityById(cityId);
    
    // If not in cache, fetch from database
    if (!c) {
      const { getPlaceById } = await import("@/lib/nzCities");
      c = await getPlaceById(cityId);
      
      // If still not found, try search results as fallback
      if (!c) {
        const found = endSearchResults.find((r) => r.id === cityId);
        if (found) {
          // Fetch from database using the search result
          c = await getPlaceById(found.id);
        }
      }
    }
    
    if (!c) {
      // Last resort: try querying database directly by name if we have search results
      const found = endSearchResults.find((r) => r.id === cityId);
      if (found) {
        // Try one more direct database query by name as fallback
        const { searchPlacesByName } = await import("@/lib/nzCities");
        const searchResults = await searchPlacesByName(found.name, 1);
        if (searchResults.length > 0 && searchResults[0].id === cityId) {
          c = searchResults[0];
        } else {
          console.error(`Could not find place in database: ${found.name} (${cityId})`);
          return;
        }
      } else {
        console.error(`Could not find place: ${cityId}`);
        return; // Can't find the city anywhere
      }
    }

    // Validate coordinates before storing
    if ((c.lat === 0 && c.lng === 0) || !c.lat || !c.lng) {
      console.error(`Place ${c.name} (${cityId}) has invalid coordinates: lat=${c.lat}, lng=${c.lng}`);
      // Still store it, but log the error - we'll try to fetch coordinates when generating itinerary
    }

    // Store the city data in state so it's immediately available
    setEndCityData(c);
    setEndCityId(cityId);
    setEndQuery(c.name);
    pushRecent({ id: c.id, name: c.name });

    setTimeout(() => {
      if (mobileSheetOpen) {
        setMobileActive("when");
      } else {
        setShowWherePopover(false);
        setActivePill("when");
        setShowCalendar(true);
        const anchor = fromIsoDate(startDate) ?? new Date();
        setCalendarMonth(anchor);
      }
    }, 0);
  }

  function selectReturnToStart() {
    if (!startCity) return;
    setEndCityId(startCity.id);
    setEndQuery("Return to start city");

    setTimeout(() => {
      if (mobileSheetOpen) {
        setMobileActive("when");
      } else {
        setShowWherePopover(false);
        setActivePill("when");
        setShowCalendar(true);
        const anchor = fromIsoDate(startDate) ?? new Date();
        setCalendarMonth(anchor);
      }
    }, 0);
  }

  const [startSearchResults, setStartSearchResults] = useState<CityLite[]>([]);
  const [endSearchResults, setEndSearchResults] = useState<CityLite[]>([]);
  const [placesSearchResults, setPlacesSearchResults] = useState<CityLite[]>([]);
  
  // Search places for start city using database (searches across all name variants)
  useEffect(() => {
    if (!startQuery.trim()) {
      setStartSearchResults([]);
      return;
    }
    
    const searchPlaces = async () => {
      try {
        const results = await searchPlacesByName(startQuery, 20);
        setStartSearchResults(
          results.slice(0, 8).map((p) => ({ id: p.id, name: p.name }))
        );
      } catch (error) {
        console.error("Error searching places for start city:", error);
        setStartSearchResults([]);
      }
    };
    
    // Debounce search
    const timeoutId = setTimeout(searchPlaces, 300);
    return () => clearTimeout(timeoutId);
  }, [startQuery]);

  // Search places for end city using database (searches across all name variants)
  useEffect(() => {
    if (!endQuery.trim()) {
      setEndSearchResults([]);
      return;
    }
    
    const searchPlaces = async () => {
      try {
        const results = await searchPlacesByName(endQuery, 20);
        setEndSearchResults(
          results.slice(0, 8).map((p) => ({ id: p.id, name: p.name }))
        );
      } catch (error) {
        console.error("Error searching places for end city:", error);
        setEndSearchResults([]);
      }
    };
    
    // Debounce search
    const timeoutId = setTimeout(searchPlaces, 300);
    return () => clearTimeout(timeoutId);
  }, [endQuery]);

  // Search places using database (searches across all name variants)
  useEffect(() => {
    if (!placesQuery.trim()) {
      setPlacesSearchResults([]);
      return;
    }
    
    const searchPlaces = async () => {
      try {
        const results = await searchPlacesByName(placesQuery, 20);
        setPlacesSearchResults(
          results.slice(0, 8).map((p) => ({ id: p.id, name: p.name }))
        );
      } catch (error) {
        console.error("Error searching places:", error);
        setPlacesSearchResults([]);
      }
    };
    
    // Debounce search
    const timeoutId = setTimeout(searchPlaces, 300);
    return () => clearTimeout(timeoutId);
  }, [placesQuery]);

  const startResults = useMemo(() => {
    return startSearchResults;
  }, [startSearchResults]);

  const endResults = useMemo(() => {
    return endSearchResults;
  }, [endSearchResults]);
  
  const placesResults = useMemo(() => {
    return placesSearchResults;
  }, [placesSearchResults]);

  const thingsResults = useMemo(() => {
    const q = normalize(thingsQuery);
    if (!q) return [];
    return NZ_STOPS.filter((stop) => {
      if (normalize(stop.name).includes(q)) return true;
      return stop.aliases?.some((alias) => normalize(alias).includes(q));
    }).slice(0, 8);
  }, [thingsQuery]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setHasSubmitted(true);
    setError(null);

    // Use the computed startCity and endCity which include stored data
    const start = startCity;
    const end = endCity;

    if (!start || !end) {
      setPlan(null);
      setMapPoints([]);
      setLegs([]);
      setError("Please select both a start city and an end city.");
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
          const { getPlaceById, searchPlacesByName } = await import("@/lib/nzCities");
          
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
        .filter((c): c is Place => c !== undefined);
      
      // Also ensure start and end cities have valid coordinates
      if ((start.lat === 0 && start.lng === 0) || !start.lat || !start.lng) {
        console.log(`Fetching coordinates for start city: ${start.name} (${startCityId})`);
        const { getPlaceById, searchPlacesByName } = await import("@/lib/nzCities");
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
      
      if ((end.lat === 0 && end.lng === 0) || !end.lat || !end.lng) {
        console.log(`Fetching coordinates for end city: ${end.name} (${endCityId})`);
        const { getPlaceById, searchPlacesByName } = await import("@/lib/nzCities");
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

      // Combine selected places (city names) and things (stop names) into waypoint names
      const placeNames = selectedPlacesData.map((city) => city.name);
      
      const thingNames = selectedThingIds.map((id) => {
        const stop = NZ_STOPS.find((s) => s.id === id);
        return stop?.name ?? "";
      }).filter(Boolean);
      
      const rawWaypointNames = [...placeNames, ...thingNames];

      const { orderedNames, matchedStopsInOrder } = orderWaypointNamesByRoute(
        start,
        end,
        rawWaypointNames
      );

      // Debug logging
      console.log("Waypoint processing:", {
        selectedPlaceIds,
        selectedPlacesData: selectedPlacesData.map(p => ({ id: p.id, name: p.name, lat: p.lat, lng: p.lng })),
        placeNames,
        rawWaypointNames,
        orderedNames,
        start: start.name,
        end: end.name
      });

      const stops: string[] = [start.name, ...orderedNames, end.name];
      setRouteStops(stops);

      const totalDays = countDaysInclusive(startDate, endDate);
      const initialNights = allocateNightsForStops(stops.length, totalDays);
      
      // Handle special case: same start/end with no middle stops
      // Start = road (0 nights), End = itinerary (at least 1 night)
      if (stops.length === 2 && start.name === end.name) {
        initialNights[0] = 0; // Start: road sector
        initialNights[1] = Math.max(1, totalDays); // End: itinerary sector
        setStartSectorType("road");
        setEndSectorType("itinerary");
      } else if (stops.length === 2) {
        // Just start and end (different cities) - end should be itinerary by default
        initialNights[0] = 0; // Start: road sector
        initialNights[1] = Math.max(1, totalDays); // End: itinerary sector
        setStartSectorType("road");
        setEndSectorType("itinerary");
      } else {
        // Default: both start and end are road sectors (0 nights)
        // Allocate all nights to middle stops only
        initialNights[0] = 0;
        initialNights[initialNights.length - 1] = 0;
        
        // Redistribute all totalDays to middle stops (round-robin)
        if (stops.length > 2 && totalDays > 0) {
          const middleStopCount = stops.length - 2;
          const baseNightsPerMiddle = Math.floor(totalDays / middleStopCount);
          const extraNights = totalDays % middleStopCount;
          
          for (let i = 1; i < stops.length - 1; i++) {
            initialNights[i] = baseNightsPerMiddle + (i - 1 < extraNights ? 1 : 0);
          }
        }
        
        setStartSectorType("road");
        setEndSectorType("road");
      }
      
      setNightsPerStop(initialNights);

      const nextPlan = buildTripPlanFromStopsAndNights(stops, initialNights, startDate);
      setPlan(nextPlan);
      setDayDetails((prev) => syncDayDetailsFromPlan(nextPlan, prev));
      setDayStopMeta(buildDayStopMeta(stops, initialNights));

      // collapse stop groups by default for new plans
      setOpenStops({});

      // Don't update endDate - preserve user's original selection

      // Build map points from all selected places, not just matched stops
      // Create a map of place names to their coordinates for quick lookup
      const placeCoordsMap = new Map<string, { lat: number; lng: number; name: string }>();
      
      // Add selected places coordinates (case-insensitive lookup)
      selectedPlacesData.forEach((place) => {
        const key = place.name.toLowerCase();
        placeCoordsMap.set(key, { lat: place.lat, lng: place.lng, name: place.name });
      });
      
      // Add matched stops coordinates (for things/stops)
      matchedStopsInOrder.forEach((stop) => {
        const key = stop.name.toLowerCase();
        if (!placeCoordsMap.has(key)) {
          placeCoordsMap.set(key, { lat: stop.lat, lng: stop.lng, name: stop.name });
        }
      });

      // Build waypoint points in the order they appear in orderedNames
      const waypointPoints: MapPoint[] = orderedNames.map((name) => {
        // Try case-insensitive lookup first
        const key = name.toLowerCase();
        const coords = placeCoordsMap.get(key);
        if (coords) {
          return { lat: coords.lat, lng: coords.lng, name: coords.name };
        }
        // Fallback: try exact match in selected places
        const place = selectedPlacesData.find((p) => p.name.toLowerCase() === key);
        if (place) {
          return { lat: place.lat, lng: place.lng, name: place.name };
        }
        // Fallback: try exact match in matched stops
        const stop = matchedStopsInOrder.find((s) => s.name.toLowerCase() === key);
        if (stop) {
          return { lat: stop.lat, lng: stop.lng, name: stop.name };
        }
        // Last resort: log warning and return with 0,0 (shouldn't happen)
        console.warn(`Could not find coordinates for waypoint: ${name}`);
        return { lat: 0, lng: 0, name };
      }).filter((p) => p.lat !== 0 || p.lng !== 0); // Filter out invalid coordinates

      const points: MapPoint[] = [
        { lat: start.lat, lng: start.lng, name: start.name },
        ...waypointPoints,
        { lat: end.lat, lng: end.lng, name: end.name },
      ];

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

      console.log("Map points validation:", {
        total: points.length,
        valid: validPoints.length,
        points: points.map(p => ({ name: p.name, lat: p.lat, lng: p.lng }))
      });

      // Need at least start and end cities with valid coordinates
      if (validPoints.length < 2) {
        console.error("Not enough valid map points:", validPoints);
        // Try to provide more helpful error message
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
        // Still set the valid points we have (at least start/end if valid)
        setMapPoints(validPoints);
        return;
      }

      setMapPoints(validPoints);

      setLegsLoading(true);
      try {
        // Only fetch legs if we have valid points
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
      setEndDate(last.date);
    }
  }

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

    // Get the end city to ensure it's always preserved
    const endCityName = endCity?.name;
    if (!endCity || !endCityName) {
      console.error("End city not found");
      return;
    }

    const newRouteStops = routeStops.filter((_, i) => i !== idx);
    const newNightsPerStop = nightsPerStop.filter((_, i) => i !== idx);
    
    // Always ensure the end city is the last stop (in case it was duplicated)
    if (newRouteStops[newRouteStops.length - 1] !== endCityName) {
      // If the last stop is not the end city, replace it
      newRouteStops[newRouteStops.length - 1] = endCityName;
    }

    // Rebuild mapPoints to ensure start and end cities are always correct
    const newMapPoints: MapPoint[] = [];
    
    // Always start with the start city
    if (startCity) {
      newMapPoints.push({
        lat: startCity.lat,
        lng: startCity.lng,
        name: startCity.name,
      });
    }

    // Add middle stops (skip first and last from newRouteStops)
    for (let i = 1; i < newRouteStops.length - 1; i++) {
      const stopName = newRouteStops[i];
      // Try to find the corresponding mapPoint from the original array
      // We need to map the index correctly since we removed one item
      let originalMapIdx = i;
      if (i > idx) {
        // If we're past the removed index, we need to adjust
        originalMapIdx = i + 1;
      }
      
      // Find the mapPoint that matches this stop name and wasn't at the removed index
      const matchingPoint = mapPoints.find((p, origIdx) => {
        return p.name === stopName && origIdx !== idx && origIdx !== 0 && origIdx !== mapPoints.length - 1;
      });
      
      if (matchingPoint) {
        newMapPoints.push(matchingPoint);
      } else {
        // Fallback: look up coordinates
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

    // Always end with the end city
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
      setEndDate(last.date);
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

  // ✅ NEW: drag/drop reorder for main stops
  function handleReorderStops(fromIndex: number, toIndex: number) {
    if (!startDate) return;
    if (!routeStops.length) return;

    // keep start/end fixed
    const minIndex = 1;
    const maxIndex = routeStops.length - 2;

    if (routeStops.length < 3) return;

    const from = Math.min(Math.max(fromIndex, minIndex), maxIndex);
    const to = Math.min(Math.max(toIndex, minIndex), maxIndex);

    if (from === to) return;

    const newRouteStops = arrayMove(routeStops, from, to);
    const newNightsPerStop = arrayMove(nightsPerStop, from, to);
    const newMapPoints = arrayMove(mapPoints, from, to);

    // Reorder road sector details (keyed by destination stop index)
    // When a stop moves, its road sector details (which are keyed by destination index) move with it
    const newRoadSectorDetails: Record<number, import("@/lib/trip-planner/utils").RoadSectorDetail> = {};
    for (let newIdx = 0; newIdx < newRouteStops.length; newIdx++) {
      // Find which old index this new index corresponds to
      let oldIdx: number;
      if (newIdx === from) {
        oldIdx = to; // The item that moved from 'to' is now at 'from'
      } else if (newIdx === to) {
        oldIdx = from; // The item that moved from 'from' is now at 'to'
      } else {
        oldIdx = newIdx; // Unchanged positions
      }
      if (roadSectorDetails[oldIdx]) {
        newRoadSectorDetails[newIdx] = roadSectorDetails[oldIdx];
      }
    }
    setRoadSectorDetails(newRoadSectorDetails);

    // preserve open state by stop name
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
      setEndDate(last.date);
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

  function handleStartAddStop(afterIndex: number) {
    setAddingStopAfterIndex(afterIndex);
    setNewStopCityId(null);
  }

  function handleCancelAddStop() {
    setAddingStopAfterIndex(null);
  }

  async function handleConfirmAddStop() {
    if (addingStopAfterIndex === null || !newStopCityId) return;

    // Try to get from cache first
    let city = getCityById(newStopCityId);
    
    // If not in cache, fetch from database
    if (!city) {
      const { getPlaceById } = await import("@/lib/nzCities");
      city = await getPlaceById(newStopCityId);
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
      setEndDate(last.date);
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

  function toggleDayOpen(date: string, location: string) {
    const key = makeDayKey(date, location);
    setDayDetails((prev) => {
      const existing = prev[key];
      if (!existing) {
        return { ...prev, [key]: { notes: "", accommodation: "", isOpen: true } };
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
      },
    }));
  }

  function toggleRoadSectorOpen(destinationStopIndex: number) {
    setRoadSectorDetails((prev) => {
      const existing = prev[destinationStopIndex];
      if (!existing) {
        return { ...prev, [destinationStopIndex]: { activities: "", isOpen: true } };
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
      },
    }));
  }

  function convertStartToItinerary() {
    if (!startDate || routeStops.length === 0) return;
    
    const newNightsPerStop = [...nightsPerStop];
    // Set start city to at least 1 night
    if (newNightsPerStop[0] === 0) {
      newNightsPerStop[0] = 1;
    }
    
    setNightsPerStop(newNightsPerStop);
    setStartSectorType("itinerary");
    
    // Initialize road sector detail for the first middle stop (if exists) or end (if no middle stops)
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
    
    // Remove road sector detail for the first middle stop (if exists) or end (if no middle stops)
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
    // Set end city to at least 1 night
    if (newNightsPerStop[endIndex] === 0) {
      newNightsPerStop[endIndex] = 1;
    }
    
    setNightsPerStop(newNightsPerStop);
    setEndSectorType("itinerary");
    
    // Initialize road sector detail for the end stop
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
    setEndSectorType("road");
    
    // Remove road sector detail for the end stop
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
      setEndDate(last.date);
    }
  }

  function toggleStopOpen(stopIndex: number) {
    setOpenStops((prev) => ({ ...prev, [stopIndex]: !(prev[stopIndex] ?? false) }));
  }

  function expandAllStops() {
    const next: Record<number, boolean> = {};
    for (let i = 0; i < routeStops.length; i++) next[i] = true;
    setOpenStops(next);
  }

  function collapseAllStops() {
    setOpenStops({});
  }

  const totalTripDays = startDate && endDate ? countDaysInclusive(startDate, endDate) : 0;

  const whenLabel =
    startDate && endDate
      ? `${formatShortRangeDate(startDate)} – ${formatShortRangeDate(endDate)}`
      : startDate && !endDate
      ? `${formatShortRangeDate(startDate)} – Add end date`
      : "Add dates";

  const whereSummary =
    startCity && endCity ? `${startCity.name} → ${endCity.name}` : "Add destinations";

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
    : "Add places";

  const thingsSummary = selectedThings.length > 0
    ? `${selectedThings.length} thing${selectedThings.length > 1 ? 's' : ''} selected`
    : "Add things to do";

  async function saveItinerary(title: string, itineraryId?: string): Promise<{ success: boolean; error?: string }> {
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

  function loadItinerary(trip_input: TripInput, trip_plan: any): { success: boolean; error?: string } {
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
      // First try to restore from saved IDs (preferred)
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

  // Save current state to localStorage for persistence across navigation
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
        } : null,
      };

      localStorage.setItem("tripPlanner_draft", JSON.stringify(state));
    } catch (err) {
      console.error("Failed to save trip planner state:", err);
    }
  }

  // Restore state from localStorage
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

  // Clear saved state from localStorage
  function clearSavedState(): void {
    try {
      localStorage.removeItem("tripPlanner_draft");
    } catch (err) {
      console.error("Failed to clear saved state:", err);
    }
  }

  return {
    // refs
    whereRef,
    whenRef,
    placesRef,
    thingsRef,

    // main state
    startCityId,
    endCityId,
    startCity,
    endCity,
    startDate,
    endDate,
    dateRange,
    calendarMonth,

    activePill,
    showWherePopover,
    showCalendar,

    mobileSheetOpen,
    mobileActive,

    whereStep,
    startQuery,
    endQuery,
    recent,
    suggested,

    // places/things state
    activePlacesThingsPill,
    showPlacesPopover,
    showThingsPopover,
    placesMobileSheetOpen,
    thingsMobileSheetOpen,
    placesQuery,
    thingsQuery,
    selectedPlaceIds,
    selectedThingIds,
    selectedPlaces,
    selectedThings,

    plan,
    error,
    hasSubmitted,
    saving,
    saveError,
    routeStops,
    nightsPerStop,
    dayStopMeta,
    mapPoints,
    legs,
    legsLoading,
    dayDetails,
    roadSectorDetails,
    addingStopAfterIndex,
    newStopCityId,
    openStops,

    // derived labels
    totalTripDays,
    whenLabel,
    whereSummary,
    placesSummary,
    thingsSummary,

    // setters
    setCalendarMonth,
    setDateRange,
    setStartDate,
    setEndDate,
    setActivePill,
    setShowWherePopover,
    setShowCalendar,
    setMobileActive,
    setMobileSheetOpen,
    setWhereStep,
    setStartQuery,
    setEndQuery,
    setPlacesQuery,
    setThingsQuery,
    setActivePlacesThingsPill,
    setShowPlacesPopover,
    setShowThingsPopover,
    setSelectedPlaceIds,
    setSelectedThingIds,
    setNewStopCityId,
    setOpenStops,

    // handlers
    handleDateRangeChange,
    handleSubmit,
    openWhereDesktop,
    openWhenDesktop,
    openPlacesDesktop,
    openThingsDesktop,
    openMobileSheet,
    closeMobileSheet,
    closePlacesMobileSheet,
    closeThingsMobileSheet,
    selectStartCity,
    selectEndCity,
    selectReturnToStart,
    selectPlace,
    selectThing,
    removePlace,
    removeThing,
    handleChangeNights,
    handleRemoveStop,
    handleReorderStops,
    handleStartAddStop,
    handleCancelAddStop,
    handleConfirmAddStop,
    toggleDayOpen,
    updateDayNotes,
    updateDayAccommodation,
    toggleRoadSectorOpen,
    updateRoadSectorActivities,
    startSectorType,
    endSectorType,
    convertStartToItinerary,
    convertStartToRoad,
    convertEndToItinerary,
    convertEndToRoad,
    toggleStopOpen,
    expandAllStops,
    collapseAllStops,
    saveItinerary,
    loadItinerary,
    saveStateToLocalStorage,
    restoreStateFromLocalStorage,
    clearSavedState,
    // results
    startResults,
    endResults,
    placesResults,
    thingsResults,
  };
}
