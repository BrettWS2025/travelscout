"use client";

import { formatDisplayDate } from "@/lib/trip-planner/utils";

type Props = {
  routeStops: string[];
  nightsPerStop: number[];
  totalTripDays: number;
  startDate: string;
  endDate: string;
};

export default function TripSummary({
  routeStops,
  nightsPerStop,
  totalTripDays,
  startDate,
  endDate,
}: Props) {
  if (!routeStops.length || nightsPerStop.length !== routeStops.length) return null;

  return (
    <div className="card p-4 md:p-6 space-y-3">
      <h2 className="text-lg font-semibold">Trip summary</h2>

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
  );
}
