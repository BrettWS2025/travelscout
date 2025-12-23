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
import { orderWaypointNamesByRoute } from "@/lib/routeOrdering";
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

type ActivePill = "where" | "when" | null;

export default function useTripPlanner() {
  // Refs for outside-click close on desktop popovers
  const whereRef = useRef<HTMLDivElement | null>(null);
  const whenRef = useRef<HTMLDivElement | null>(null);

  const [activePill, setActivePill] = useState<ActivePill>(null);

  // Desktop popovers
  const [showWherePopover, setShowWherePopover] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);

  // Mobile sheet
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  // Recent trips
  const [recent, setRecent] = useState<RecentTrip[]>([]);

  // Form state
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

  // Search UI for city selects
  const [startQuery, setStartQuery] = useState("");
  const [endQuery, setEndQuery] = useState("");

  // The generated plan (day-by-day)
  const [plan, setPlan] = useState<TripPlan>({ days: [] });

  const [selectedRange, setSelectedRange] = useState<DateRange | undefined>(
    undefined
  );

  // status
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
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

  // ✅ UI state for nested stop groups (collapsed by default)
  const [openStops, setOpenStops] = useState<Record<number, boolean>>({});

  const startCity = getCityById(startCityId);
  const endCity = getCityById(endCityId);

  useEffect(() => {
    setRecent(safeReadRecent());
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePill]);

  const totalTripDays = useMemo(() => {
    return countDaysInclusive(startDate, endDate);
  }, [startDate, endDate]);

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
      // Build ordered route stop names (start + waypoints + end)
      const orderedNames = orderWaypointNamesByRoute(
        start.name,
        end.name,
        startDate,
        endDate
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

      setOpenStops({}); // collapse everything by default

      // map points
      const waypointPoints =
        orderedNames
          .map((nm) => NZ_CITIES.find((c) => c.name === nm))
          .filter(Boolean)
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          .map((stop) => ({
            lat: stop!.lat,
            lng: stop!.lng,
            name: stop!.name,
          })) ?? [];

      const points: MapPoint[] = [
        { lat: start.lat, lng: start.lng, name: start.name },
        ...waypointPoints,
        { lat: end.lat, lng: end.lng, name: end.name },
      ];

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

      // Save recent
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
    if (stopIndex <= 0 || stopIndex >= routeStops.length - 1) {
      alert("Start/end nights are determined by your trip dates.");
      return;
    }

    const next = nightsPerStop.slice();
    next[stopIndex] = Math.max(1, Math.floor(newValue || 1));

    setNightsPerStop(next);

    const nextPlan = buildTripPlanFromStopsAndNights(routeStops, next, startDate);
    setPlan(nextPlan);
    syncDayDetailsFromPlan(nextPlan);
    setDayStopMeta(buildDayStopMeta(routeStops, next));

    if (nextPlan.days.length > 0) {
      const last = nextPlan.days[nextPlan.days.length - 1];
      setEndDate(last.date);
    }
  }

  function handleRemoveStop(idx: number) {
    if (idx <= 0 || idx >= routeStops.length - 1) {
      alert("You can’t remove your start or end city from here.");
      return;
    }
    if (
      !window.confirm(
        `Remove ${routeStops[idx]} from this trip? All days for this stop will be deleted.`
      )
    ) {
      return;
    }

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

  function handleReorderStops(fromIndex: number, toIndex: number) {
    // keep start/end fixed
    const minIndex = 1;
    const maxIndex = routeStops.length - 2;

    if (routeStops.length < 3) return;
    if (fromIndex === toIndex) return;

    const from = Math.min(Math.max(fromIndex, minIndex), maxIndex);
    const to = Math.min(Math.max(toIndex, minIndex), maxIndex);

    if (from === to) return;

    const newRouteStops = arrayMove(routeStops, from, to);
    const newNightsPerStop = arrayMove(nightsPerStop, from, to);
    const newMapPoints = arrayMove(mapPoints, from, to);

    // preserve open state by stop name (since indices change)
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

    // update endDate to match new plan (defensive)
    if (nextPlan.days.length > 0) {
      const last = nextPlan.days[nextPlan.days.length - 1];
      setEndDate(last.date);
    }

    // re-route legs
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

    if (nextPlan.days.length > 0) {
      const last = nextPlan.days[nextPlan.days.length - 1];
      setEndDate(last.date);
    }

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

    // main UI state
    activePill,
    showWherePopover,
    showCalendar,
    mobileSheetOpen,

    // recent
    recent,

    // form state
    startCityId,
    endCityId,
    returnToStart,
    startQuery,
    endQuery,
    startDate,
    endDate,
    selectedRange,

    // results
    plan,
    routeStops,
    nightsPerStop,
    dayStopMeta,
    dayDetails,
    mapPoints,
    legs,
    legsLoading,

    // misc
    totalTripDays,
    isLoading,
    errorMsg,
    hasSubmitted,

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
    // results
    startResults,
    endResults,
  };
}
