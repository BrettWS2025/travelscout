// components/TripPlanner.tsx
"use client";

import { useState, useRef, useEffect, FormEvent } from "react";
import dynamic from "next/dynamic";
import {
  buildTripPlanFromStopsAndNights,
  type TripPlan,
  buildLegsFromPoints,
  type TripLeg,
  countDaysInclusive,
} from "@/lib/itinerary";
import {
  NZ_CITIES,
  DEFAULT_START_CITY_ID,
  DEFAULT_END_CITY_ID,
  getCityById,
} from "@/lib/nzCities";
import { orderWaypointNamesByRoute } from "@/lib/nzStops";
import WaypointInput from "@/components/WaypointInput";
import { DayPicker } from "react-day-picker";
import type { DateRange } from "react-day-picker";
import { Calendar } from "lucide-react";

// ⬅️ NOTE: we intentionally DO NOT import
// "react-day-picker/dist/style.css" here any more.

// Dynamically import TripMap only on the client
const TripMap = dynamic(() => import("@/components/TripMap"), {
  ssr: false,
});

function formatDisplayDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${Math.round(km)} km`;
}

function formatDriveHours(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr${h > 1 ? "s" : ""}`;
  return `${h} hr${h > 1 ? "s" : ""} ${m} min`;
}

type MapPoint = {
  lat: number;
  lng: number;
  name?: string;
};

type DayDetail = {
  notes: string;
  accommodation: string;
  isOpen: boolean;
};

function makeDayKey(date: string, location: string): string {
  return `${date}__${location}`;
}

function toIsoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromIsoDate(s: string): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s + "T00:00:00");
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

/**
 * Road-based leg distances via OSRM demo server.
 * Fine for prototyping; for production you’d host/upgrade this.
 */
