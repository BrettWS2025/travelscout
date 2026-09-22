"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { countDaysInclusive } from "@/lib/itinerary";
import type { TripLeg } from "@/lib/itinerary";
import type { MapPoint } from "@/lib/trip-planner/utils";
import RouteOverview from "@/components/trip-planner/RouteOverview";
import TripSummary from "@/components/trip-planner/TripSummary";
import { getTripPlannerDraft } from "@/lib/trip-planner/draftStorage";
import { collectManualMapPoints } from "@/lib/trip-planner/manualEntry";
import type { DayDetail } from "@/lib/trip-planner/utils";

type SavedPlan = {
  routeStops?: string[];
  nightsPerStop?: number[];
  mapPoints?: MapPoint[];
  legs?: TripLeg[];
  days?: unknown[];
  dayDetails?: Record<string, DayDetail>;
};

type SavedState = {
  startDate?: string;
  endDate?: string;
  plan?: SavedPlan | null;
};

export default function TripPlannerSummaryPage() {
  const [state, setState] = useState<SavedState | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    try {
      const raw = getTripPlannerDraft();
      if (!raw) {
        setState(null);
        return;
      }
      const parsed = JSON.parse(raw) as SavedState;
      setState(parsed);
    } catch {
      setState(null);
    }
  }, [mounted]);

  if (!mounted) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <p className="text-slate-600">Loading…</p>
      </main>
    );
  }

  const hasPlan = state?.plan?.days && Array.isArray(state.plan.days) && state.plan.days.length > 0;
  const routeStops = state?.plan?.routeStops ?? [];
  const nightsPerStop = state?.plan?.nightsPerStop ?? [];
  const mapPoints = state?.plan?.mapPoints ?? [];
  const manualPoiMarkers = collectManualMapPoints(state?.plan?.dayDetails);
  const legs = state?.plan?.legs ?? [];
  const startDate = state?.startDate ?? "";
  const endDate = state?.endDate ?? "";
  const totalTripDays = startDate && endDate ? countDaysInclusive(startDate, endDate) : 0;

  if (!hasPlan || routeStops.length === 0) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <div className="rounded-2xl border border-slate-200/60 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900 mb-2">No journey yet</h1>
          <p className="text-slate-600 mb-6">
            Plan your trip to see the route overview, driving legs, and trip summary here.
          </p>
          <Link
            href="/trip-planner"
            className="inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-medium text-white hover:brightness-110 transition shadow-lg hover:shadow-xl"
            style={{
              background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)",
            }}
          >
            Plan your journey
          </Link>
        </div>
      </main>
    );
  }

  // Trip summary: exclude 0-night stays
  const summaryStops: string[] = [];
  const summaryNights: number[] = [];
  routeStops.forEach((stop, i) => {
    const nights = nightsPerStop[i] ?? 0;
    if (nights > 0) {
      summaryStops.push(stop);
      summaryNights.push(nights);
    }
  });

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="rounded-2xl border border-slate-200/60 bg-white shadow-sm overflow-hidden">
        <RouteOverview
          mapPoints={mapPoints}
          manualPoiMarkers={manualPoiMarkers}
          legs={legs}
          legsLoading={false}
        />
        <TripSummary
          routeStops={summaryStops}
          nightsPerStop={summaryNights}
          totalTripDays={totalTripDays}
          startDate={startDate}
          endDate={endDate}
        />
      </div>
    </main>
  );
}
