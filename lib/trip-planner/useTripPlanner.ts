"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { DateRange } from "react-day-picker";
import {
  buildTripPlanFromStopsAndNights,
  type TripPlan,
  countDaysInclusive,
} from "@/lib/itinerary";
import {
  DEFAULT_END_CITY_ID,
  DEFAULT_START_CITY_ID,
  getCityById,
  NZ_CITIES,
} from "@/lib/nzCities";
import { NZ_STOPS } from "@/lib/nzStops";
import {
  allocateNightsForStops,
  buildDayStopMeta,
  buildFallbackLegs,
  fetchRoadLegs,
  makeDayKey,
  safeReadRecent,
  safeWriteRecent,
  type DayDetail,
  type DayStopMeta,
  type MapPoint,
  type RecentTrip,
} from "@/lib/trip-planner/utils";

function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  const copy = arr.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

export function useTripPlanner() {
  const [startCityId, setStartCityId] = useState(DEFAULT_START_CITY_ID);
  const [endCityId, setEndCityId] = useState(DEFAULT_END_CITY_ID);
  const [returnToStart, setReturnToStart] = useState(false);

  const [startDate, setStartDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 6);
    return d.toISOString().slice(0, 10);
  });

  const [startQuery, setStartQuery] = useState("");
  const [endQuery, setEndQuery] = useState("");

  const [selectedRange, setSelectedRange] = useState<DateRange | undefined>(
    undefined
  );

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const [recent, setRecent] = useState<RecentTrip[]>([]);

  const [plan, setPlan] = useState<TripPlan>({ days: [] });

  const [routeStops, setRouteStops] = useState<string[]>([]);
  const [nightsPerStop, setNightsPerStop] = useState<number[]>([]);
  const [dayStopMeta, setDayStopMeta] = useState<DayStopMeta[]>([]);

  const [mapPoints, setMapPoints] = useState<MapPoint[]>([]);
  const [legs, setLegs] = useState<import("@/lib/itinerary").TripLeg[]>([]);
  const [legsLoading, setLegsLoading] = useState(false);

  const [dayDetails, setDayDetails] = useState<Record<string, DayDetail>>({});

  // UI state for "add stop after this"
  const [addingStopAfterIndex, setAddingStopAfterIndex] =
    useState<number | null>(null);
  const [newStopCityId, setNewStopCityId] = useState<string | null>(
    NZ_CITIES[0]?.id ?? null
  );

  // stop-group open/close UI
  const [openStops, setOpenStops] = useState<Record<number, boolean>>({});

  // Desktop popovers / mobile sheet state (your existing UI)
  const whereRef = useRef<HTMLDivElement | null>(null);
  const whenRef = useRef<HTMLDivElement | null>(null);
  const [activePill, setActivePill] = useState<"where" | "when" | null>(null);
  const [showWherePopover, setShowWherePopover] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  useEffect(() => {
    setRecent(safeReadRecent());
  }, []);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      const t = e.target as Node | null;
      if (!t) return;

      const inWhere = whereRef.current?.contains(t);
      const inWhen = whenRef.current?.contains(t);

      if (!inWhere) {
        setShowWherePopover(false);
        if (activePill === "where") setActivePill(null);
      }
      if (!inWhen) {
        setShowCalendar(false);
        if (activePill === "when") setActivePill(null);
      }
    }

    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [activePill]);

  const totalTripDays = useMemo(
    () => countDaysInclusive(startDate, endDate),
    [startDate, endDate]
  );

  const startResults = useMemo(() => {
    const q = startQuery.trim().toLowerCase();
    if (!q) return NZ_CITIES;
    return NZ_CITIES.filter((c) => c.name.toLowerCase().includes(q));
  }, [startQuery]);

  const endResults = useMemo(() => {
    const q = endQuery.trim().toLowerCase();
    if (!q) return NZ_CITIES;
    return NZ_CITIES.filter((c) => c.name.toLowerCase().includes(q));
  }, [endQuery]);

  // Waypoints state (used by WaypointsSection in your UI)
  const [waypoints, setWaypoints] = useState<string[]>(
    NZ_STOPS.slice(0, 3).map((s) => s.name)
  );

  const suggestedWaypoints = useMemo(() => NZ_STOPS.map((s) => s.name), []);

  function syncDayDetailsFromPlan(nextPlan: TripPlan) {
    setDayDetails((prev) => {
      const next: Record<string, DayDetail> = {};

      for (const d of nextPlan.days) {
        const key = makeDayKey(d.date, d.location);
        const existing = prev[key];
        next[key] = {
          isOpen: existing?.isOpen ?? false,
          notes: existing?.notes ?? "",
          accommodation: existing?.accommodation ?? "",
        };
      }

      return next;
    });
  }

  function openWhereDesktop() {
    setActivePill("where");
    setShowWherePopover(true);
    setShowCalendar(false);
  }

  function openWhenDesktop() {
    setActivePill("when");
    setShowCalendar(true);
    setShowWherePopover(false);
  }

  function openMobileSheet() {
    setMobileSheetOpen(true);
  }

  function closeMobileSheet() {
    setMobileSheetOpen(false);
  }

  function selectStartCity(id: string) {
    setStartCityId(id);
    const c = getCityById(id);
    setStartQuery(c?.name ?? "");
    setShowWherePopover(false);
    setActivePill(null);
  }

  function selectEndCity(id: string) {
    setEndCityId(id);
    const c = getCityById(id);
    setEndQuery(c?.name ?? "");
    setShowWherePopover(false);
    setActivePill(null);
  }

  function selectReturnToStart(v: boolean) {
    setReturnToStart(v);
    if (v) {
      setEndCityId(startCityId);
      const c = getCityById(startCityId);
      setEndQuery(c?.name ?? "");
    } else {
      setEndCityId(DEFAULT_END_CITY_ID);
      const c = getCityById(DEFAULT_END_CITY_ID);
      setEndQuery(c?.name ?? "");
    }
  }

  function handleDateRangeChange(range: DateRange | undefined) {
    setSelectedRange(range);
    if (!range?.from || !range?.to) return;

    const from = range.from.toISOString().slice(0, 10);
    const to = range.to.toISOString().slice(0, 10);
    setStartDate(from);
    setEndDate(to);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    const start = getCityById(startCityId);
    if (!start) {
      setErrorMsg("Please select a start city.");
      return;
    }

    const endId = returnToStart ? startCityId : endCityId;
    const end = getCityById(endId);
    if (!end) {
      setErrorMsg("Please select an end city.");
      return;
    }

    setIsLoading(true);
    setHasSubmitted(true);

    try {
      // stops = start + waypoints + end
      const stops = [start.name, ...waypoints, end.name];
      setRouteStops(stops);

      const totalDays = countDaysInclusive(startDate, endDate);
      const initialNights = allocateNightsForStops(stops.length, totalDays);
      setNightsPerStop(initialNights);

      const nextPlan = buildTripPlanFromStopsAndNights(
        stops,
        initialNights,
        startDate
      );
      setPlan(nextPlan);
      syncDayDetailsFromPlan(nextPlan);
      setDayStopMeta(buildDayStopMeta(stops, initialNights));
      setOpenStops({});

      // map points
      const points: MapPoint[] = stops
        .map((name) => NZ_CITIES.find((c) => c.name === name))
        .filter(Boolean)
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        .map((c) => ({ lat: c!.lat, lng: c!.lng, name: c!.name }));

      setMapPoints(points);

      setLegsLoading(true);
      try {
        const roadLegs = await fetchRoadLegs(points);
        setLegs(roadLegs);
      } catch (routingErr) {
        console.error("Road routing failed, falling back:", routingErr);
        setLegs(buildFallbackLegs(points));
      } finally {
        setLegsLoading(false);
      }

      safeWriteRecent([
        {
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          startCityId,
          endCityId: endId,
          returnToStart,
          startDate,
          endDate,
        },
        ...recent,
      ]);
      setRecent(safeReadRecent());
    } catch (err) {
      console.error(err);
      setErrorMsg("Something went wrong generating your itinerary.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleChangeNights(stopIndex: number, newValue: number) {
    if (stopIndex <= 0 || stopIndex >= routeStops.length - 1) return;

    const next = nightsPerStop.slice();
    next[stopIndex] = Math.max(1, Math.floor(newValue || 1));

    setNightsPerStop(next);

    const nextPlan = buildTripPlanFromStopsAndNights(routeStops, next, startDate);
    setPlan(nextPlan);
    syncDayDetailsFromPlan(nextPlan);
    setDayStopMeta(buildDayStopMeta(routeStops, next));
  }

  function handleRemoveStop(idx: number) {
    if (idx <= 0 || idx >= routeStops.length - 1) return;

    const newRouteStops = routeStops.filter((_, i) => i !== idx);
    const newNightsPerStop = nightsPerStop.filter((_, i) => i !== idx);
    const newMapPoints = mapPoints.filter((_, i) => i !== idx);

    setRouteStops(newRouteStops);
    setNightsPerStop(newNightsPerStop);
    setMapPoints(newMapPoints);

    const nextPlan = buildTripPlanFromStopsAndNights(
      newRouteStops,
      newNightsPerStop,
      startDate
    );
    setPlan(nextPlan);
    syncDayDetailsFromPlan(nextPlan);
    setDayStopMeta(buildDayStopMeta(newRouteStops, newNightsPerStop));
    setOpenStops({});

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

  // ✅ NEW: reorder stop groups (keeps start/end fixed), updates map + legs + summary
  function handleReorderStops(fromIndex: number, toIndex: number) {
    const minIndex = 1;
    const maxIndex = routeStops.length - 2;

    if (routeStops.length < 3) return;

    const from = Math.min(Math.max(fromIndex, minIndex), maxIndex);
    const to = Math.min(Math.max(toIndex, minIndex), maxIndex);

    if (from === to) return;

    const newRouteStops = arrayMove(routeStops, from, to);
    const newNightsPerStop = arrayMove(nightsPerStop, from, to);
    const newMapPoints = arrayMove(mapPoints, from, to);

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

    const nextPlan = buildTripPlanFromStopsAndNights(
      newRouteStops,
      newNightsPerStop,
      startDate
    );
    setPlan(nextPlan);
    syncDayDetailsFromPlan(nextPlan);
    setDayStopMeta(buildDayStopMeta(newRouteStops, newNightsPerStop));

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

  function handleStartAddStop(stopIndex: number) {
    if (stopIndex < 0 || stopIndex >= routeStops.length) return;
    setAddingStopAfterIndex(stopIndex);

    const currentName = routeStops[stopIndex];
    const current = NZ_CITIES.find((c) => c.name === currentName);
    const nextCandidate =
      NZ_CITIES.find((c) => c.id !== current?.id)?.id ?? NZ_CITIES[0]?.id ?? null;

    setNewStopCityId(nextCandidate);
  }

  function handleCancelAddStop() {
    setAddingStopAfterIndex(null);
  }

  function handleConfirmAddStop() {
    if (addingStopAfterIndex == null) return;
    if (!newStopCityId) return;

    const afterIdx = addingStopAfterIndex;
    if (afterIdx >= routeStops.length - 1) return;

    const city = getCityById(newStopCityId);
    if (!city) return;

    const insertedName = city.name;

    const newRouteStops = routeStops.slice();
    newRouteStops.splice(afterIdx + 1, 0, insertedName);

    const newNightsPerStop = nightsPerStop.slice();
    newNightsPerStop.splice(afterIdx + 1, 0, 1);

    const newPoint: MapPoint = { lat: city.lat, lng: city.lng, name: city.name };
    const newMapPoints = mapPoints.slice();
    newMapPoints.splice(afterIdx + 1, 0, newPoint);

    setRouteStops(newRouteStops);
    setNightsPerStop(newNightsPerStop);
    setMapPoints(newMapPoints);

    const nextPlan = buildTripPlanFromStopsAndNights(
      newRouteStops,
      newNightsPerStop,
      startDate
    );
    setPlan(nextPlan);
    syncDayDetailsFromPlan(nextPlan);
    setDayStopMeta(buildDayStopMeta(newRouteStops, newNightsPerStop));
    setOpenStops({});

    setAddingStopAfterIndex(null);

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

  function toggleDayOpen(date: string, location: string) {
    const key = makeDayKey(date, location);
    setDayDetails((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] ?? { isOpen: false, notes: "", accommodation: "" }),
        isOpen: !(prev[key]?.isOpen ?? false),
      },
    }));
  }

  function updateDayNotes(date: string, location: string, notes: string) {
    const key = makeDayKey(date, location);
    setDayDetails((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] ?? { isOpen: false, notes: "", accommodation: "" }),
        notes,
      },
    }));
  }

  function updateDayAccommodation(
    date: string,
    location: string,
    accommodation: string
  ) {
    const key = makeDayKey(date, location);
    setDayDetails((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] ?? { isOpen: false, notes: "", accommodation: "" }),
        accommodation,
      },
    }));
  }

  function toggleStopOpen(stopIndex: number) {
    setOpenStops((prev) => ({
      ...prev,
      [stopIndex]: !(prev[stopIndex] ?? false),
    }));
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
    whereRef,
    whenRef,
    activePill,
    showWherePopover,
    showCalendar,
    mobileSheetOpen,

    recent,

    startCityId,
    endCityId,
    returnToStart,
    startQuery,
    endQuery,
    startDate,
    endDate,
    selectedRange,

    plan,
    routeStops,
    nightsPerStop,
    dayStopMeta,
    dayDetails,
    mapPoints,
    legs,
    legsLoading,

    totalTripDays,
    isLoading,
    errorMsg,
    hasSubmitted,

    // waypoints
    waypoints,
    setWaypoints,
    suggestedWaypoints,

    // add-stop UI
    addingStopAfterIndex,
    newStopCityId,
    setNewStopCityId,
    openStops,

    // actions
    setStartQuery,
    setEndQuery,
    setStartDate,
    setEndDate,
    handleDateRangeChange,
    handleSubmit,
    openWhereDesktop,
    openWhenDesktop,
    openMobileSheet,
    closeMobileSheet,
    selectStartCity,
    selectEndCity,
    selectReturnToStart,
    handleChangeNights,
    handleRemoveStop,
    handleReorderStops,
    handleStartAddStop,
    handleCancelAddStop,
    handleConfirmAddStop,
    toggleDayOpen,
    updateDayNotes,
    updateDayAccommodation,
    toggleStopOpen,
    expandAllStops,
    collapseAllStops,

    startResults,
    endResults
  };
}
