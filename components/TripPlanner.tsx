// components/TripPlanner.tsx
"use client";

import { useEffect, useMemo, useRef, useState, FormEvent } from "react";
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
import {
  Calendar,
  MapPin,
  ChevronDown,
  Clock,
  ArrowLeftRight,
  Navigation,
} from "lucide-react";

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

async function fetchRoadLegs(points: MapPoint[]): Promise<TripLeg[]> {
  if (!points || points.length < 2) return [];

  const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=false&geometries=polyline&steps=false`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM request failed with status ${res.status}`);

  const data = await res.json();
  const route = data.routes?.[0];
  const legsData =
    (route?.legs as { distance: number; duration: number }[]) || [];

  if (!route || !Array.isArray(legsData)) {
    throw new Error("OSRM response did not contain route legs");
  }

  return legsData.map((leg, idx) => ({
    from: points[idx].name ?? `Stop ${idx + 1}`,
    to: points[idx + 1].name ?? `Stop ${idx + 2}`,
    distanceKm: leg.distance / 1000,
    driveHours: leg.duration / 3600,
  }));
}

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

type DayStopMeta = {
  stopIndex: number;
  isFirstForStop: boolean;
};

function buildDayStopMeta(stops: string[], nightsPerStop: number[]): DayStopMeta[] {
  const meta: DayStopMeta[] = [];
  for (let i = 0; i < stops.length; i++) {
    const nights = nightsPerStop[i] ?? 0;
    for (let n = 0; n < nights; n++) {
      meta.push({ stopIndex: i, isFirstForStop: n === 0 });
    }
  }
  return meta;
}

type ActivePill = "where" | "when" | null;

type CityLite = {
  id: string;
  name: string;
};

const RECENT_KEY = "travelscout_recent_city_searches_v1";

function safeReadRecent(): CityLite[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CityLite[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x) => x && typeof x.id === "string" && typeof x.name === "string");
  } catch {
    return [];
  }
}

function safeWriteRecent(items: CityLite[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(items.slice(0, 8)));
  } catch {
    // ignore
  }
}

function normalize(s: string) {
  return s.trim().toLowerCase();
}

function pickSuggestedCities(): CityLite[] {
  // NEW: prefer rank ordering, fallback to first few cities
  const ranked = NZ_CITIES
    .filter((c) => typeof c.rank === "number")
    .sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999))
    .slice(0, 6)
    .map((c) => ({ id: c.id, name: c.name }));

  if (ranked.length >= 4) return ranked;

  return NZ_CITIES.slice(0, 6).map((c) => ({ id: c.id, name: c.name }));
}

function CityIcon({ variant }: { variant: "recent" | "suggested" | "nearby" }) {
  const base =
    "w-9 h-9 rounded-xl flex items-center justify-center border border-black/5";
  if (variant === "recent") {
    return (
      <div className={`${base} bg-[#EAF7EA]`}>
        <Clock className="w-4 h-4 text-emerald-700" />
      </div>
    );
  }
  if (variant === "nearby") {
    return (
      <div className={`${base} bg-[#EAF1FF]`}>
        <Navigation className="w-4 h-4 text-blue-700" />
      </div>
    );
  }
  return (
    <div className={`${base} bg-[#F6F1EA]`}>
      <MapPin className="w-4 h-4 text-amber-700" />
    </div>
  );
}

