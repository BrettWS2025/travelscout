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

type ActivePill = "where" | "when" | null;

export function useTripPlanner() {
  const [startCityId, setStartCityId] = useState(DEFAULT_START_CITY_ID);
  const [endCityId, setEndCityId] = useState(DEFAULT_END_CITY_ID);

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
  const suggested = useMemo(() => pickSuggestedCities(), []);

  const whereRef = useRef<HTMLDivElement | null>(null);
  const whenRef = useRef<HTMLDivElement | null>(null);

  const [waypoints, setWaypoints] = useState<string[]>([
    "Lake Tekapo",
    "Cromwell",
  ]);

  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  // Lock body scroll when mobile sheet open
  useEffect(() => {
    if (!mobileSheetOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileSheetOpen]);

  function syncDayDetailsFromPlan(nextPlan: TripPlan) {
    setDayDetails((prev) => {
      const next: Record<string, DayDetail> = {};
      for (const d of nextPlan.days) {
        const key = makeDayKey(d.date, d.location);
        next[key] =
          prev[key] ?? {
            notes: "",
            accommodation: "",
            isOpen: false,
          };
      }
      return next;
    });
  }

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

  function selectStartCity(cityId: string) {
    const c = getCityById(cityId);
    if (!c) return;

    setStartCityId(cityId);
    setStartQuery(c.name);
    pushRecent({ id: c.id, name: c.name });

    setWhereStep("end");
  }

  function selectEndCity(cityId: string) {
    const c = getCityById(cityId);
    if (!c) return;

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

  const startResults = useMemo(() => {
    const q = normalize(startQuery);
    if (!q) return [];
    return NZ_CITIES.filter((c) => normalize(c.name).includes(q))
      .slice(0, 8)
      .map((c) => ({ id: c.id, name: c.name }));
  }, [startQuery]);

  const endResults = useMemo(() => {
    const q = normalize(endQuery);
    if (!q) return [];
    return NZ_CITIES.filter((c) => normalize(c.name).includes(q))
      .slice(0, 8)
      .map((c) => ({ id: c.id, name: c.name }));
  }, [endQuery]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setHasSubmitted(true);
    setError(null);

    const start = getCityById(startCityId);
    const end = getCityById(endCityId);

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
      const rawWaypointNames = waypoints;

      const { orderedNames, matchedStopsInOrder } = orderWaypointNamesByRoute(
        start,
        end,
        rawWaypointNames
      );

      const stops: string[] = [start.name, ...orderedNames, end.name];
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

      // collapse stop groups by default for new plans
      setOpenStops({});

      if (nextPlan.days.length > 0) {
        const last = nextPlan.days[nextPlan.days.length - 1];
        setEndDate(last.date);
      }

      const waypointPoints: MapPoint[] = matchedStopsInOrder.map((stop) => ({
        lat: stop.lat,
        lng: stop.lng,
        name: stop.name,
      }));

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

  function handleStartAddStop(afterIndex: number) {
    setAddingStopAfterIndex(afterIndex);
    if (!newStopCityId && NZ_CITIES.length > 0) setNewStopCityId(NZ_CITIES[0].id);
  }

  function handleCancelAddStop() {
    setAddingStopAfterIndex(null);
  }

  function handleConfirmAddStop() {
    if (addingStopAfterIndex === null || !newStopCityId) return;

    const city = getCityById(newStopCityId);
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

  const totalTripDays =
    startDate && endDate ? countDaysInclusive(startDate, endDate) : 0;

  const whenLabel =
    startDate && endDate
      ? `${formatShortRangeDate(startDate)} – ${formatShortRangeDate(endDate)}`
      : startDate && !endDate
      ? `${formatShortRangeDate(startDate)} – Add end date`
      : "Add dates";

  const whereSummary =
    startCity && endCity ? `${startCity.name} → ${endCity.name}` : "Add destinations";

  return {
    // refs
    whereRef,
    whenRef,

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

    waypoints,
    plan,
    error,
    hasSubmitted,
    routeStops,
    nightsPerStop,
    dayStopMeta,
    mapPoints,
    legs,
    legsLoading,
    dayDetails,
    addingStopAfterIndex,
    newStopCityId,
    openStops,

    // derived labels
    totalTripDays,
    whenLabel,
    whereSummary,

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
    setWaypoints,
    setNewStopCityId,
    setOpenStops,

    // handlers
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
