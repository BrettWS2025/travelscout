// components/TripPlanner.tsx
"use client";

import { useState, FormEvent } from "react";
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

// Dynamically import TripMap only on the client to avoid `window` errors on the server
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

function formatShortRangeDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
  });
}

function formatDistance(km: number): string {
  if (km < 1) {
    return `${Math.round(km * 1000)} m`;
  }
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

/**
 * Per-day UI metadata (NOT part of core TripPlan).
 * Keyed by (date, location) so it stays aligned with the actual day.
 */
type DayDetail = {
  notes: string;
  accommodation: string;
  isOpen: boolean;
};

/** Build a stable key for a given day in the itinerary. */
function makeDayKey(date: string, location: string): string {
  return `${date}__${location}`;
}

// Helper to convert JS Date -> "YYYY-MM-DD"
function toIsoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Helper to convert "YYYY-MM-DD" -> Date | undefined
function fromIsoDate(s: string): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s + "T00:00:00");
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

/**
 * Fetch road-based distances & times between points using OSRM.
 * This calls the public demo server for now – fine for prototyping.
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
  const legsData =
    (route?.legs as { distance: number; duration: number }[]) || [];

  if (!route || !Array.isArray(legsData)) {
    throw new Error("OSRM response did not contain route legs");
  }

  // OSRM legs line up with successive coordinates:
  // points[0]->points[1], points[1]->points[2], ...
  return legsData.map((leg, idx) => ({
    from: points[idx].name ?? `Stop ${idx + 1}`,
    to: points[idx + 1].name ?? `Stop ${idx + 2}`,
    distanceKm: leg.distance / 1000, // metres -> km
    driveHours: leg.duration / 3600, // seconds -> hours
  }));
}

/**
 * Allocate an initial "nights per stop" array that:
 * - has length = stopCount
 * - sums up to totalDays (inclusive day count)
 * - starts with 1 per stop, then distributes the rest round-robin
 */
