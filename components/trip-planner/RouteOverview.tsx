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
    <div className="p-4 md:p-6 space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">Route overview</h2>

      <div className="w-full aspect-[4/3] rounded-2xl overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-slate-100/50">
        <TripMap points={mapPoints} />
      </div>

      {legs.length > 0 && (
        <div className="mt-4 space-y-2">
          <h3 className="text-sm font-semibold text-slate-900">Driving legs</h3>

          {legsLoading && (
            <p className="text-xs text-slate-500 mb-1">Fetching road distances…</p>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="py-2 pr-4 font-normal">From</th>
                  <th className="py-2 pr-4 font-normal">To</th>
                  <th className="py-2 pr-4 font-normal">Distance</th>
                  <th className="py-2 font-normal">Estimated drive</th>
                </tr>
              </thead>
              <tbody>
                {legs.map((leg, idx) => (
                  <tr key={idx} className="border-t border-slate-200/50">
                    <td className="py-2 pr-4 text-slate-900">{leg.from}</td>
                    <td className="py-2 pr-4 text-slate-900">{leg.to}</td>
                    <td className="py-2 pr-4 text-slate-600">{formatDistance(leg.distanceKm)}</td>
                    <td className="py-2 text-slate-600">{formatDriveHours(leg.driveHours)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-slate-500">
            Distances shown are road distances; actual drive times may vary.
          </p>
        </div>
      )}
    </div>
  );
}
