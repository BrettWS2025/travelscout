"use client";

import dynamic from "next/dynamic";
import type { TripLeg } from "@/lib/itinerary";
import { formatDistance, formatDriveHours, type MapPoint } from "@/lib/trip-planner/utils";

// Dynamically import TripMap only on the client to avoid `window` errors on the server
const TripMap = dynamic(() => import("@/components/TripMap"), { ssr: false });

type Props = {
  mapPoints: MapPoint[];
  legs: TripLeg[];
  legsLoading: boolean;
};

export default function RouteOverview({ mapPoints, legs, legsLoading }: Props) {
  if (!mapPoints || mapPoints.length < 2) return null;

  return (
    <div className="card p-4 md:p-6 space-y-4">
      <h2 className="text-lg font-semibold">Route overview</h2>

      <div className="w-full aspect-[4/3] rounded-lg overflow-hidden">
        <TripMap points={mapPoints} />
      </div>

      {legs.length > 0 && (
        <div className="mt-4 space-y-2">
          <h3 className="text-sm font-semibold">Driving legs</h3>

          {legsLoading && (
            <p className="text-xs text-gray-400 mb-1">Fetching road distances…</p>
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
  );
}