function allocateNightsForStops(
  stopCount: number,
  totalDays: number
): number[] {
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

/**
 * Per-day metadata for which stop it belongs to, and whether it's
 * the first day of that stop block.
 */
type DayStopMeta = {
  stopIndex: number;
  isFirstForStop: boolean;
};

function buildDayStopMeta(
  stops: string[],
  nightsPerStop: number[]
): DayStopMeta[] {
  const meta: DayStopMeta[] = [];
  for (let i = 0; i < stops.length; i++) {
    const nights = nightsPerStop[i] ?? 0;
    for (let n = 0; n < nights; n++) {
      meta.push({
        stopIndex: i,
        isFirstForStop: n === 0,
      });
    }
  }
  return meta;
}

export default function TripPlanner() {
  const [startCityId, setStartCityId] = useState(DEFAULT_START_CITY_ID);
  const [endCityId, setEndCityId] = useState(DEFAULT_END_CITY_ID);

  // ISO date strings used by the rest of the logic
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Shared calendar range selection + popover state
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [showCalendar, setShowCalendar] = useState(false);

  const [waypoints, setWaypoints] = useState<string[]>([
    "Lake Tekapo",
    "Cromwell",
  ]);

  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  // Ordered stops for the route (names, including start + end)
  const [routeStops, setRouteStops] = useState<string[]>([]);
  // Nights per stop (editable)
  const [nightsPerStop, setNightsPerStop] = useState<number[]>([]);
  // For each day, which stop index it belongs to + whether it's the first day of that stop
  const [dayStopMeta, setDayStopMeta] = useState<DayStopMeta[]>([]);

  // Points passed down to the map: start → (ordered matched waypoints) → end
  const [mapPoints, setMapPoints] = useState<MapPoint[]>([]);
  // Driving legs between those points
  const [legs, setLegs] = useState<TripLeg[]>([]);
  const [legsLoading, setLegsLoading] = useState(false);

  // Per-day UI details: keyed by dayKey = `${date}__${location}`
  const [dayDetails, setDayDetails] = useState<Record<string, DayDetail>>({});

  /** Sync the dayDetails map any time the plan changes. */
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

  /** When the user selects a date range in the calendar. */
  function handleDateRangeChange(range: DateRange | undefined) {
    setDateRange(range);

    if (!range?.from) {
      setStartDate("");
      setEndDate("");
      return;
    }

    // If only one date picked so far
    if (!range.to) {
      setStartDate(toIsoDate(range.from));
      setEndDate("");
      return;
    }

    // Ensure from <= to
    let from = range.from;
    let to = range.to;
    if (to < from) {
      [from, to] = [to, from];
    }

    setStartDate(toIsoDate(from));
    setEndDate(toIsoDate(to));
    // We keep the calendar open; user closes with "Done"
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
      setError("Please select your trip dates.");
      return;
    }

    try {
      // 1) Waypoints come directly from chips
      const rawWaypointNames = waypoints;

      // 2) Use coordinates to order waypoint names in a logical route order
      const { orderedNames, matchedStopsInOrder } =
        orderWaypointNamesByRoute(startCity, endCity, rawWaypointNames);

      // 3) Build routeStops = start + ordered waypoints + end
      const stops: string[] = [startCity.name, ...orderedNames, endCity.name];
      setRouteStops(stops);

      // 4) Compute total days and initial nights per stop
      const totalDays = countDaysInclusive(startDate, endDate);
      const initialNights = allocateNightsForStops(stops.length, totalDays);
      setNightsPerStop(initialNights);

      // 5) Build the day-by-day itinerary from stops + nights
      const nextPlan = buildTripPlanFromStopsAndNights(
        stops,
        initialNights,
        startDate
      );
      setPlan(nextPlan);
      syncDayDetailsFromPlan(nextPlan);
      setDayStopMeta(buildDayStopMeta(stops, initialNights));

      // Keep endDate in sync with the last day of the plan
      if (nextPlan.days.length > 0) {
        const last = nextPlan.days[nextPlan.days.length - 1];
        setEndDate(last.date);
      }

      // 6) Build map points: start city → ordered mapped waypoints → end city
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

      // 7) Compute driving legs using road distances
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
      setError(
        err instanceof Error ? err.message : "Something went wrong."
      );
    }
  }

  /** Change nights for a stop, with min 1 night so stops never disappear. */
  function handleChangeNights(idx: number, newValue: number) {
    if (!routeStops.length) return;
    if (!startDate) return;

    const safe = Math.max(
      1,
      Math.floor(Number.isNaN(newValue) ? 1 : newValue)
    );

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
    setDayStopMeta(buildDayStopMeta(routeStops, next));

    if (nextPlan.days.length > 0) {
      const last = nextPlan.days[nextPlan.days.length - 1];
      setEndDate(last.date);
    }
  }

  /** Remove an intermediate stop entirely (not start/end). */
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

    if (nextPlan.days.length > 0) {
      const last = nextPlan.days[nextPlan.days.length - 1];
      setEndDate(last.date);
    }

    // Recompute legs for the updated route
    if (newMapPoints.length >= 2) {
      setLegsLoading(true);
      fetchRoadLegs(newMapPoints)
        .then((roadLegs) => setLegs(roadLegs))
        .catch((routingErr) => {
          console.error(
            "Road routing failed after removing stop, falling back to straight-line:",
            routingErr
          );
          const fallbackLegs = buildLegsFromPoints(newMapPoints);
          setLegs(fallbackLegs);
        })
        .finally(() => setLegsLoading(false));
    } else {
      setLegs([]);
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

  const whenLabel =
    startDate && endDate
      ? `${formatShortRangeDate(startDate)} – ${formatShortRangeDate(
          endDate
        )}`
      : "Add dates";

  return (
    <div className="space-y-8">
      {/* Form */}
      <form
        onSubmit={handleSubmit}
        className="card p-4 md:p-6 space-y-6"
        style={{ color: "var(--text)" }}
      >
        <div className="grid gap-4 md:grid-cols-2">
          {/* Start city */}
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

          {/* End city */}
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

        {/* Trip dates: single "When" control + calendar */}
        <div className="space-y-2 relative">
          <label className="text-sm font-medium">Trip dates</label>

          <div className="relative inline-block">
            <button
              type="button"
              onClick={() => setShowCalendar((v) => !v)}
              className="flex items-center justify-between w-full md:w-80 px-4 py-3 rounded-full bg-[var(--card)] border border-white/15 hover:border-white/35 text-left"
            >
              <div className="flex flex-col">
                <span className="text-[11px] text-gray-400 uppercase tracking-wide">
                  When
                </span>
                <span className="text-sm">{whenLabel}</span>
              </div>
              <Calendar className="w-4 h-4 opacity-80" />
            </button>

            {showCalendar && (
              <div className="absolute left-0 mt-3 z-20 rounded-xl bg-[#1E2C4B] p-3 border border-white/10 shadow-lg min-w-[620px]">
                <DayPicker
                  mode="range"
                  selected={dateRange}
                  onSelect={handleDateRangeChange}
                  numberOfMonths={2}
                  weekStartsOn={1}
                  styles={{
                    months: {
                      display: "flex",
                      flexWrap: "nowrap",
                      gap: "2rem",
                    },
                    month: {
                      width: "auto",
                    },
                  }}
                />
                <div className="flex justify-end mt-2">
                  <button
                    type="button"
                    className="text-[11px] text-gray-300 hover:text-white underline underline-offset-2"
                    onClick={() => setShowCalendar(false)}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>

          {totalTripDays > 0 && (
            <p className="text-[11px] text-gray-400 mt-1">
              Total days in itinerary (inclusive):{" "}
              <strong>{totalTripDays}</strong>
            </p>
          )}

          <p className="text-xs text-gray-400">
            Click once to open the calendar, then choose your arrival and
            departure dates in one go. We&apos;ll use these to spread nights
            across your stops.
          </p>
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

      {/* Results: itinerary table with inline nights editor */}
      {hasSubmitted && !plan && !error && (
        <p className="text-sm text-gray-400">
          Fill in your trip details and click &quot;Generate itinerary&quot;.
        </p>
      )}

      {plan && plan.days.length > 0 && (
        <div className="card p-4 md:p-6 space-y-4">
          <h2 className="text-lg font-semibold">Your draft itinerary</h2>
          <p className="text-sm text-gray-400">
            Adjust nights for each stop and expand a day to add what you&apos;re
            doing and where you&apos;re staying.
          </p>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-gray-400">
                <tr>
                  <th className="py-2 pr-4">Day</th>
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Location</th>
                  <th className="py-2 pr-4">Nights</th>
                  <th className="py-2 pr-4">Details</th>
                </tr>
              </thead>
              <tbody>
                {plan.days.map((d, dayIdx) => {
                  const key = makeDayKey(d.date, d.location);
                  const detail = dayDetails[key];
                  const isOpen = detail?.isOpen ?? false;

                  const meta = dayStopMeta[dayIdx];
                  const stopIndex = meta?.stopIndex ?? -1;
                  const isFirstForStop = meta?.isFirstForStop ?? false;
                  const showStepper =
                    !!meta && isFirstForStop && stopIndex >= 0;

                  return (
                    <>
                      <tr
                        key={`row-${d.dayNumber}-${key}`}
                        className="border-t border-white/5 align-top"
                      >
                        <td className="py-2 pr-4 whitespace-nowrap">
                          Day {d.dayNumber}
                        </td>
                        <td className="py-2 pr-4 whitespace-nowrap">
                          {formatDisplayDate(d.date)}
                        </td>
                        <td className="py-2 pr-4">{d.location}</td>
                        <td className="py-2 pr-4">
                          {showStepper ? (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  handleChangeNights(
                                    stopIndex,
                                    (nightsPerStop[stopIndex] ?? 1) - 1
                                  )
                                }
                                className="px-2 py-1 rounded-full border border-white/20 text-xs hover:bg-white/10"
                              >
                                −
                              </button>
                              <input
                                type="number"
                                min={1}
                                value={nightsPerStop[stopIndex] ?? 1}
                                onChange={(e) =>
                                  handleChangeNights(
                                    stopIndex,
                                    Number(e.target.value)
                                  )
                                }
                                className="w-14 text-center input-dark input-no-spinner text-xs py-1 px-1"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  handleChangeNights(
                                    stopIndex,
                                    (nightsPerStop[stopIndex] ?? 1) + 1
                                  )
                                }
                                className="px-2 py-1 rounded-full border border-white/20 text-xs hover:bg-white/10"
                              >
                                +
                              </button>
                            </div>
                          ) : null}
                        </td>
                        <td className="py-2 pr-4">
                          <button
                            type="button"
                            onClick={() => toggleDayOpen(d.date, d.location)}
                            className="px-2 py-1 rounded-full border border-white/25 text-xs hover:bgwhite/10"
                          >
                            {isOpen ? "Hide details" : "Day details & options"}
                          </button>
                        </td>
                      </tr>

                      {isOpen && (
                        <tr key={`details-${d.dayNumber}-${key}`}>
                          <td
                            colSpan={5}
                            className="pb-4 pt-1 pr-4 pl-4 bg-white/5 rounded-lg"
                          >
                            <div className="space-y-3">
                              <div className="grid gap-3 md:grid-cols-2">
                                <div className="space-y-1">
                                  <label className="text-xs font-medium">
                                    What I&apos;m doing on this day
                                  </label>
                                  <textarea
                                    rows={3}
                                    className="input-dark w-full text-xs"
                                    placeholder="e.g. Morning in the city, afternoon gondola, dinner at ..."
                                    value={detail?.notes ?? ""}
                                    onChange={(e) =>
                                      updateDayNotes(
                                        d.date,
                                        d.location,
                                        e.target.value
                                      )
                                    }
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-xs font-medium">
                                    Where I&apos;m staying
                                  </label>
                                  <input
                                    type="text"
                                    className="input-dark w-full text-xs"
                                    placeholder="e.g. Holiday park, hotel name, friend’s place"
                                    value={detail?.accommodation ?? ""}
                                    onChange={(e) =>
                                      updateDayAccommodation(
                                        d.date,
                                        d.location,
                                        e.target.value
                                      )
                                    }
                                  />
                                  <div className="mt-2 space-y-1">
                                    <button
                                      type="button"
                                      disabled
                                      className="px-3 py-1.5 rounded-full border border-dashed border-white/25 text-xs text-gray-400 cursor-not-allowed"
                                    >
                                      Search things to do in {d.location} (coming
                                      soon)
                                    </button>
                                    <p className="text-[10px] text-gray-500">
                                      Soon this will surface tours, attractions
                                      and events for {d.location} on{" "}
                                      {formatDisplayDate(d.date)}, with bookable
                                      links.
                                    </p>
                                  </div>
                                </div>
                              </div>

                              {/* Stop-level options */}
                              {isFirstForStop &&
                                stopIndex > 0 &&
                                stopIndex < routeStops.length - 1 && (
                                  <div className="flex justify-end pt-2">
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveStop(stopIndex)}
                                      className="text-[11px] text-red-300 hover:text-red-200 hover:underline underline-offset-2"
                                    >
                                      Remove this stop from trip
                                    </button>
                                  </div>
                                )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Results: route map + driving legs */}
      {plan && mapPoints.length >= 2 && (
        <div className="card p-4 md:p-6 space-y-4">
          <h2 className="text-lg font-semibold">Route overview</h2>
          <p className="text-sm text-gray-400">
            Road route between your start and end cities, passing through any
            recognised waypoints in logical order (e.g. Christchurch → Lake
            Tekapo → Cromwell → Queenstown).
          </p>

          <div className="w-full aspect-[4/3] rounded-lg overflow-hidden">
            <TripMap points={mapPoints} />
          </div>

          {legs.length > 0 && (
            <div className="mt-4 space-y-2">
              <h3 className="text-sm font-semibold">Driving legs</h3>

              {legsLoading && (
                <p className="text-xs text-gray-400 mb-1">
                  Fetching road distances…
                </p>
              )}

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-gray-400">
                    <tr>
                      <th className="py-2 pr-4">From</th>
                      <th className="py-2 pr-4">To</th>
                      <th className="py-2 pr-4">Distance</th>
                      <th className="py-2">Estimated drive</th>
                    </tr>
                  </thead>
                  <tbody>
                    {legs.map((leg, idx) => (
                      <tr key={idx} className="border-t border-white/5">
                        <td className="py-2 pr-4">{leg.from}</td>
                        <td className="py-2 pr-4">{leg.to}</td>
                        <td className="py-2 pr-4">
                          {formatDistance(leg.distanceKm)}
                        </td>
                        <td className="py-2">
                          {formatDriveHours(leg.driveHours)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-500">
                Distances shown are road distances from a routing engine; actual
                drive times may vary with traffic, weather, and stops.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Trip summary at the very bottom (read-only) */}
      {plan &&
        routeStops.length > 0 &&
        nightsPerStop.length === routeStops.length && (
          <div className="card p-4 md:p-6 space-y-3">
            <h2 className="text-lg font-semibold">Trip summary</h2>
            <p className="text-sm text-gray-400">
              A quick overview of where you&apos;re staying and for how long.
              This section will later include bookings and confirmations.
            </p>

            <ul className="space-y-1 text-sm">
              {routeStops.map((stopName, idx) => (
                <li key={`${stopName}-${idx}`} className="flex justify-between">
                  <span>{stopName}</span>
                  <span className="text-gray-300">
                    {nightsPerStop[idx] ?? 1} night
                    {(nightsPerStop[idx] ?? 1) === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ul>

            {totalTripDays > 0 && startDate && endDate && (
              <p className="text-xs text-gray-400 mt-2">
                Total days: <strong>{totalTripDays}</strong> (
                {formatDisplayDate(startDate)} – {formatDisplayDate(endDate)}).
              </p>
            )}
          </div>
        )}
    </div>
  );
}
