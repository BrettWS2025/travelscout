// components/TripPlanner.tsx
"use client";

import { useState, FormEvent } from "react";
import dynamic from "next/dynamic";
import {
  buildSimpleTripPlan,
  type TripPlan,
} from "@/lib/itinerary";
import {
  NZ_CITIES,
  DEFAULT_START_CITY_ID,
  DEFAULT_END_CITY_ID,
  getCityById,
} from "@/lib/nzCities";
import { matchStopsFromInputs } from "@/lib/nzStops";

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
  const [waypointsInput, setWaypointsInput] = useState("Lake Tekapo, Wanaka");
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  // Points passed down to the map: start → (matched waypoints) → end
  const [mapPoints, setMapPoints] = useState<MapPoint[]>([]);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setHasSubmitted(true);
    setError(null);

    const startCity = getCityById(startCityId);
    const endCity = getCityById(endCityId);

    if (!startCity || !endCity) {
      setPlan(null);
      setMapPoints([]);
      setError("Please select both a start city and an end city.");
      return;
    }

    try {
      // Split free-text waypoints (comma-separated) into an array of names
      const waypointNames = waypointsInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      // 1) Build the day-by-day itinerary using names only
      const nextPlan = buildSimpleTripPlan({
        startCity,
        endCity,
        startDate,
        endDate,
        waypoints: waypointNames,
      });
      setPlan(nextPlan);

      // 2) Map those waypoint names to known scenic stops with coordinates
      const matchedStops = matchStopsFromInputs(waypointNames);

      const waypointPoints: MapPoint[] = matchedStops.map((stop) => ({
        lat: stop.lat,
        lng: stop.lng,
        name: stop.name,
      }));

      // 3) Build the ordered list of map points for the routing:
      //    start city → matched waypoints → end city
      const points: MapPoint[] = [
        { lat: startCity.lat, lng: startCity.lng, name: startCity.name },
        ...waypointPoints,
        { lat: endCity.lat, lng: endCity.lng, name: endCity.name },
      ];

      setMapPoints(points);
    } catch (err) {
      setPlan(null);
      setMapPoints([]);
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
            Separate with commas. We&apos;ll distribute your days across these
            stops between your start and end cities and add mapped waypoints to
            your route where we recognise them.
          </p>
          <textarea
            value={waypointsInput}
            onChange={(e) => setWaypointsInput(e.target.value)}
            className="input-dark mt-1 w-full text-sm"
            rows={2}
            placeholder="eg. Lake Tekapo, Wanaka, Milford Sound"
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

      {/* Results: route map */}
      {plan && mapPoints.length >= 2 && (
        <div className="card p-4 md:p-6 space-y-4">
          <h2 className="text-lg font-semibold">Route overview</h2>
          <p className="text-sm text-gray-400">
            Road route between your start and end cities, passing through any
            recognised waypoints (e.g. Lake Tekapo, Wānaka, Milford Sound).
          </p>

          <div className="h-72 w-full rounded-lg overflow-hidden">
            {/* TripMap is dynamically loaded only in the browser */}
            <TripMap points={mapPoints} />
          </div>
        </div>
      )}
    </div>
  );
}
