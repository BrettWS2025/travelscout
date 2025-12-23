"use client";

import { useMemo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { NZ_CITIES } from "@/lib/nzCities";
import type { TripPlan } from "@/lib/itinerary";
import {
  formatDisplayDate,
  formatShortRangeDate,
  makeDayKey,
  type DayDetail,
  type DayStopMeta,
} from "@/lib/trip-planner/utils";

type Props = {
  plan: TripPlan;
  routeStops: string[];
  nightsPerStop: number[];
  dayStopMeta: DayStopMeta[];
  dayDetails: Record<string, DayDetail>;

  openStops: Record<number, boolean>;
  setOpenStops: (next: Record<number, boolean>) => void;
  toggleStopOpen: (stopIndex: number) => void;

  addingStopAfterIndex: number | null;
  newStopCityId: string | null;
  setNewStopCityId: (v: string) => void;

  onChangeNights: (stopIndex: number, newValue: number) => void;
  onToggleDayOpen: (date: string, location: string) => void;
  onUpdateDayNotes: (date: string, location: string, notes: string) => void;
  onUpdateDayAccommodation: (
    date: string,
    location: string,
    accommodation: string
  ) => void;

  onStartAddStop: (stopIndex: number) => void;
  onConfirmAddStop: () => void;
  onCancelAddStop: () => void;
  onRemoveStop: (stopIndex: number) => void;
};

export default function DraftItinerary({
  plan,
  routeStops,
  nightsPerStop,
  dayStopMeta,
  dayDetails,
  openStops,
  setOpenStops,
  toggleStopOpen,
  addingStopAfterIndex,
  newStopCityId,
  setNewStopCityId,
  onChangeNights,
  onToggleDayOpen,
  onUpdateDayNotes,
  onUpdateDayAccommodation,
  onStartAddStop,
  onConfirmAddStop,
  onCancelAddStop,
  onRemoveStop,
}: Props) {
  const stopGroups = useMemo(() => {
    if (!plan || plan.days.length === 0) return [];

    type Group = {
      stopIndex: number;
      stopName: string;
      dayIndices: number[];
      startDate: string;
      endDate: string;
    };

    const groups: Group[] = [];
    const seen = new Set<number>();

    for (let i = 0; i < plan.days.length; i++) {
      const meta = dayStopMeta[i];
      const stopIndex = meta?.stopIndex ?? -1;
      if (stopIndex < 0) continue;
      if (seen.has(stopIndex)) continue;

      const indices: number[] = [];
      for (let j = 0; j < plan.days.length; j++) {
        if ((dayStopMeta[j]?.stopIndex ?? -1) === stopIndex) indices.push(j);
      }
      if (indices.length === 0) continue;

      const first = plan.days[indices[0]];
      const last = plan.days[indices[indices.length - 1]];

      groups.push({
        stopIndex,
        stopName: routeStops[stopIndex] ?? first.location,
        dayIndices: indices,
        startDate: first.date,
        endDate: last.date,
      });
      seen.add(stopIndex);
    }

    groups.sort((a, b) => a.stopIndex - b.stopIndex);
    return groups;
  }, [plan, dayStopMeta, routeStops]);

  return (
    <div className="card p-4 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Your draft itinerary</h2>
          <p className="text-sm text-gray-400">
            Expand a location to see its days. Expand a day to add what you&apos;re
            doing and where you&apos;re staying.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const next: Record<number, boolean> = {};
              for (const g of stopGroups) next[g.stopIndex] = true;
              setOpenStops(next);
            }}
            className="px-3 py-1.5 rounded-full border border-white/15 text-xs hover:bg-white/10"
          >
            Expand all
          </button>
          <button
            type="button"
            onClick={() => setOpenStops({})}
            className="px-3 py-1.5 rounded-full border border-white/15 text-xs hover:bg-white/10"
          >
            Collapse all
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {stopGroups.map((g) => {
          const isStopOpen = openStops[g.stopIndex] ?? false;
          const dayCount = g.dayIndices.length;
          const nightsHere = nightsPerStop[g.stopIndex] ?? 1;

          return (
            <div
              key={`stop-${g.stopIndex}-${g.stopName}`}
              className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden"
            >
              <div className="px-4 py-3 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => toggleStopOpen(g.stopIndex)}
                  className="flex items-center gap-3 min-w-0 group"
                >
                  <span
                    className={[
                      "w-8 h-8 rounded-xl flex items-center justify-center",
                      "border border-white/10 bg-white/5 group-hover:bg-white/10 transition",
                    ].join(" ")}
                    aria-hidden
                  >
                    <ChevronDown
                      className={[
                        "w-4 h-4 opacity-80 transition-transform duration-200",
                        isStopOpen ? "rotate-0" : "-rotate-90",
                      ].join(" ")}
                    />
                  </span>

                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white truncate">
                      {g.stopName}
                    </div>
                    <div className="text-[11px] text-gray-300 truncate">
                      {formatShortRangeDate(g.startDate)} –{" "}
                      {formatShortRangeDate(g.endDate)} · {dayCount} day
                      {dayCount === 1 ? "" : "s"}
                    </div>
                  </div>
                </button>

                <div className="flex items-center gap-2">
                  <span className="hidden sm:inline text-[11px] text-gray-400 mr-1">
                    Nights
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onChangeNights(g.stopIndex, nightsHere - 1)}
                      className="px-2 py-1 rounded-full border border-white/20 text-xs hover:bg-white/10"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={1}
                      value={nightsHere}
                      onChange={(e) =>
                        onChangeNights(g.stopIndex, Number(e.target.value))
                      }
                      className="w-14 text-center input-dark input-no-spinner text-xs py-1 px-1"
                    />
                    <button
                      type="button"
                      onClick={() => onChangeNights(g.stopIndex, nightsHere + 1)}
                      className="px-2 py-1 rounded-full border border-white/20 text-xs hover:bg-white/10"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              <div
                className={[
                  "grid transition-[grid-template-rows] duration-250 ease-out",
                  isStopOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                ].join(" ")}
              >
                <div className="overflow-hidden">
                  <div className="px-4 pb-4">
                    <div className="pl-3 border-l border-white/10 space-y-2">
                      {g.dayIndices.map((dayIdx, localIdx) => {
                        const d = plan.days[dayIdx];
                        const key = makeDayKey(d.date, d.location);
                        const detail = dayDetails[key];
                        const isOpen = detail?.isOpen ?? false;

                        const isFirstForStop = localIdx === 0;

                        return (
                          <div
                            key={`day-${d.dayNumber}-${key}`}
                            className="rounded-2xl bg-[#1E2C4B]/40 border border-white/10 overflow-hidden"
                          >
                            <div className="px-3 py-3 flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <div className="text-xs font-semibold text-white">
                                    Day {d.dayNumber}
                                  </div>
                                  <span className="text-[11px] text-gray-300">
                                    {formatDisplayDate(d.date)}
                                  </span>

                                  {isFirstForStop && (
                                    <span className="ml-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] border border-white/15 text-gray-200 bg-white/5">
                                      First day here
                                    </span>
                                  )}
                                </div>

                                <div className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1">
                                  <ChevronRight className="w-3 h-3 opacity-70" />
                                  <span>Days in {g.stopName}</span>
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => onToggleDayOpen(d.date, d.location)}
                                className="px-2.5 py-1.5 rounded-full border border-white/20 text-xs hover:bg-white/10"
                              >
                                {isOpen ? "Hide details" : "Day details"}
                              </button>
                            </div>

                            {isOpen && (
                              <div className="px-3 pb-3">
                                <div className="rounded-xl bg-white/5 border border-white/10 p-3 space-y-3">
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
                                          onUpdateDayNotes(
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
                                          onUpdateDayAccommodation(
                                            d.date,
                                            d.location,
                                            e.target.value
                                          )
                                        }
                                      />
                                    </div>
                                  </div>

                                  {isFirstForStop && (
                                    <div className="pt-3 mt-2 border-t border-white/10">
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <span className="text-[11px] text-gray-400">
                                          Stop options for {routeStops[g.stopIndex]}
                                        </span>
                                        <div className="flex flex-wrap gap-3 items-center">
                                          {g.stopIndex < routeStops.length - 1 && (
                                            <button
                                              type="button"
                                              onClick={() => onStartAddStop(g.stopIndex)}
                                              className="text-[11px] text-[var(--accent)] hover:underline underline-offset-2"
                                            >
                                              + Add stop after this
                                            </button>
                                          )}
                                          {g.stopIndex > 0 &&
                                            g.stopIndex < routeStops.length - 1 && (
                                              <button
                                                type="button"
                                                onClick={() => onRemoveStop(g.stopIndex)}
                                                className="text-[11px] text-red-300 hover:text-red-200 hover:underline underline-offset-2"
                                              >
                                                Remove this stop from trip
                                              </button>
                                            )}
                                        </div>
                                      </div>

                                      {addingStopAfterIndex === g.stopIndex && (
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
                                            onClick={onConfirmAddStop}
                                            className="rounded-full px-3 py-1.5 text-[11px] font-medium bg-[var(--accent)] text-slate-900 hover:brightness-110"
                                          >
                                            Add stop
                                          </button>
                                          <button
                                            type="button"
                                            onClick={onCancelAddStop}
                                            className="text-[11px] text-gray-300 hover:underline underline-offset-2"
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
