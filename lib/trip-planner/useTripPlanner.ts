"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { DateRange } from "react-day-picker";
import {
  buildTripPlanFromStopsAndNights,
  type TripPlan,
  countDaysInclusive,
} from "@/lib/itinerary";
import {
  NZ_CITIES,
  DEFAULT_START_CITY_ID,
  DEFAULT_END_CITY_ID,
  getCityById,
} from "@/lib/nzCities";
import { orderWaypointNamesByRoute } from "@/lib/nzStops";
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
} from "@/lib/trip-planner/utils";

// ---- Types used by WhereWhenPicker in this repo ----
type ActivePill = "where" | "when" | null;

type CityLite = {
  id: string;
  name: string;
  region?: string;
};

function pickSuggestedCities(): CityLite[] {
  // keep whatever heuristic your repo already used (this is simple + stable)
  return NZ_CITIES.slice(0, 10).map((c) => ({ id: c.id, name: c.name }));
}

function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  const copy = arr.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

export function useTripPlanner() {
  // refs for outside click close on desktop popovers
  const whereRef = useRef<HTMLDivElement | null>(null);
  const whenRef = useRef<HTMLDivElement | null>(null);

  const [activePill, setActivePill] = useState<ActivePill>(null);

  // Desktop popovers
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
  const suggested = useMemo(() => pickSuggestedCities(), []);

  // Core itinerary state
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

  // Calendar state used by WhereWhenPicker
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());

  // Waypoints
  const [waypoints, setWaypoints] = useState<string[]>([]);

  // generated plan + derived structures
  const [plan, setPlan] = useState<TripPlan>({ days: [] });
  const [hasSubmitted, setHasSubmitted] = useState(false);

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

  // status
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setRecent(safeReadRecent().map((r) => ({ id: r.id, name: r.name })));
  }, []);

  // Close desktop popovers on outside click
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

  const whereSummary = useMemo(() => {
    const start = getCityById(startCityId)?.name ?? "Start";
    const end = returnToStart
      ? start
      : getCityById(endCityId)?.name ?? "End";
    return `${start} → ${end}`;
  }, [startCityId, endCityId, returnToStart]);

  const whenLabel = useMemo(() => {
    if (!startDate || !endDate) return "Select dates";
    return `${startDate} → ${endDate}`;
  }, [startDate, endDate]);

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

  function selectStartCity(cityId: string) {
    setStartCityId(cityId);
    const c = getCityById(cityId);
    setStartQuery(c?.name ?? "");
    setWhereStep("end");
  }

  function selectEndCity(cityId: string) {
    setEndCityId(cityId);
    const c = getCityById(cityId);
    setEndQuery(c?.name ?? "");
    setShowWherePopover(false);
    setActivePill(null);
  }

  function selectReturnToStart() {
    setReturnToStart((v) => !v);
  }

  function handleDateRangeChange(range: DateRange | undefined) {
    setDateRange(range);
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
      // build waypoints from the repo's existing helper
      const orderedNames = orderWaypointNamesByRoute(
        start.name,
        end.name,
        startDate,
        endDate,
        waypoints
      );

      const stops = [start.name, ...orderedNames, end.name];
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

      safeWriteRecent({
        id: crypto.randomUUID(),
        name: whereSummary,
      });
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
      NZ_CITIES.find((c) => c.id !== current?.id)?.id ??
      NZ_CITIES[0]?.id ??
      null;

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

    const newPoint: MapPoint = {
      lat: city.lat,
      lng: city.lng,
      name: city.name,
    };
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
    // refs
    whereRef,
    whenRef,

    // where/when state
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

    // where/when actions
    setMobileActive,
    setShowCalendar,
    setActivePill,
    setStartQuery,
    setEndQuery,
    openMobileSheet,
    closeMobileSheet,
    openWhereDesktop,
    openWhenDesktop,
    selectStartCity,
    selectEndCity,
    selectReturnToStart,
    setWhereStep,
    handleDateRangeChange,
    dateRange,
    setDateRange,
    calendarMonth,
    setCalendarMonth,

    // core planning state
    startCityId,
    endCityId,
    returnToStart,
    startDate,
    endDate,
    setStartDate,
    setEndDate,
    totalTripDays,
    whereSummary,
    whenLabel,

    // waypoints
    waypoints,
    setWaypoints,

    // generated plan
    plan,
    routeStops,
    nightsPerStop,
    dayStopMeta,
    dayDetails,
    mapPoints,
    legs,
    legsLoading,
    openStops,

    // status
    isLoading,
    errorMsg,
    hasSubmitted,

    // stop CRUD
    addingStopAfterIndex,
    newStopCityId,
    setNewStopCityId,
    handleChangeNights,
    handleRemoveStop,
    handleReorderStops,
    handleStartAddStop,
    handleConfirmAddStop,
    handleCancelAddStop,

    // day UI
    toggleDayOpen,
    updateDayNotes,
    updateDayAccommodation,
    toggleStopOpen,
    expandAllStops,
    collapseAllStops,

    // submit
    handleSubmit,

    // pickers
    startResults,
    endResults,
  };
}
