// components/TripPlanner.tsx
"use client";

import { useState, FormEvent } from "react";
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

export default function TripPlanner() {
  const [startCityId, setStartCityId] = useState(DEFAULT_START_CITY_ID);
  const [endCityId, setEndCityId] = useState(DEFAULT_END_CITY_ID);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [waypointsInput, setWaypointsInput] = useState("Lake Tekapo, Dunedin");
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setHasSubmitted(true);
    setError(null);

    const startCity = getCityById(startCityId);
    const endCity = getCityById(endCityId);

    if (!startCity || !endCity) {
      setPlan(null);
      setError("Please select both a start city and an end city.");
      return;
    }

    try {
      const waypoints = waypointsInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const nextPlan = buildSimpleTripPlan({
        startCity,
        endCity,
        startDate,
        endDate,
        waypoints,
      });

      setPlan(nextPlan);
    } catch (err) {
      setPlan(null);
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

          {/* Dates */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Start date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="input-dark w-full text-sm"
            />
          </div>

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
            stops between your start and end cities.
          </p>
          <textarea
            value={waypointsInput}
            onChange={(e) => setWaypointsInput(e.target.value)}
            className="input-dark mt-1 w-full text-sm"
            rows={2}
            placeholder="eg. Lake Tekapo, Dunedin, Milford Sound, Lake Wakatipu"
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

      {/* Results */}
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
    </div>
  );
}