async function fetchRoadLegs(points: MapPoint[]): Promise<TripLeg[]> {
  if (!points || points.length < 2) return [];

  const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=false&geometries=polyline&steps=false`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`OSRM request failed with status ${res.status}`);
  }

  const data = await res.json();
  const route = data.routes?.[0];
  const legsData = route?.legs as { distance: number; duration: number }[] | undefined;

  if (!route || !legsData || !Array.isArray(legsData)) {
    throw new Error("OSRM response did not contain route legs");
  }

  return legsData.map((leg, idx) => ({
    from: points[idx].name ?? `Stop ${idx + 1}`,
    to: points[idx + 1].name ?? `Stop ${idx + 2}`,
    distanceKm: leg.distance / 1000,
    driveHours: leg.duration / 3600,
  }));
}

/** Simple nights allocator so nights per stop sum to total days. */
function allocateNightsForStops(stopCount: number, totalDays: number): number[] {
  if (stopCount <= 0 || totalDays <= 0) return [];
  const nights = new Array(stopCount).fill(1);
  let remaining = totalDays - stopCount;
  let idx = 0;
  while (remaining > 0) {
    nights[idx % stopCount]++;
    idx++;
    remaining--;
  }
  return nights;
}

export default function TripPlanner() {
  const [startCityId, setStartCityId] = useState(DEFAULT_START_CITY_ID);
  const [endCityId, setEndCityId] = useState(DEFAULT_END_CITY_ID);

  // ISO date strings used by inputs & itinerary logic
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Shared DayPicker state
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [showCalendar, setShowCalendar] = useState(false);
  const [hasPickedStart, setHasPickedStart] = useState(false);

  const [waypoints, setWaypoints] = useState<string[]>(["Lake Tekapo", "Cromwell"]);

  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const [routeStops, setRouteStops] = useState<string[]>([]);
  const [nightsPerStop, setNightsPerStop] = useState<number[]>([]);

  const [mapPoints, setMapPoints] = useState<MapPoint[]>([]);
  const [legs, setLegs] = useState<TripLeg[]>([]);
  const [legsLoading, setLegsLoading] = useState(false);

  const [dayDetails, setDayDetails] = useState<Record<string, DayDetail>>({});

  const calendarRef = useRef<HTMLDivElement | null>(null);

  /** Click-outside to close the calendar. */
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        calendarRef.current &&
        !calendarRef.current.contains(event.target as Node)
      ) {
        setShowCalendar(false);
        setHasPickedStart(false);
      }
    }

    if (showCalendar) {
      document.addEventListener("mousedown", handleClickOutside);
    } else {
      document.removeEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showCalendar]);

  function syncDayDetailsFromPlan(nextPlan: TripPlan) {
    setDayDetails((prev) => {
      const next: Record<string, DayDetail> = {};
      for (const d of nextPlan.days) {
        const key = makeDayKey(d.date, d.location);
        const existing = prev[key];
        next[key] =
          existing ?? {
            notes: "",
            accommodation: "",
            isOpen: false,
          };
      }
      return next;
    });
  }

  /** Calendar selection: first click = start, second click = end. */
  function handleDateRangeChange(range: DateRange | undefined) {
    if (!range?.from) {
      setDateRange(undefined);
      setStartDate("");
      setEndDate("");
      setHasPickedStart(false);
      return;
    }

    if (!hasPickedStart) {
      const from = range.from;
      setHasPickedStart(true);
      setDateRange({ from, to: undefined });
      setStartDate(toIsoDate(from));
      return;
    }

    if (!range.to) {
      const from = range.from;
      setDateRange({ from, to: undefined });
      setStartDate(toIsoDate(from));
      setEndDate("");
      setHasPickedStart(true);
      return;
    }

    let from = range.from;
    let to = range.to;
    if (to < from) [from, to] = [to, from];

    setDateRange({ from, to });
    setStartDate(toIsoDate(from));
    setEndDate(toIsoDate(to));
    setHasPickedStart(false);
    setShowCalendar(false);
  }

  function handleStartDateChange(value: string) {
    setStartDate(value);
    const from = fromIsoDate(value);
    const to = fromIsoDate(endDate);

    if (from && to) {
      if (from.getTime() <= to.getTime()) {
        setDateRange({ from, to });
      } else {
        setDateRange({ from, to: from });
        setEndDate(toIsoDate(from));
      }
    } else if (from) {
      setDateRange({ from, to: undefined });
    } else {
      setDateRange(undefined);
    }
  }

  function handleEndDateChange(value: string) {
    setEndDate(value);
    const from = fromIsoDate(startDate);
    const to = fromIsoDate(value);

    if (from && to) {
      if (from.getTime() <= to.getTime()) {
        setDateRange({ from, to });
      } else {
        setDateRange({ from: to, to: from });
        setStartDate(toIsoDate(to));
      }
    } else if (to) {
      setDateRange({ from: undefined, to });
    } else {
      setDateRange(undefined);
    }
  }

  function openCalendar() {
    setShowCalendar(true);
    setHasPickedStart(false);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setHasSubmitted(true);
    setError(null);

    const startCity = getCityById(startCityId);
    const endCity = getCityById(endCityId);

    if (!startCity || !endCity) {
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
      setError("Please select a start and end date.");
      return;
    }

    try {
      const rawWaypointNames = waypoints;

      const { orderedNames, matchedStopsInOrder } = orderWaypointNamesByRoute(
        startCity,
        endCity,
        rawWaypointNames
      );

      const stops: string[] = [startCity.name, ...orderedNames, endCity.name];
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
        { lat: startCity.lat, lng: startCity.lng, name: startCity.name },
        ...waypointPoints,
        { lat: endCity.lat, lng: endCity.lng, name: endCity.name },
      ];

      setMapPoints(points);

      setLegsLoading(true);
      try {
        const roadLegs = await fetchRoadLegs(points);
        setLegs(roadLegs);
      } catch (routingErr) {
        console.error(
          "Road routing failed, falling back to straight-line:",
          routingErr
        );
        const fallbackLegs = buildLegsFromPoints(points);
        setLegs(fallbackLegs);
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

    const safe = Math.max(0, Math.floor(Number.isNaN(newValue) ? 0 : newValue));
    const next = [...nightsPerStop];
    next[idx] = safe;

    setNightsPerStop(next);

    const nextPlan = buildTripPlanFromStopsAndNights(
      routeStops,
      next,
      startDate
    );
    setPlan(nextPlan);
    syncDayDetailsFromPlan(nextPlan);

    if (nextPlan.days.length > 0) {
      const last = nextPlan.days[nextPlan.days.length - 1];
      setEndDate(last.date);
    }
  }

  function toggleDayOpen(date: string, location: string) {
    const key = makeDayKey(date, location);
    setDayDetails((prev) => {
      const existing = prev[key];
      if (!existing) {
        return {
          ...prev,
          [key]: {
            notes: "",
            accommodation: "",
            isOpen: true,
          },
        };
      }
      return {
        ...prev,
        [key]: {
          ...existing,
          isOpen: !existing.isOpen,
        },
      };
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

  function updateDayAccommodation(
    date: string,
    location: string,
    accommodation: string
  ) {
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

  const totalTripDays =
    startDate && endDate ? countDaysInclusive(startDate, endDate) : 0;

  return (
    <div className="space-y-8">
      {/* --- form card --- */}
      <form
        onSubmit={handleSubmit}
        className="card p-4 md:p-6 space-y-6"
        style={{ color: "var(--text)" }}
      >
        {/* cities, dates, waypoints ... */}
        {/* (same as the long version you already had) */}

        {/* Start/end city pickers */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm font-medium">Start city</label>
            <select
              value={startCityId}
              onChange={(e) => setStartCityId(e.target.value)}
              className="input-dark w-full text-sm"
            >
              {NZ_CITIES.map((city) => (
                <option key={city.id} value={city.id}>
                  {city.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-400">
              Cities are mapped with latitude &amp; longitude, so we can factor
              in realistic driving legs later.
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">End city</label>
            <select
              value={endCityId}
              onChange={(e) => setEndCityId(e.target.value)}
              className="input-dark w-full text-sm"
            >
              {NZ_CITIES.map((city) => (
                <option key={city.id} value={city.id}>
                  {city.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Trip dates */}
        <div className="space-y-3 relative">
          <label className="text-sm font-medium">Trip dates</label>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs text-gray-400">Start date</label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                  className="input-dark w-full text-sm"
                />
                <button
                  type="button"
                  onClick={openCalendar}
                  className="inline-flex items-center justify-center rounded-full border border-white/25 p-2 hover:bg-white/10"
                  aria-label="Open calendar"
                >
                  <Calendar className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-gray-400">End date</label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => handleEndDateChange(e.target.value)}
                  className="input-dark w-full text-sm"
                />
                <button
                  type="button"
                  onClick={openCalendar}
                  className="inline-flex items-center justify-center rounded-full border border-white/25 p-2 hover:bg-white/10"
                  aria-label="Open calendar"
                >
                  <Calendar className="w-4 h-4" />
                </button>
              </div>
              {totalTripDays > 0 && (
                <p className="text-[11px] text-gray-400 mt-1">
                  Total days in itinerary (inclusive):{" "}
                  <strong>{totalTripDays}</strong>
                </p>
              )}
            </div>
          </div>

          <p className="text-xs text-gray-400">
            Click the calendar icon once to pick both dates in one go (click
            your arrival date, then your departure date). You can also use the
            built-in date pickers on each field if you prefer.
          </p>

          {showCalendar && (
            <div
              ref={calendarRef}
              className="absolute right-0 mt-2 z-20 rounded-xl bg-[#1E2C4B] p-3 border border-white/10 shadow-lg"
            >
              <DayPicker
                mode="range"
                selected={dateRange}
                onSelect={handleDateRangeChange}
                numberOfMonths={1}
                weekStartsOn={1}
              />
            </div>
          )}
        </div>

        {/* Waypoints */}
        <div className="space-y-1">
          <label className="text-sm font-medium">
            Places you&apos;d like to visit
          </label>
          <p className="text-xs text-gray-400">
            Start typing a town or scenic stop. We&apos;ll reorder these into a
            logical route between your start and end cities where we recognise
            the stops, and estimate <strong>road</strong> driving times between
            each leg.
          </p>

          <WaypointInput
            value={waypoints}
            onChange={setWaypoints}
            placeholder="Add a stop, e.g. Lake Tekapo"
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-medium bg-[var(--accent)] text-slate-900 hover:brightness-110 transition"
        >
          Generate itinerary
        </button>
      </form>

      {/* nights editor, itinerary, map – unchanged from last version */}
      {/* ... keep the rest of the file exactly as in your working copy ... */}
    </div>
  );
}
