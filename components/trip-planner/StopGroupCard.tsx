"use client";

import { useState } from "react";
import { ChevronDown, GripVertical } from "lucide-react";
import type { TripPlan } from "@/lib/itinerary";
import {
  formatShortRangeDate,
  makeDayKey,
  addDaysToIsoDate,
  type DayDetail,
  type DayStopMeta,
} from "@/lib/trip-planner/utils";
import DayCard from "@/components/trip-planner/DayCard";
import CitySearchPill from "@/components/trip-planner/CitySearchPill";
import type { Group } from "@/components/trip-planner/DraftItinerary.types";
import ViewToggle from "@/components/trip-planner/Things_todo/ViewToggle";
import ThingsToDoList from "@/components/trip-planner/Things_todo/ThingsToDoList";

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
  onRemoveExperienceFromDay?: (date: string, location: string, experienceId: string) => void;
  onStartAddStop: (stopIndex: number) => void;
  onConfirmAddStop: () => void;
  onCancelAddStop: () => void;
  onRemoveStop: (stopIndex: number) => void;
  dragAttributes?: any;
  dragListeners?: any;
  isDragDisabled?: boolean;
  onAddToItinerary?: (experience: import("@/lib/walkingExperiences").WalkingExperience, location: string) => void;
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
  onRemoveExperienceFromDay,
  onStartAddStop,
  onConfirmAddStop,
  onCancelAddStop,
  onRemoveStop,
  dragAttributes,
  dragListeners,
  isDragDisabled,
  onAddToItinerary,
}: StopGroupCardProps) {
  const isStopOpen = openStops[g.stopIndex] ?? false;
  const dayCount = g.dayIndices.length;
  const nightsHere = nightsPerStop[g.stopIndex] ?? 1;
  
  // Calculate arrival and departure dates
  const arrivalDate = g.startDate;
  const departureDate = arrivalDate ? addDaysToIsoDate(arrivalDate, nightsHere) : "";

  const isDragDisabledLocal = isDragDisabled ?? (g.stopIndex === 0 || g.stopIndex === routeStops.length - 1);
  
  // State for view toggle (itinerary vs things to do)
  const [view, setView] = useState<"itinerary" | "thingsToDo">("itinerary");

  return (
    <div
      className="rounded-3xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-slate-100/50 transition-all duration-200 ease-in-out hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)] overflow-hidden"
    >
      {/* Stop header */}
      <div className="px-4 md:px-5 py-4">
        {/* Mobile: Stack layout */}
        <div className="md:hidden space-y-3">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => onToggleStopOpen(g.stopIndex)}
              className="flex items-center gap-2.5 min-w-0 flex-1 group"
            >
              <span
                className={[
                  "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
                  "border border-slate-200/50 bg-slate-50/50 group-hover:bg-slate-100/70 transition-all duration-200 opacity-60",
                ].join(" ")}
                aria-hidden
              >
                <ChevronDown
                  className={[
                    "w-3.5 h-3.5 text-slate-500 transition-transform duration-200",
                    isStopOpen ? "rotate-0" : "-rotate-90",
                  ].join(" ")}
                />
              </span>

              <div className="min-w-0 flex-1">
                <div className="text-xl font-semibold text-slate-900 break-words leading-tight">{g.stopName}</div>
                {arrivalDate && departureDate && (
                  <div className="text-xs text-slate-500 mt-1 font-normal">
                    {formatShortRangeDate(arrivalDate)} – {formatShortRangeDate(departureDate)} • {nightsHere} Night
                    {nightsHere === 1 ? "" : "s"}
                  </div>
                )}
              </div>
            </button>
            {!isDragDisabledLocal && dragAttributes && dragListeners && (
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="p-1.5 -mr-1 rounded-lg border border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200 hover:border-slate-400 active:bg-slate-300 touch-none cursor-grab transition-all duration-200"
                aria-label="Reorder stop"
                {...dragListeners}
                {...dragAttributes}
              >
                <GripVertical className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Nights stepper for mobile */}
          <div className="flex items-center gap-2 pl-9 opacity-60">
            <span className="text-[10px] text-slate-500">Nights:</span>
            <div className="inline-flex items-center rounded-lg border border-slate-200/60 bg-white shadow-sm overflow-hidden">
              <button
                type="button"
                onClick={() => onChangeNights(g.stopIndex, nightsHere - 1)}
                className="px-3 py-1.5 flex items-center justify-center text-slate-600 hover:bg-slate-50 active:bg-slate-100 transition-all duration-200 border-r border-slate-200/60"
              >
                −
              </button>
              <input
                type="number"
                min={1}
                value={nightsHere}
                onChange={(e) => onChangeNights(g.stopIndex, Number(e.target.value))}
                className="w-10 text-center input-dark input-no-spinner text-sm py-1.5 px-2 border-0 focus:ring-0"
              />
              <button
                type="button"
                onClick={() => onChangeNights(g.stopIndex, nightsHere + 1)}
                className="px-3 py-1.5 flex items-center justify-center text-slate-600 hover:bg-slate-50 active:bg-slate-100 transition-all duration-200 border-l border-slate-200/60"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Desktop: Horizontal layout */}
        <div className="hidden md:flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => onToggleStopOpen(g.stopIndex)}
              className="flex items-center gap-3 min-w-0 group"
            >
              <span
                className={[
                  "w-8 h-8 rounded-xl flex items-center justify-center",
                  "border border-slate-200/50 bg-slate-50/50 group-hover:bg-slate-100/70 transition-all duration-200 opacity-60",
                ].join(" ")}
                aria-hidden
              >
                <ChevronDown
                  className={[
                    "w-4 h-4 text-slate-500 transition-transform duration-200",
                    isStopOpen ? "rotate-0" : "-rotate-90",
                  ].join(" ")}
                />
              </span>

              <div className="min-w-0">
                <div className="text-lg font-semibold text-slate-900 truncate leading-tight">{g.stopName}</div>
                {arrivalDate && departureDate && (
                  <div className="text-xs text-slate-500 truncate font-normal mt-0.5">
                    {formatShortRangeDate(arrivalDate)} – {formatShortRangeDate(departureDate)} • {nightsHere} Night
                    {nightsHere === 1 ? "" : "s"}
                  </div>
                )}
              </div>
            </button>
          </div>

          {/* Nights stepper for desktop */}
          <div className="flex items-center gap-2 opacity-60">
            <span className="text-[10px] text-slate-500 mr-1">Nights</span>
            <div className="inline-flex items-center rounded-lg border border-slate-200/60 bg-white shadow-sm overflow-hidden">
              <button
                type="button"
                onClick={() => onChangeNights(g.stopIndex, nightsHere - 1)}
                className="px-2.5 py-1 flex items-center justify-center text-slate-600 hover:bg-slate-50 active:bg-slate-100 transition-all duration-200 border-r border-slate-200/60 text-xs"
              >
                −
              </button>
              <input
                type="number"
                min={1}
                value={nightsHere}
                onChange={(e) => onChangeNights(g.stopIndex, Number(e.target.value))}
                className="w-10 text-center input-dark input-no-spinner text-xs py-1 px-2 border-0 focus:ring-0"
              />
              <button
                type="button"
                onClick={() => onChangeNights(g.stopIndex, nightsHere + 1)}
                className="px-2.5 py-1 flex items-center justify-center text-slate-600 hover:bg-slate-50 active:bg-slate-100 transition-all duration-200 border-l border-slate-200/60 text-xs"
              >
                +
              </button>
            </div>
            {!isDragDisabledLocal && dragAttributes && dragListeners && (
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="p-2 -mr-2 rounded-lg border border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200 hover:border-slate-400 active:bg-slate-300 touch-none cursor-grab transition-all duration-200"
                aria-label="Reorder stop"
                {...dragListeners}
                {...dragAttributes}
              >
                <GripVertical className="w-4 h-4" />
              </button>
            )}
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
          <div className="px-4 md:px-5 pb-4">
            <ViewToggle
              view={view}
              onViewChange={setView}
              sectorType="itinerary"
            />
            {view === "itinerary" ? (
              <>
                <div className="pl-3 md:pl-4 border-l border-slate-200 space-y-3 md:space-y-4">
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
                        onRemoveExperience={onRemoveExperienceFromDay ? (experienceId) => onRemoveExperienceFromDay(d.date, d.location, experienceId) : undefined}
                      />
                    );
                  })}
                </div>

                {/* Stop options - only visible when expanded */}
                <div className="pl-3 md:pl-4 mt-5 md:mt-6 pt-5 md:pt-6 border-t border-slate-200">
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
              </>
              ) : (
                <ThingsToDoList location={g.stopName} onAddToItinerary={onAddToItinerary} />
              )}
          </div>
        </div>
      </div>
    </div>
  );
}
