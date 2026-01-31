"use client";

import { useMemo } from "react";
import { ChevronDown, Car } from "lucide-react";
import type { TripPlan } from "@/lib/itinerary";
import {
  formatShortRangeDate,
  makeDayKey,
  type DayDetail,
  type DayStopMeta,
  type RoadSectorDetail,
} from "@/lib/trip-planner/utils";
import DayCard from "@/components/trip-planner/DayCard";
import CitySearchPill from "@/components/trip-planner/CitySearchPill";

type StartEndSectorCardProps = {
  stopIndex: number;
  stopName: string;
  sectorType: "road" | "itinerary";
  nightsHere: number;
  isOpen: boolean;
  dayIndices: number[];
  plan: TripPlan;
  dayDetails: Record<string, DayDetail>;
  dayStopMeta: DayStopMeta[];
  routeStops: string[];
  nightsPerStop: number[];
  roadSectorDetails: Record<number, RoadSectorDetail>;
  addingStopAfterIndex: number | null;
  newStopCityId: string | null;
  setNewStopCityId: (v: string) => void;
  onToggleOpen: () => void;
  onChangeNights: (stopIndex: number, newValue: number) => void;
  onToggleDayOpen: (date: string, location: string) => void;
  onUpdateDayNotes: (date: string, location: string, notes: string) => void;
  onUpdateDayAccommodation: (date: string, location: string, accommodation: string) => void;
  onToggleRoadSectorOpen: (destinationStopIndex: number) => void;
  onUpdateRoadSectorActivities: (destinationStopIndex: number, activities: string) => void;
  onConvertToItinerary: () => void;
  onConvertToRoad: () => void;
  onStartAddStop: (stopIndex: number) => void;
  onConfirmAddStop: () => void;
  onCancelAddStop: () => void;
};

