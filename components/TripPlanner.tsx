// components/TripPlanner.tsx
"use client";

import { useState, FormEvent } from "react";
import dynamic from "next/dynamic";
import {
  buildSimpleTripPlan,
  type TripPlan,
  buildLegsFromPoints,
  type TripLeg,
} from "@/lib/itinerary";
import {
  NZ_CITIES,
  DEFAULT_START_CITY_ID,
  DEFAULT_END_CITY_ID,
  getCityById,
} from "@/lib/nzCities";
import { orderWaypointNamesByRoute } from "@/lib/nzStops";

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

export default function TripPlanner() {
  const [startCityId, setStartCityId] = useState(DEFAULT_START_CITY_ID);
  const [endCityId, setEndCityId] = useState(DEFAULT_END_CITY_ID);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [waypointsInput, setWaypointsInput] = useState("Lake Tekapo, Cromwell");
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  // Points passed down to the map: start → (ordered matched waypoints) → end
  const [mapPoints, setMapPoints] = useState<MapPoint[]>([]);
  // Driving legs between those points
  const [legs, setLegs] = useState<TripLeg[]>([]);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
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

    try {
      // Split free-text waypoints (comma-separated) into an array of names
      const rawWaypointNames = waypointsInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      // 1) Use coordinates to order waypoint names in logical route order
      const {
        orderedNames,
        matchedStopsInOrder,
      } = orderWaypointNamesByRoute(startCity, endCity, rawWaypointNames);

      // 2) Build the day-by-day itinerary using the ordered names
      const nextPlan = buildSimpleTripPlan({
        startCity,
        endCity,
        startDate,
        endDate,
        waypoints: orderedNames,
      });
      setPlan(nextPlan);

      // 3) Build map points: start city → ordered mapped waypoints → end city
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

      // 4) Compute driving legs (distance + estimated drive time)
      const newLegs = buildLegsFromPoints(points);
      setLegs(newLegs);
    } catch (err) {
      setPlan(null);
      setMapPoints([]);
      setLegs([]);
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <div className="space-y-8">
      {/* Form */}
      <form
        onSubmit={handleSubmit}
        className="card p-4 md:p-6 space-y-4"
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

          {/* Start date */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Start date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="input-dark w-full text-sm"
            />
          </div>

          {/* End date */}
          <div className="space-y-1">
            <label className="text-sm font-medium">End date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="input-dark w-full text-sm"
            />
          </div>
        </div>

        {/* Waypoints */}
        <div className="space-y-1">
          <label className="text-sm font-medium">
            Places you&apos;d like to visit
          </label>
          <p className="text-xs text-gray-400">
            Separate with commas. We&apos;ll reorder these into a logical route
            between your start and end cities where we recognise the stops
            (e.g. Lake Tekapo, Wānaka, Cromwell) and estimate drive times
            between them.
          </p>
          <textarea
            value={waypointsInput}
            onChange={(e) => setWaypointsInput(e.target.value)}
            className="input-dark mt-1 w-full text-sm"
            rows={2}
            placeholder="eg. Cromwell, Lake Tekapo, Wanaka"
          />
        </div>

        {error && (
          <p className="text-sm text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-medium bg-[var(--accent)] text-slate-900 hover:brightness-110 transition"
        >
          Generate itinerary
        </button>
      </form>

      {/* Results: itinerary table */}
      {hasSubmitted && !plan && !error && (
        <p className="text-sm text-gray-400">
          Fill in your trip details and click &quot;Generate itinerary&quot;.
        </p>
      )}

      {plan && plan.days.length > 0 && (
        <div className="card p-4 md:p-6 space-y-4">
          <h2 className="text-lg font-semibold">Your draft itinerary</h2>
          <p className="text-sm text-gray-400">
            This is a starting point. Later you&apos;ll be able to tweak nights per
            stop, add activities, and book campgrounds.
          </p>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-gray-400">
                <tr>
                  <th className="py-2 pr-4">Day</th>
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2">Location</th>
                </tr>
              </thead>
              <tbody>
                {plan.days.map((d) => (
                  <tr key={d.dayNumber} className="border-t border-white/5">
                    <td className="py-2 pr-4">Day {d.dayNumber}</td>
                    <td className="py-2 pr-4">
                      {formatDisplayDate(d.date)}
                    </td>
                    <td className="py-2">{d.location}</td>
                  </tr>
                ))}
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

          {/* 🔹 Square map: width = height */}
          <div className="w-full aspect-square rounded-lg overflow-hidden">
            {/* TripMap is dynamically loaded only in the browser */}
            <TripMap points={mapPoints} />
          </div>

          {legs.length > 0 && (
            <div className="mt-4 space-y-2">
              <h3 className="text-sm font-semibold">Driving legs</h3>
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
                Distances are approximate great-circle distances; actual drive
                times may vary with road conditions and stops.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
