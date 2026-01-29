"use client";

import { ChevronDown, GripVertical } from "lucide-react";
import type { TripPlan } from "@/lib/itinerary";
import {
  formatShortRangeDate,
  makeDayKey,
  type DayDetail,
  type DayStopMeta,
} from "@/lib/trip-planner/utils";
import DayCard from "@/components/trip-planner/DayCard";
import CitySearchPill from "@/components/trip-planner/CitySearchPill";
import type { Group } from "@/components/trip-planner/DraftItinerary.types";

type StopGroupCardProps = {
  group: Group;
  routeStops: string[];
  nightsPerStop: number[];
  plan: TripPlan;
  dayDetails: Record<string, DayDetail>;
  dayStopMeta: DayStopMeta[];
  openStops: Record<number, boolean>;
  addingStopAfterIndex: number | null;
  newStopCityId: string | null;
  setNewStopCityId: (v: string) => void;
  onToggleStopOpen: (stopIndex: number) => void;
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
  dragAttributes?: any;
  dragListeners?: any;
  isDragDisabled?: boolean;
};

export default function StopGroupCard({
  group: g,
  routeStops,
  nightsPerStop,
  plan,
  dayDetails,
  openStops,
  addingStopAfterIndex,
  newStopCityId,
  setNewStopCityId,
  onToggleStopOpen,
  onChangeNights,
  onToggleDayOpen,
  onUpdateDayNotes,
  onUpdateDayAccommodation,
  onStartAddStop,
  onConfirmAddStop,
  onCancelAddStop,
  onRemoveStop,
  dragAttributes,
  dragListeners,
  isDragDisabled,
}: StopGroupCardProps) {
  const isStopOpen = openStops[g.stopIndex] ?? false;
  const dayCount = g.dayIndices.length;
  const nightsHere = nightsPerStop[g.stopIndex] ?? 1;

  const isDragDisabledLocal = isDragDisabled ?? (g.stopIndex === 0 || g.stopIndex === routeStops.length - 1);

  return (
    <div
      className="rounded-2xl border border-slate-200 bg-white overflow-hidden"
    >
      {/* Stop header */}
      <div className="px-3 md:px-4 py-3">
        {/* Mobile: Stack layout */}
        <div className="md:hidden space-y-3">
          <div className="flex items-center gap-2 min-w-0">
            {!isDragDisabledLocal && dragAttributes && dragListeners && (
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="p-1.5 -ml-1 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 active:bg-slate-100 touch-none cursor-grab"
                aria-label="Reorder stop"
                {...dragListeners}
                {...dragAttributes}
              >
                <GripVertical className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={() => onToggleStopOpen(g.stopIndex)}
              className="flex items-center gap-2.5 min-w-0 flex-1 group"
            >
              <span
                className={[
                  "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
                  "border border-slate-200 bg-slate-50 group-hover:bg-slate-100 transition",
                ].join(" ")}
                aria-hidden
              >
                <ChevronDown
                  className={[
                    "w-3.5 h-3.5 text-slate-600 transition-transform duration-200",
                    isStopOpen ? "rotate-0" : "-rotate-90",
                  ].join(" ")}
                />
              </span>

              <div className="min-w-0 flex-1">
                <div className="text-base font-semibold text-slate-800 break-words">{g.stopName}</div>
                <div className="text-[11px] text-slate-600 mt-0.5">
                  {formatShortRangeDate(g.startDate)} – {formatShortRangeDate(g.endDate)} · {dayCount} day
                  {dayCount === 1 ? "" : "s"}
                </div>
              </div>
            </button>
          </div>

          {/* Nights stepper for mobile */}
          <div className="flex items-center gap-2 pl-9">
            <span className="text-[11px] text-slate-600">Nights:</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onChangeNights(g.stopIndex, nightsHere - 1)}
                className="w-8 h-8 rounded-lg border border-slate-200 text-sm hover:bg-slate-50 active:bg-slate-100 flex items-center justify-center text-slate-700"
              >
                −
              </button>
              <input
                type="number"
                min={1}
                value={nightsHere}
                onChange={(e) => onChangeNights(g.stopIndex, Number(e.target.value))}
                className="w-12 text-center input-dark input-no-spinner text-sm py-1.5 px-1"
              />
              <button
                type="button"
                onClick={() => onChangeNights(g.stopIndex, nightsHere + 1)}
                className="w-8 h-8 rounded-lg border border-slate-200 text-sm hover:bg-slate-50 active:bg-slate-100 flex items-center justify-center text-slate-700"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Desktop: Horizontal layout */}
        <div className="hidden md:flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {!isDragDisabledLocal && dragAttributes && dragListeners && (
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="p-2 -ml-2 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 active:bg-slate-100 touch-none cursor-grab"
                aria-label="Reorder stop"
                {...dragListeners}
                {...dragAttributes}
              >
                <GripVertical className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={() => onToggleStopOpen(g.stopIndex)}
              className="flex items-center gap-3 min-w-0 group"
            >
              <span
                className={[
                  "w-8 h-8 rounded-xl flex items-center justify-center",
                  "border border-slate-200 bg-slate-50 group-hover:bg-slate-100 transition",
                ].join(" ")}
                aria-hidden
              >
                <ChevronDown
                  className={[
                    "w-4 h-4 text-slate-600 transition-transform duration-200",
                    isStopOpen ? "rotate-0" : "-rotate-90",
                  ].join(" ")}
                />
              </span>

              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-800 truncate">{g.stopName}</div>
                <div className="text-[11px] text-slate-600 truncate">
                  {formatShortRangeDate(g.startDate)} – {formatShortRangeDate(g.endDate)} · {dayCount} day
                  {dayCount === 1 ? "" : "s"}
                </div>
              </div>
            </button>
          </div>

          {/* Nights stepper for desktop */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-600 mr-1">Nights</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onChangeNights(g.stopIndex, nightsHere - 1)}
                className="px-2 py-1 rounded-full border border-slate-200 text-xs hover:bg-slate-50 text-slate-700"
              >
                −
              </button>
              <input
                type="number"
                min={1}
                value={nightsHere}
                onChange={(e) => onChangeNights(g.stopIndex, Number(e.target.value))}
                className="w-14 text-center input-dark input-no-spinner text-xs py-1 px-1"
              />
              <button
                type="button"
                onClick={() => onChangeNights(g.stopIndex, nightsHere + 1)}
                className="px-2 py-1 rounded-full border border-slate-200 text-xs hover:bg-slate-50 text-slate-700"
              >
                +
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stop content (animated collapse) */}
      <div
        className={[
          "grid transition-[grid-template-rows] duration-250 ease-out",
          isStopOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        ].join(" ")}
      >
        <div className="overflow-hidden">
          <div className="px-3 md:px-4 pb-4">
            <div className="pl-2 md:pl-3 border-l border-slate-200 space-y-2">
              {g.dayIndices.map((dayIdx, localIdx) => {
                const d = plan.days[dayIdx];
                const key = makeDayKey(d.date, d.location);
                const detail = dayDetails[key];
                const isOpen = detail?.isOpen ?? false;

                const isFirstForStop = localIdx === 0;

                return (
                  <DayCard
                    key={`day-${d.dayNumber}-${key}`}
                    day={d}
                    isOpen={isOpen}
                    detail={detail}
                    onToggleOpen={() => onToggleDayOpen(d.date, d.location)}
                    onUpdateNotes={(notes) => onUpdateDayNotes(d.date, d.location, notes)}
                    onUpdateAccommodation={(accommodation) =>
                      onUpdateDayAccommodation(d.date, d.location, accommodation)
                    }
                  />
                );
              })}
            </div>

            {/* Stop options - only visible when expanded */}
            <div className="pl-2 md:pl-3 mt-4 pt-4 border-t border-slate-200">
              <div className="flex flex-col md:flex-row md:items-center md:justify-end gap-3">
                {/* Mobile: Stack layout */}
                <div className="md:hidden space-y-3">
                  {addingStopAfterIndex === g.stopIndex ? (
                    <CitySearchPill
                      value={newStopCityId}
                      onSelect={setNewStopCityId}
                      onCancel={onCancelAddStop}
                      onConfirm={onConfirmAddStop}
                    />
                  ) : (
                    <div className="flex flex-wrap items-center gap-3">
                      {g.stopIndex < routeStops.length - 1 && (
                        <button
                          type="button"
                          onClick={() => onStartAddStop(g.stopIndex)}
                          className="text-[11px] text-[var(--accent)] hover:underline underline-offset-2"
                        >
                          + Add stop after this
                        </button>
                      )}
                      {g.stopIndex > 0 && g.stopIndex < routeStops.length - 1 && (
                        <button
                          type="button"
                          onClick={() => onRemoveStop(g.stopIndex)}
                          className="text-[11px] text-red-300 hover:text-red-200 hover:underline underline-offset-2"
                        >
                          Remove this stop from trip
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Desktop: Horizontal layout, aligned right */}
                <div className="hidden md:flex items-center gap-3">
                  {addingStopAfterIndex === g.stopIndex ? (
                    <CitySearchPill
                      value={newStopCityId}
                      onSelect={setNewStopCityId}
                      onCancel={onCancelAddStop}
                      onConfirm={onConfirmAddStop}
                    />
                  ) : (
                    <>
                      {g.stopIndex < routeStops.length - 1 && (
                        <button
                          type="button"
                          onClick={() => onStartAddStop(g.stopIndex)}
                          className="text-[11px] text-[var(--accent)] hover:underline underline-offset-2"
                        >
                          + Add stop after this
                        </button>
                      )}
                      {g.stopIndex > 0 && g.stopIndex < routeStops.length - 1 && (
                        <button
                          type="button"
                          onClick={() => onRemoveStop(g.stopIndex)}
                          className="text-[11px] text-red-300 hover:text-red-200 hover:underline underline-offset-2"
                        >
                          Remove this stop from trip
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
