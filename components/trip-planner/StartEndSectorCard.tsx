"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Car } from "lucide-react";
import type { TripPlan } from "@/lib/itinerary";
import {
  formatShortRangeDate,
  makeDayKey,
  addDaysToIsoDate,
  type DayDetail,
  type DayStopMeta,
  type RoadSectorDetail,
} from "@/lib/trip-planner/utils";
import DayCard from "@/components/trip-planner/DayCard";
import CitySearchPill from "@/components/trip-planner/CitySearchPill";
import ViewToggle from "@/components/trip-planner/Things_todo/ViewToggle";
import ThingsToDoList from "@/components/trip-planner/Things_todo/ThingsToDoList";
import ExperienceCard from "@/components/trip-planner/ExperienceCard";

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
  onRemoveExperienceFromDay?: (date: string, location: string, experienceId: string) => void;
  onToggleRoadSectorOpen: (destinationStopIndex: number) => void;
  onUpdateRoadSectorActivities: (destinationStopIndex: number, activities: string) => void;
  onRemoveExperienceFromRoadSector?: (destinationStopIndex: number, experienceId: string) => void;
  onConvertToItinerary: () => void;
  onConvertToRoad: () => void;
  onStartAddStop: (stopIndex: number) => void;
  onConfirmAddStop: () => void;
  onCancelAddStop: () => void;
  onAddToItinerary?: (experience: import("@/lib/walkingExperiences").WalkingExperience, location: string) => void;
  endDate?: string; // End date of the trip (for return trip road sector date calculation)
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
  onRemoveExperienceFromDay,
  onToggleRoadSectorOpen,
  onUpdateRoadSectorActivities,
  onRemoveExperienceFromRoadSector,
  onConvertToItinerary,
  onConvertToRoad,
  onStartAddStop,
  onConfirmAddStop,
  onCancelAddStop,
  onAddToItinerary,
  endDate,
}: StartEndSectorCardProps) {
  // For road sectors, the road sector details are stored by destination stop index
  // When start is a road sector (stopIndex === 0), experiences are stored at the destination (index 1)
  // When end is a road sector, experiences are stored at the end stop index (which is correct)
  const roadSectorIndex = sectorType === "road" && stopIndex === 0 && routeStops.length > 1
    ? 1  // Start road sector: use destination stop index
    : stopIndex;  // End road sector or other: use current stop index
  const roadSectorDetail = roadSectorDetails[roadSectorIndex];
  const roadActivities = roadSectorDetail?.activities ?? "";
  const roadIsOpen = roadSectorDetail?.isOpen ?? false;
  const dayCount = dayIndices.length;
  const firstDay = dayIndices.length > 0 ? plan.days[dayIndices[0]] : null;
  const lastDay = dayIndices.length > 0 ? plan.days[dayIndices[dayIndices.length - 1]] : null;
  
  // Calculate arrival and departure dates
  const arrivalDate = firstDay?.date ?? "";
  // Departure date: always add 1 day to the last day to get the departure date
  // (lastDay.date is the last day you're staying, departure is the next day)
  const departureDate = lastDay?.date 
    ? addDaysToIsoDate(lastDay.date, 1)
    : "";
  
  // For road sectors, calculate the date when arriving at destination
  const roadSectorDate = (() => {
    if (sectorType !== "road" || !plan || plan.days.length === 0 || !dayStopMeta || dayStopMeta.length === 0) return "";
    
    // If this is the start (index 0), use first day of plan
    if (stopIndex === 0 && plan.days.length > 0) {
      return plan.days[0].date;
    }
    
    // If this is the end sector (road), check if it's a return trip
    if (stopIndex === routeStops.length - 1) {
      // Check if it's a return trip (start and end are the same city)
      const isReturnTrip = routeStops.length > 0 && routeStops[0] === routeStops[routeStops.length - 1];
      
      if (isReturnTrip && endDate) {
        // For return trips, use the endDate directly
        return endDate;
      }
      
      // For non-return trips or when endDate is not available, find the last day of the previous itinerary stop
      let lastItineraryStopIndex = -1;
      for (let i = stopIndex - 1; i >= 0; i--) {
        if (nightsPerStop[i] > 0) {
          lastItineraryStopIndex = i;
          break;
        }
      }
      
      if (lastItineraryStopIndex >= 0) {
        // Find the last day at that stop
        let lastDayAtPreviousStop = null;
        for (let idx = plan.days.length - 1; idx >= 0; idx--) {
          if (dayStopMeta[idx]?.stopIndex === lastItineraryStopIndex) {
            lastDayAtPreviousStop = plan.days[idx];
            break;
          }
        }
        
        if (lastDayAtPreviousStop) {
          // Add 1 day to get the arrival date at the end
          return addDaysToIsoDate(lastDayAtPreviousStop.date, 1);
        }
      }
    }
    
    // For other road sectors, find the first day at this stop (destination)
    const firstDayAtDestination = plan.days.find((d, idx) => {
      return dayStopMeta[idx]?.stopIndex === stopIndex && dayStopMeta[idx]?.isFirstForStop;
    });
    
    if (firstDayAtDestination) {
      return firstDayAtDestination.date;
    }
    
    return "";
  })();
  
  // State for view toggle (itinerary/road trip vs things to do)
  const [view, setView] = useState<"itinerary" | "thingsToDo">("itinerary");
  
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
    <div className="rounded-3xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-slate-100/50 transition-all duration-200 ease-in-out hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)] overflow-hidden">
      {/* Header - same size as itinerary sectors */}
      <div className="px-4 md:px-5 py-4">
        {/* Mobile: Stack layout */}
        <div className="md:hidden space-y-4">
          <div className={`flex ${sectorType === "road" ? "items-start" : "items-center"} gap-2 min-w-0`}>
            {sectorType === "road" ? (
              <>
                <Car className="w-4 h-4 text-slate-500 shrink-0 mt-0.5 opacity-60" />
                <button
                  type="button"
                  onClick={() => onToggleRoadSectorOpen(roadSectorIndex)}
                  className="flex items-start gap-2.5 min-w-0 flex-1 group"
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
                    <div className="text-xs font-semibold text-slate-800 break-words leading-tight">
                      {displayName}
                    </div>
                    {roadSectorDate && (
                      <div className="text-[10px] text-slate-600 mt-0.5">
                        {formatShortRangeDate(roadSectorDate)}
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
                      "border border-slate-200/50 bg-slate-50/50 group-hover:bg-slate-100/70 transition-all duration-200 opacity-60",
                    ].join(" ")}
                    aria-hidden
                  >
                    <ChevronDown
                      className={[
                        "w-3.5 h-3.5 text-slate-500 transition-transform duration-200",
                        isOpen ? "rotate-0" : "-rotate-90",
                      ].join(" ")}
                    />
                  </span>
                <div className="min-w-0 flex-1">
                  <div className="text-xl font-semibold text-slate-900 break-words leading-tight">{stopName}</div>
                  {arrivalDate && departureDate && (
                    <div className="text-xs text-slate-500 mt-1 font-normal">
                      {formatShortRangeDate(arrivalDate)} – {formatShortRangeDate(departureDate)} • {nightsHere} Night
                      {nightsHere === 1 ? "" : "s"}
                    </div>
                  )}
                </div>
              </button>
            )}
          </div>

          {sectorType === "road" ? (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={onConvertToItinerary}
                className="px-3 py-1.5 rounded-full border border-slate-200 text-xs hover:bg-slate-50 active:bg-slate-100 transition text-slate-700 whitespace-nowrap"
              >
                Stay in {stopName}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 opacity-60">
              <span className="text-[10px] text-slate-500">Nights:</span>
              <div className="inline-flex items-center rounded-lg border border-slate-200/60 bg-white shadow-sm overflow-hidden">
                <button
                  type="button"
                  onClick={() => onChangeNights(stopIndex, nightsHere - 1)}
                  className="px-3 py-1.5 flex items-center justify-center text-slate-600 hover:bg-slate-50 active:bg-slate-100 transition-all duration-200 border-r border-slate-200/60"
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  value={nightsHere}
                  onChange={(e) => onChangeNights(stopIndex, Number(e.target.value))}
                  className="w-10 text-center input-dark input-no-spinner text-sm py-1.5 px-2 border-0 focus:ring-0"
                />
                <button
                  type="button"
                  onClick={() => onChangeNights(stopIndex, nightsHere + 1)}
                  className="px-3 py-1.5 flex items-center justify-center text-slate-600 hover:bg-slate-50 active:bg-slate-100 transition-all duration-200 border-l border-slate-200/60"
                >
                  +
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Desktop: Horizontal layout */}
        <div className="hidden md:flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {sectorType === "road" ? (
              <>
                <Car className="w-4 h-4 text-slate-600 shrink-0" />
                <button
                  type="button"
                  onClick={() => onToggleRoadSectorOpen(roadSectorIndex)}
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
                    <div className="text-sm font-semibold text-slate-800 truncate">
                      {displayName}
                    </div>
                    {roadSectorDate && (
                      <div className="text-[11px] text-slate-600 truncate">
                        {formatShortRangeDate(roadSectorDate)}
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
                      "w-6 h-6 rounded-lg flex items-center justify-center shrink-0",
                      "border border-slate-200/50 bg-slate-50/50 group-hover:bg-slate-100/70 transition-all duration-200 opacity-60",
                    ].join(" ")}
                    aria-hidden
                  >
                    <ChevronDown
                      className={[
                        "w-3 h-3 text-slate-500 transition-transform duration-200",
                        isOpen ? "rotate-0" : "-rotate-90",
                      ].join(" ")}
                    />
                  </span>
                <div className="min-w-0 flex-1">
                  <div className="text-lg font-semibold text-slate-900 truncate leading-tight">{stopName}</div>
                  {arrivalDate && departureDate && (
                    <div className="text-xs text-slate-500 truncate font-normal mt-0.5">
                      {formatShortRangeDate(arrivalDate)} – {formatShortRangeDate(departureDate)} • {nightsHere} Night
                      {nightsHere === 1 ? "" : "s"}
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
            <div className="flex items-center gap-2 opacity-60">
              <span className="text-[10px] text-slate-500 mr-1">Nights</span>
              <div className="inline-flex items-center rounded-lg border border-slate-200/60 bg-white shadow-sm overflow-hidden">
                <button
                  type="button"
                  onClick={() => onChangeNights(stopIndex, nightsHere - 1)}
                  className="px-2.5 py-1 flex items-center justify-center text-slate-600 hover:bg-slate-50 active:bg-slate-100 transition-all duration-200 border-r border-slate-200/60 text-xs"
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  value={nightsHere}
                  onChange={(e) => onChangeNights(stopIndex, Number(e.target.value))}
                  className="w-10 text-center input-dark input-no-spinner text-xs py-1 px-2 border-0 focus:ring-0"
                />
                <button
                  type="button"
                  onClick={() => onChangeNights(stopIndex, nightsHere + 1)}
                  className="px-2.5 py-1 flex items-center justify-center text-slate-600 hover:bg-slate-50 active:bg-slate-100 transition-all duration-200 border-l border-slate-200/60 text-xs"
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
            <div className="px-4 md:px-5 pb-4">
              <ViewToggle
                view={view}
                onViewChange={setView}
                sectorType="road"
              />
              {view === "itinerary" ? (
                <div className="rounded-xl bg-white border border-slate-200 p-3 space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-900">
                      Activities
                    </label>
                    <textarea
                      rows={3}
                      className="input-dark w-full text-xs"
                      placeholder="e.g. Stop at lookout point, visit winery, lunch break..."
                      value={roadActivities}
                      onChange={(e) => onUpdateRoadSectorActivities(roadSectorIndex, e.target.value)}
                    />
                  </div>

                  {/* Experience Cards */}
                  {roadSectorDetail?.experiences && roadSectorDetail.experiences.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-slate-200">
                      <label className="text-xs font-medium text-slate-900">
                        Added Experiences
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {roadSectorDetail.experiences.map((experience) => (
                          <ExperienceCard
                            key={experience.id}
                            experience={experience}
                            onRemove={onRemoveExperienceFromRoadSector ? () => onRemoveExperienceFromRoadSector(roadSectorIndex, experience.id) : undefined}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <ThingsToDoList location={displayName} onAddToItinerary={onAddToItinerary} />
              )}
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
              <ViewToggle
                view={view}
                onViewChange={setView}
                sectorType="itinerary"
              />
              {view === "itinerary" ? (
                <>
                  <div className="pl-3 md:pl-4 border-l border-slate-200 space-y-3 md:space-y-4">
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
                          onRemoveExperience={onRemoveExperienceFromDay ? (experienceId) => onRemoveExperienceFromDay(d.date, d.location, experienceId) : undefined}
                        />
                      );
                    })}
                  </div>

                  {/* Stop options */}
                  <div className="pl-3 md:pl-4 mt-5 md:mt-6 pt-5 md:pt-6 border-t border-slate-200">
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
                </>
              ) : (
                <ThingsToDoList location={stopName} onAddToItinerary={onAddToItinerary} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