export default function StartEndSectorCard({
  stopIndex,
  stopName,
  sectorType,
  nightsHere,
  isOpen,
  dayIndices,
  plan,
  dayDetails,
  dayStopMeta,
  routeStops,
  nightsPerStop,
  roadSectorDetails,
  addingStopAfterIndex,
  newStopCityId,
  setNewStopCityId,
  onToggleOpen,
  onChangeNights,
  onToggleDayOpen,
  onUpdateDayNotes,
  onUpdateDayAccommodation,
  onToggleRoadSectorOpen,
  onUpdateRoadSectorActivities,
  onConvertToItinerary,
  onConvertToRoad,
  onStartAddStop,
  onConfirmAddStop,
  onCancelAddStop,
}: StartEndSectorCardProps) {
  const roadSectorDetail = roadSectorDetails[stopIndex];
  const roadActivities = roadSectorDetail?.activities ?? "";
  const roadIsOpen = roadSectorDetail?.isOpen ?? false;
  const dayCount = dayIndices.length;
  const firstDay = dayIndices.length > 0 ? plan.days[dayIndices[0]] : null;
  const lastDay = dayIndices.length > 0 ? plan.days[dayIndices[dayIndices.length - 1]] : null;
  
  // For road sectors, show route instead of just city name
  const displayName = useMemo(() => {
    if (sectorType === "road") {
      if (stopIndex === 0) {
        // Start city: show "StartCity to NextCity"
        const nextStop = routeStops.length > 1 ? routeStops[1] : null;
        return nextStop ? `${stopName} to ${nextStop}` : stopName;
      } else if (stopIndex === routeStops.length - 1) {
        // End city: show "PreviousCity to EndCity"
        const prevStop = routeStops.length > 1 ? routeStops[routeStops.length - 2] : null;
        return prevStop ? `${prevStop} to ${stopName}` : stopName;
      }
    }
    return stopName;
  }, [sectorType, stopIndex, stopName, routeStops]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      {/* Header - same size as itinerary sectors */}
      <div className="px-3 md:px-4 py-3">
        {/* Mobile: Stack layout */}
        <div className="md:hidden space-y-3">
          <div className="flex items-center gap-2 min-w-0">
            {sectorType === "road" ? (
              <>
                <Car className="w-4 h-4 text-slate-600 shrink-0" />
                <button
                  type="button"
                  onClick={() => onToggleRoadSectorOpen(stopIndex)}
                  className="flex items-center gap-2.5 min-w-0 flex-1 group"
                >
                  <span
                    className={[
                      "w-5 h-5 rounded-lg flex items-center justify-center shrink-0",
                      "border border-slate-200 bg-slate-50 group-hover:bg-slate-100 transition",
                    ].join(" ")}
                    aria-hidden
                  >
                    <ChevronDown
                      className={[
                        "w-3 h-3 text-slate-600 transition-transform duration-200",
                        roadIsOpen ? "rotate-0" : "-rotate-90",
                      ].join(" ")}
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-semibold text-slate-800 break-words">{displayName}</div>
                    {firstDay && lastDay && (
                      <div className="text-[11px] text-slate-600 mt-0.5">
                        {formatShortRangeDate(firstDay.date)} – {formatShortRangeDate(lastDay.date)} · {dayCount} day
                        {dayCount === 1 ? "" : "s"}
                      </div>
                    )}
                  </div>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onToggleOpen}
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
                      isOpen ? "rotate-0" : "-rotate-90",
                    ].join(" ")}
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-base font-semibold text-slate-800 break-words">{stopName}</div>
                  {firstDay && lastDay && (
                    <div className="text-[11px] text-slate-600 mt-0.5">
                      {formatShortRangeDate(firstDay.date)} – {formatShortRangeDate(lastDay.date)} · {dayCount} day
                      {dayCount === 1 ? "" : "s"}
                    </div>
                  )}
                </div>
              </button>
            )}


            {sectorType === "road" ? (
              <button
                type="button"
                onClick={onConvertToItinerary}
                className="px-3 py-1.5 rounded-full border border-slate-200 text-xs hover:bg-slate-50 active:bg-slate-100 transition text-slate-700 whitespace-nowrap"
              >
                Stay in {stopName}
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-slate-600">Nights:</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onChangeNights(stopIndex, nightsHere - 1)}
                    className="w-8 h-8 rounded-lg border border-slate-200 text-sm hover:bg-slate-50 active:bg-slate-100 flex items-center justify-center text-slate-700"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={1}
                    value={nightsHere}
                    onChange={(e) => onChangeNights(stopIndex, Number(e.target.value))}
                    className="w-12 text-center input-dark input-no-spinner text-sm py-1.5 px-1"
                  />
                  <button
                    type="button"
                    onClick={() => onChangeNights(stopIndex, nightsHere + 1)}
                    className="w-8 h-8 rounded-lg border border-slate-200 text-sm hover:bg-slate-50 active:bg-slate-100 flex items-center justify-center text-slate-700"
                  >
                    +
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Desktop: Horizontal layout */}
        <div className="hidden md:flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {sectorType === "road" ? (
              <>
                <Car className="w-4 h-4 text-slate-600 shrink-0" />
                <button
                  type="button"
                  onClick={() => onToggleRoadSectorOpen(stopIndex)}
                  className="flex items-center gap-3 min-w-0 group"
                >
                  <span
                    className={[
                      "w-6 h-6 rounded-lg flex items-center justify-center shrink-0",
                      "border border-slate-200 bg-slate-50 group-hover:bg-slate-100 transition",
                    ].join(" ")}
                    aria-hidden
                  >
                    <ChevronDown
                      className={[
                        "w-3 h-3 text-slate-600 transition-transform duration-200",
                        roadIsOpen ? "rotate-0" : "-rotate-90",
                      ].join(" ")}
                    />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-800 truncate">{displayName}</div>
                    {firstDay && lastDay && (
                      <div className="text-[11px] text-slate-600 truncate">
                        {formatShortRangeDate(firstDay.date)} – {formatShortRangeDate(lastDay.date)} · {dayCount} day
                        {dayCount === 1 ? "" : "s"}
                      </div>
                    )}
                  </div>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onToggleOpen}
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
                      isOpen ? "rotate-0" : "-rotate-90",
                    ].join(" ")}
                  />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-800 truncate">{stopName}</div>
                  {firstDay && lastDay && (
                    <div className="text-[11px] text-slate-600 truncate">
                      {formatShortRangeDate(firstDay.date)} – {formatShortRangeDate(lastDay.date)} · {dayCount} day
                      {dayCount === 1 ? "" : "s"}
                    </div>
                  )}
                </div>
              </button>
            )}
          </div>

          {sectorType === "road" ? (
            <button
              type="button"
              onClick={onConvertToItinerary}
              className="px-3 py-1.5 rounded-full border border-slate-200 text-xs hover:bg-slate-50 active:bg-slate-100 transition text-slate-700 whitespace-nowrap"
            >
              Stay in {stopName}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-600 mr-1">Nights</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onChangeNights(stopIndex, nightsHere - 1)}
                  className="px-2 py-1 rounded-full border border-slate-200 text-xs hover:bg-slate-50 text-slate-700"
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  value={nightsHere}
                  onChange={(e) => onChangeNights(stopIndex, Number(e.target.value))}
                  className="w-14 text-center input-dark input-no-spinner text-xs py-1 px-1"
                />
                <button
                  type="button"
                  onClick={() => onChangeNights(stopIndex, nightsHere + 1)}
                  className="px-2 py-1 rounded-full border border-slate-200 text-xs hover:bg-slate-50 text-slate-700"
                >
                  +
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Content (animated collapse) */}
      {sectorType === "road" && (
        <div
          className={[
            "grid transition-[grid-template-rows] duration-250 ease-out",
            roadIsOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          ].join(" ")}
        >
          <div className="overflow-hidden">
            <div className="px-3 md:px-4 pb-3">
              <div className="rounded-xl bg-white border border-slate-200 p-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-900">
                    Activities
                  </label>
                  <textarea
                    rows={3}
                    className="input-dark w-full text-xs"
                    placeholder="e.g. Stop at lookout point, visit winery, lunch break..."
                    value={roadActivities}
                    onChange={(e) => onUpdateRoadSectorActivities(stopIndex, e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {sectorType === "itinerary" && (
        <div
          className={[
            "grid transition-[grid-template-rows] duration-250 ease-out",
            isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          ].join(" ")}
        >
          <div className="overflow-hidden">
            <div className="px-3 md:px-4 pb-4">
              <div className="pl-2 md:pl-3 border-l border-slate-200 space-y-2">
                {dayIndices.map((dayIdx, localIdx) => {
                  const d = plan.days[dayIdx];
                  const key = makeDayKey(d.date, d.location);
                  const detail = dayDetails[key];
                  const isDayOpen = detail?.isOpen ?? false;

                  return (
                    <DayCard
                      key={`day-${d.dayNumber}-${key}`}
                      day={d}
                      isOpen={isDayOpen}
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

              {/* Stop options */}
              <div className="pl-2 md:pl-3 mt-4 pt-4 border-t border-slate-200">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div className="md:hidden space-y-3">
                    {addingStopAfterIndex === stopIndex ? (
                      <CitySearchPill
                        value={newStopCityId}
                        onSelect={setNewStopCityId}
                        onCancel={onCancelAddStop}
                        onConfirm={onConfirmAddStop}
                      />
                    ) : (
                      <div className="flex flex-wrap items-center gap-3">
                        {stopIndex < routeStops.length - 1 && (
                          <button
                            type="button"
                            onClick={() => onStartAddStop(stopIndex)}
                            className="text-[11px] text-[var(--accent)] hover:underline underline-offset-2"
                          >
                            + Add stop after this
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={onConvertToRoad}
                          className="text-[11px] text-slate-600 hover:text-slate-800 hover:underline underline-offset-2"
                        >
                          Just passing through
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="hidden md:flex items-center gap-3">
                    {addingStopAfterIndex === stopIndex ? (
                      <CitySearchPill
                        value={newStopCityId}
                        onSelect={setNewStopCityId}
                        onCancel={onCancelAddStop}
                        onConfirm={onConfirmAddStop}
                      />
                    ) : (
                      <>
                        {stopIndex < routeStops.length - 1 && (
                          <button
                            type="button"
                            onClick={() => onStartAddStop(stopIndex)}
                            className="text-[11px] text-[var(--accent)] hover:underline underline-offset-2"
                          >
                            + Add stop after this
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={onConvertToRoad}
                          className="text-[11px] text-slate-600 hover:text-slate-800 hover:underline underline-offset-2"
                        >
                          Just passing through
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