export default function TripPlanner() {
  const [startCityId, setStartCityId] = useState(DEFAULT_START_CITY_ID);
  const [endCityId, setEndCityId] = useState(DEFAULT_END_CITY_ID);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  const [activePill, setActivePill] = useState<ActivePill>(null);
  const [showWherePopover, setShowWherePopover] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);

  const [whereStep, setWhereStep] = useState<"start" | "end">("start");
  const [startQuery, setStartQuery] = useState("");
  const [endQuery, setEndQuery] = useState("");
  const [recent, setRecent] = useState<CityLite[]>([]);
  const suggested = useMemo(() => pickSuggestedCities(), []);

  const whereRef = useRef<HTMLDivElement | null>(null);
  const whenRef = useRef<HTMLDivElement | null>(null);

  const [waypoints, setWaypoints] = useState<string[]>(["Lake Tekapo", "Cromwell"]);

  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const [routeStops, setRouteStops] = useState<string[]>([]);
  const [nightsPerStop, setNightsPerStop] = useState<number[]>([]);
  const [dayStopMeta, setDayStopMeta] = useState<DayStopMeta[]>([]);

  const [mapPoints, setMapPoints] = useState<MapPoint[]>([]);
  const [legs, setLegs] = useState<TripLeg[]>([]);
  const [legsLoading, setLegsLoading] = useState(false);

  const [dayDetails, setDayDetails] = useState<Record<string, DayDetail>>({});

  const [addingStopAfterIndex, setAddingStopAfterIndex] = useState<number | null>(null);
  const [newStopCityId, setNewStopCityId] = useState<string | null>(
    NZ_CITIES[0]?.id ?? null
  );

  const startCity = getCityById(startCityId);
  const endCity = getCityById(endCityId);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePill]);

  function syncDayDetailsFromPlan(nextPlan: TripPlan) {
    setDayDetails((prev) => {
      const next: Record<string, DayDetail> = {};
      for (const d of nextPlan.days) {
        const key = makeDayKey(d.date, d.location);
        const existing = prev[key];
        next[key] =
          existing ?? { notes: "", accommodation: "", isOpen: false };
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

    // Keep open after first date selection
    if (!range.to) {
      setStartDate(toIsoDate(range.from));
      setEndDate("");
      return;
    }

    let from = range.from;
    let to = range.to;
    if (to < from) [from, to] = [to, from];

    setStartDate(toIsoDate(from));
    setEndDate(toIsoDate(to));
    // Do NOT auto-close — user closes with Done
  }

  function pushRecent(city: CityLite) {
    const next = [city, ...recent.filter((r) => r.id !== city.id)].slice(0, 8);
    setRecent(next);
    safeWriteRecent(next);
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
      setShowWherePopover(false);
      setActivePill("when");
      setShowCalendar(true);
    }, 0);
  }

  function selectReturnToStart() {
    if (!startCity) return;
    setEndCityId(startCity.id);
    setEndQuery("Return to start city");
    setTimeout(() => {
      setShowWherePopover(false);
      setActivePill("when");
      setShowCalendar(true);
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

      const nextPlan = buildTripPlanFromStopsAndNights(stops, initialNights, startDate);
      setPlan(nextPlan);
      syncDayDetailsFromPlan(nextPlan);
      setDayStopMeta(buildDayStopMeta(stops, initialNights));

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
        console.error("Road routing failed, falling back to straight-line:", routingErr);
        setLegs(buildLegsFromPoints(points));
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

    const nextPlan = buildTripPlanFromStopsAndNights(newRouteStops, newNightsPerStop, startDate);
    setPlan(nextPlan);
    syncDayDetailsFromPlan(nextPlan);
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
          setLegs(buildLegsFromPoints(newMapPoints));
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
    newMapPoints.splice(insertIndex, 0, { lat: city.lat, lng: city.lng, name: city.name });

    setRouteStops(newRouteStops);
    setNightsPerStop(newNightsPerStop);
    setMapPoints(newMapPoints);
    setAddingStopAfterIndex(null);

    const nextPlan = buildTripPlanFromStopsAndNights(newRouteStops, newNightsPerStop, startDate);
    setPlan(nextPlan);
    syncDayDetailsFromPlan(nextPlan);
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
          setLegs(buildLegsFromPoints(newMapPoints));
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

  const totalTripDays = startDate && endDate ? countDaysInclusive(startDate, endDate) : 0;

  const whenLabel =
    startDate && endDate
      ? `${formatShortRangeDate(startDate)} – ${formatShortRangeDate(endDate)}`
      : startDate && !endDate
      ? `${formatShortRangeDate(startDate)} – Add end date`
      : "Add dates";

  const whereSummary =
    startCity && endCity ? `${startCity.name} → ${endCity.name}` : "Add destinations";

  function openWhere() {
    setActivePill("where");
    setShowWherePopover(true);
    setShowCalendar(false);
    setWhereStep("start");
    setStartQuery(startCity?.name ?? "");
    setEndQuery(endCity?.name ?? "");
  }

  function openWhen() {
    setActivePill("when");
    setShowCalendar(true);
    setShowWherePopover(false);
  }

  function WhereListItem({
    title,
    subtitle,
    onClick,
    iconVariant,
    right,
  }: {
    title: string;
    subtitle?: string;
    onClick: () => void;
    iconVariant: "recent" | "suggested" | "nearby";
    right?: React.ReactNode;
  }) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/5 transition"
      >
        <CityIcon variant={iconVariant} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-white truncate">{title}</div>
          {subtitle ? <div className="text-[12px] text-gray-300 truncate">{subtitle}</div> : null}
        </div>
        {right ? <div className="text-[12px] text-gray-300">{right}</div> : null}
      </button>
    );
  }

  function WherePickerPanel({ step }: { step: "start" | "end" }) {
    const isStart = step === "start";
    const query = isStart ? startQuery : endQuery;
    const setQuery = isStart ? setStartQuery : setEndQuery;
    const results = isStart ? startResults : endResults;

    const showBrowseLists = normalize(query).length === 0;
    const header = isStart ? "Where are you starting?" : "Where are you finishing?";

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-xs font-semibold text-white">{header}</div>
            <div className="text-[11px] text-gray-300">Type to search, or pick a suggestion.</div>
          </div>
          <span className="text-[10px] text-gray-400">Step {isStart ? "1" : "2"}</span>
        </div>

        <div className="rounded-2xl bg-white/5 border border-white/10 px-3 py-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            placeholder={isStart ? "Search start city" : "Search end city"}
            className="w-full bg-transparent outline-none text-sm placeholder:text-gray-400"
          />
        </div>

        <div className="max-h-[360px] overflow-auto pr-1">
          {!isStart && startCity && (
            <div className="mb-3">
              <div className="text-[11px] text-gray-400 uppercase tracking-wide px-2 mb-1">
                Quick option
              </div>
              <WhereListItem
                title="Return to start city"
                subtitle={`Finish in ${startCity.name}`}
                iconVariant="suggested"
                right={<ArrowLeftRight className="w-4 h-4 opacity-80" />}
                onClick={selectReturnToStart}
              />
            </div>
          )}

          {showBrowseLists ? (
            <>
              {recent.length > 0 && (
                <div className="mb-3">
                  <div className="text-[11px] text-gray-400 uppercase tracking-wide px-2 mb-1">
                    Recent searches
                  </div>
                  <div className="space-y-1">
                    {recent.map((c) => (
                      <WhereListItem
                        key={`${step}-recent-${c.id}`}
                        title={c.name}
                        subtitle={isStart ? "Recently used start city" : "Recently used destination"}
                        iconVariant="recent"
                        onClick={() => (isStart ? selectStartCity(c.id) : selectEndCity(c.id))}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div className="mb-2">
                <div className="text-[11px] text-gray-400 uppercase tracking-wide px-2 mb-1">
                  Suggested destinations
                </div>
                <div className="space-y-1">
                  {suggested.map((c) => (
                    <WhereListItem
                      key={`${step}-suggested-${c.id}`}
                      title={c.name}
                      subtitle={isStart ? "Top departure" : "Top destination"}
                      iconVariant="suggested"
                      onClick={() => (isStart ? selectStartCity(c.id) : selectEndCity(c.id))}
                    />
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="text-[11px] text-gray-400 uppercase tracking-wide px-2 mb-1">
                Matches
              </div>
              {results.length === 0 ? (
                <div className="px-2 py-3 text-sm text-gray-300">
                  No matches. Try a different spelling.
                </div>
              ) : (
                <div className="space-y-1">
                  {results.map((c) => (
                    <WhereListItem
                      key={`${step}-match-${c.id}`}
                      title={c.name}
                      subtitle="New Zealand"
                      iconVariant="suggested"
                      onClick={() => (isStart ? selectStartCity(c.id) : selectEndCity(c.id))}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="pt-2 border-t border-white/10 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              if (step === "end") setWhereStep("start");
            }}
            className={[
              "text-[11px] underline underline-offset-2",
              step === "end"
                ? "text-gray-200 hover:text-white"
                : "text-gray-500 cursor-not-allowed no-underline",
            ].join(" ")}
            disabled={step !== "end"}
          >
            Back
          </button>

          <button
            type="button"
            onClick={() => {
              setShowWherePopover(false);
              setActivePill(null);
            }}
            className="text-[11px] text-gray-200 hover:text-white underline underline-offset-2"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <form
        onSubmit={handleSubmit}
        className="card p-4 md:p-6 space-y-6"
        style={{ color: "var(--text)" }}
      >
        {/* Pills row */}
        <div className="relative">
          <div className="w-full rounded-full bg-[var(--card)] border border-white/15 shadow-sm">
            <div className="flex flex-col md:flex-row">
              {/* WHERE pill */}
              <div ref={whereRef} className="relative flex-1">
                <button
                  type="button"
                  onClick={openWhere}
                  className={[
                    "w-full rounded-full md:rounded-l-full md:rounded-r-none px-4 py-3 text-left",
                    "hover:bg-white/5 transition flex items-center justify-between gap-3",
                    activePill === "where" ? "bg-white/5" : "",
                  ].join(" ")}
                >
                  <div className="min-w-0">
                    <div className="text-[11px] text-gray-400 uppercase tracking-wide">
                      Where
                    </div>
                    <div className="text-sm truncate">{whereSummary}</div>
                  </div>
                  <div className="flex items-center gap-2 opacity-80">
                    <MapPin className="w-4 h-4" />
                    <ChevronDown className="w-4 h-4" />
                  </div>
                </button>

                {showWherePopover && (
                  <div className="absolute left-0 right-0 mt-3 z-30 rounded-2xl bg-[#1E2C4B] p-4 border border-white/10 shadow-lg">
                    {whereStep === "start" ? (
                      <WherePickerPanel step="start" />
                    ) : (
                      <WherePickerPanel step="end" />
                    )}

                    <div className="mt-3 text-[11px] text-gray-400">
                      Cities are mapped with latitude &amp; longitude, so we can factor in realistic driving legs later.
                    </div>
                  </div>
                )}
              </div>

              <div className="hidden md:block w-px bg-white/10" />

              {/* WHEN pill */}
              <div ref={whenRef} className="relative flex-1">
                <button
                  type="button"
                  onClick={openWhen}
                  className={[
                    "w-full rounded-full md:rounded-r-full md:rounded-l-none px-4 py-3 text-left",
                    "hover:bg-white/5 transition flex items-center justify-between gap-3",
                    activePill === "when" ? "bg-white/5" : "",
                  ].join(" ")}
                >
                  <div className="min-w-0">
                    <div className="text-[11px] text-gray-400 uppercase tracking-wide">
                      When
                    </div>
                    <div className="text-sm truncate">{whenLabel}</div>
                  </div>
                  <Calendar className="w-4 h-4 opacity-80" />
                </button>

                {/* FIX: popover width + overflow-hidden + fixed month widths */}
                {showCalendar && (
                  <div
                    className={[
                      "absolute left-0 mt-3 z-30 rounded-2xl bg-[#1E2C4B] border border-white/10 shadow-lg",
                      "overflow-hidden", // <-- key fix to stop dates spilling out
                      "w-[720px] max-w-[calc(100vw-2rem)]",
                      "p-3",
                    ].join(" ")}
                  >
                    <div className="px-2 pb-2">
                      <p className="text-[11px] text-gray-300">
                        Pick a start date, then an end date.
                      </p>
                      {startDate && !endDate && (
                        <p className="text-[11px] text-gray-400">
                          Now choose your end date.
                        </p>
                      )}
                    </div>

                    <div className="overflow-x-auto">
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
                            gap: "24px",
                            justifyContent: "space-between",
                          },
                          month: {
                            width: "320px", // <-- fixed width prevents last column overflow
                          },
                        }}
                      />
                    </div>

                    <div className="flex justify-between items-center mt-2 px-2">
                      <button
                        type="button"
                        className="text-[11px] text-gray-300 hover:text-white underline underline-offset-2"
                        onClick={() => {
                          setDateRange(undefined);
                          setStartDate("");
                          setEndDate("");
                        }}
                      >
                        Clear
                      </button>

                      <button
                        type="button"
                        className="text-[11px] text-gray-300 hover:text-white underline underline-offset-2"
                        onClick={() => {
                          setShowCalendar(false);
                          setActivePill(null);
                        }}
                      >
                        Done
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {totalTripDays > 0 && (
            <p className="text-[11px] text-gray-400 mt-2">
              Total days in itinerary (inclusive): <strong>{totalTripDays}</strong>
            </p>
          )}
        </div>

        {/* Waypoints unchanged */}
        <div className="space-y-1">
          <label className="text-sm font-medium">
            Places you&apos;d like to visit
          </label>
          <p className="text-xs text-gray-400">
            Start typing a town or scenic stop. We&apos;ll reorder these into a logical route between your start and end cities where we recognise the stops, and estimate{" "}
            <strong>road</strong> driving times between each leg.
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

      {/* Everything below here is unchanged (results UI) */}
      {hasSubmitted && !plan && !error && (
        <p className="text-sm text-gray-400">
          Fill in your trip details and click &quot;Generate itinerary&quot;.
        </p>
      )}

      {plan && plan.days.length > 0 && (
        <div className="card p-4 md:p-6 space-y-4">
          <h2 className="text-lg font-semibold">Your draft itinerary</h2>
          <p className="text-sm text-gray-400">
            Adjust nights for each stop and expand a day to add what you&apos;re doing and where you&apos;re staying.
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
                  const showStepper = !!meta && isFirstForStop && stopIndex >= 0;

                  return (
                    <>
                      <tr
                        key={`row-${d.dayNumber}-${key}`}
                        className="border-t border-white/5 align-top"
                      >
                        <td className="py-2 pr-4 whitespace-nowrap">Day {d.dayNumber}</td>
                        <td className="py-2 pr-4 whitespace-nowrap">{formatDisplayDate(d.date)}</td>
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
                                  handleChangeNights(stopIndex, Number(e.target.value))
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
                            className="px-2 py-1 rounded-full border border-white/25 text-xs hover:bg-white/10"
                          >
                            {isOpen ? "Hide details" : "Day details"}
                          </button>
                        </td>
                      </tr>

                      {isOpen && (
                        <tr key={`details-${d.dayNumber}-${key}`}>
                          <td colSpan={5} className="pb-4 pt-1 pr-4 pl-4 bg-white/5 rounded-lg">
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
                                    onChange={(e) => updateDayNotes(d.date, d.location, e.target.value)}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-xs font-medium">Where I&apos;m staying</label>
                                  <input
                                    type="text"
                                    className="input-dark w-full text-xs"
                                    placeholder="e.g. Holiday park, hotel name, friend’s place"
                                    value={detail?.accommodation ?? ""}
                                    onChange={(e) =>
                                      updateDayAccommodation(d.date, d.location, e.target.value)
                                    }
                                  />
                                  <div className="mt-2 space-y-1">
                                    <button
                                      type="button"
                                      disabled
                                      className="px-3 py-1.5 rounded-full border border-dashed border-white/25 text-xs text-gray-400 cursor-not-allowed"
                                    >
                                      Search things to do in {d.location} (coming soon)
                                    </button>
                                    <p className="text-[10px] text-gray-500">
                                      Soon this will surface tours, attractions and events for {d.location} on{" "}
                                      {formatDisplayDate(d.date)}, with bookable links.
                                    </p>
                                  </div>
                                </div>
                              </div>

                              {isFirstForStop && (
                                <div className="pt-3 mt-2 border-t border-white/10">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="text-[11px] text-gray-400">
                                      Stop options for {routeStops[stopIndex]}
                                    </span>
                                    <div className="flex flex-wrap gap-3 items-center">
                                      {stopIndex < routeStops.length - 1 && (
                                        <button
                                          type="button"
                                          onClick={() => handleStartAddStop(stopIndex)}
                                          className="text-[11px] text-[var(--accent)] hover:underline underline-offset-2"
                                        >
                                          + Add stop after this
                                        </button>
                                      )}
                                      {stopIndex > 0 && stopIndex < routeStops.length - 1 && (
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveStop(stopIndex)}
                                          className="text-[11px] text-red-300 hover:text-red-200 hover:underline underline-offset-2"
                                        >
                                          Remove this stop from trip
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  {addingStopAfterIndex === stopIndex && (
                                    <div className="mt-3 flex flex-wrap items-center gap-2">
                                      <select
                                        value={newStopCityId ?? ""}
                                        onChange={(e) => setNewStopCityId(e.target.value)}
                                        className="input-dark text-xs w-56"
                                      >
                                        {NZ_CITIES.map((city) => (
                                          <option key={city.id} value={city.id}>
                                            {city.name}
                                          </option>
                                        ))}
                                      </select>
                                      <button
                                        type="button"
                                        onClick={handleConfirmAddStop}
                                        className="rounded-full px-3 py-1.5 text-[11px] font-medium bg-[var(--accent)] text-slate-900 hover:brightness-110"
                                      >
                                        Add stop
                                      </button>
                                      <button
                                        type="button"
                                        onClick={handleCancelAddStop}
                                        className="text-[11px] text-gray-300 hover:underline underline-offset-2"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  )}
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

      {plan && mapPoints.length >= 2 && (
        <div className="card p-4 md:p-6 space-y-4">
          <h2 className="text-lg font-semibold">Route overview</h2>
          <p className="text-sm text-gray-400">
            Road route between your start and end cities, passing through any recognised waypoints in logical order.
          </p>

          <div className="w-full aspect-[4/3] rounded-lg overflow-hidden">
            <TripMap points={mapPoints} />
          </div>

          {legs.length > 0 && (
            <div className="mt-4 space-y-2">
              <h3 className="text-sm font-semibold">Driving legs</h3>

              {legsLoading && <p className="text-xs text-gray-400 mb-1">Fetching road distances…</p>}

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
                        <td className="py-2 pr-4">{formatDistance(leg.distanceKm)}</td>
                        <td className="py-2">{formatDriveHours(leg.driveHours)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-xs text-gray-500">
                Distances shown are road distances; actual drive times may vary.
              </p>
            </div>
          )}
        </div>
      )}

      {plan && routeStops.length > 0 && nightsPerStop.length === routeStops.length && (
        <div className="card p-4 md:p-6 space-y-3">
          <h2 className="text-lg font-semibold">Trip summary</h2>
          <p className="text-sm text-gray-400">
            A quick overview of where you&apos;re staying and for how long.
          </p>

          <ul className="space-y-1 text-sm">
            {routeStops.map((stopName, idx) => (
              <li key={`${stopName}-${idx}`} className="flex justify-between">
                <span>{stopName}</span>
                <span className="text-gray-300">
                  {nightsPerStop[idx] ?? 1} night{(nightsPerStop[idx] ?? 1) === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>

          {totalTripDays > 0 && startDate && endDate && (
            <p className="text-xs text-gray-400 mt-2">
              Total days: <strong>{totalTripDays}</strong> ({formatDisplayDate(startDate)} –{" "}
              {formatDisplayDate(endDate)}).
            </p>
          )}
        </div>
      )}
    </div>
  );
}
