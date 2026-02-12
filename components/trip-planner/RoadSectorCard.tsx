"use client";

import { useState } from "react";
import { ChevronDown, Car } from "lucide-react";
import type { TripPlan } from "@/lib/itinerary";
import { formatShortRangeDate, addDaysToIsoDate, type DayStopMeta } from "@/lib/trip-planner/utils";
import ViewToggle from "@/components/trip-planner/Things_todo/ViewToggle";
import ThingsToDoList from "@/components/trip-planner/Things_todo/ThingsToDoList";
import ExperienceCard from "@/components/trip-planner/ExperienceCard";
import type { WalkingExperience } from "@/lib/walkingExperiences";

type RoadSectorCardProps = {
  fromStopIndex: number;
  toStopIndex: number;
  fromStopName: string;
  toStopName: string;
  isOpen: boolean;
  activities: string;
  experiences?: WalkingExperience[];
  plan: TripPlan;
  nightsPerStop: number[];
  startDate: string;
  dayStopMeta: DayStopMeta[];
  routeStops: string[];
  onToggleOpen: () => void;
  onUpdateActivities: (activities: string) => void;
  onAddToItinerary?: (experience: WalkingExperience, location: string) => void;
  onRemoveExperience?: (experienceId: string) => void;
  endDate?: string; // End date of the trip (for return trip road sector date calculation)
};

export default function RoadSectorCard({
  fromStopIndex,
  toStopIndex,
  fromStopName,
  toStopName,
  isOpen,
  activities,
  experiences,
  plan,
  nightsPerStop,
  startDate,
  dayStopMeta,
  routeStops,
  onToggleOpen,
  onUpdateActivities,
  onAddToItinerary,
  onRemoveExperience,
  endDate,
}: RoadSectorCardProps) {
  // State for view toggle (road trip vs things to do)
  const [view, setView] = useState<"itinerary" | "thingsToDo">("itinerary");
  const routeName = `${fromStopName} to ${toStopName}`;
  
  // Calculate the date when arriving at the destination
  // For road sector from A to B: find the first day at destination stop (toStopIndex)
  const roadSectorDate = (() => {
    if (!startDate || !plan || plan.days.length === 0 || !dayStopMeta || dayStopMeta.length === 0) return "";
    
    // If fromStopIndex is 0 (start sector), check if it has nights
    if (fromStopIndex === 0) {
      const startNights = nightsPerStop[0] ?? 0;
      if (startNights > 0) {
        // Start is an itinerary sector - find the last day at start and add 1 day
        let lastDayAtStart = null;
        for (let idx = plan.days.length - 1; idx >= 0; idx--) {
          if (dayStopMeta[idx]?.stopIndex === 0) {
            lastDayAtStart = plan.days[idx];
            break;
          }
        }
        if (lastDayAtStart) {
          return addDaysToIsoDate(lastDayAtStart.date, 1);
        }
      }
      // Start is a road sector - use startDate
      return startDate;
    }
    
    // If destination is the end stop, find last day of previous itinerary stop
    // This handles both cases: when end is a road sector AND when end is an itinerary sector
    const isEndStop = toStopIndex === (routeStops?.length ?? 0) - 1;
    
    if (isEndStop) {
      // Find the last itinerary stop before the end (works for both return and non-return trips)
      let lastItineraryStopIndex = -1;
      for (let i = toStopIndex - 1; i >= 0; i--) {
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
          // Add 1 day to get the arrival date at the end (departure day from previous stop)
          return addDaysToIsoDate(lastDayAtPreviousStop.date, 1);
        }
      }
      
      // Fallback: if endDate is available and no itinerary stop found, use endDate + 1 day
      // (endDate is the last day of the trip, so travel starts the next day)
      if (endDate) {
        return addDaysToIsoDate(endDate, 1);
      }
    }
    
    // For road sectors between stops: find last day at fromStop and add 1 day
    // This is more reliable than trying to find the first day at destination
    let lastDayAtFromStop = null;
    for (let idx = plan.days.length - 1; idx >= 0; idx--) {
      if (dayStopMeta[idx]?.stopIndex === fromStopIndex) {
        lastDayAtFromStop = plan.days[idx];
        break;
      }
    }
    
    if (lastDayAtFromStop) {
      return addDaysToIsoDate(lastDayAtFromStop.date, 1);
    }
    
    // Fallback: try to find the first day at the destination stop
    const firstDayAtDestination = plan.days.find((d, idx) => {
      return dayStopMeta[idx]?.stopIndex === toStopIndex && dayStopMeta[idx]?.isFirstForStop;
    });
    
    if (firstDayAtDestination) {
      return firstDayAtDestination.date;
    }
    
    return "";
  })();

  return (
    <div className="rounded-3xl bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-slate-100/50 transition-all duration-200 ease-in-out hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)] overflow-hidden">
      {/* Road sector header - thinner than itinerary sectors */}
      <div className="px-4 md:px-5 py-3">
        {/* Mobile: Car icon, route text, and dropdown arrow - aligned at top */}
        <div className="md:hidden flex items-start gap-2">
          <Car className="w-4 h-4 text-slate-400 shrink-0 mt-0.5 opacity-50" />
          <button
            type="button"
            onClick={onToggleOpen}
            className="flex items-start gap-2 min-w-0 flex-1 group"
          >
            <span
              className={[
                "w-5 h-5 rounded-lg flex items-center justify-center shrink-0",
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
              <div className="text-xs font-semibold text-slate-800 break-words leading-tight">
                {fromStopName} to {toStopName}
              </div>
              {roadSectorDate && (
                <div className="text-[10px] text-slate-600 mt-0.5">
                  {formatShortRangeDate(roadSectorDate)}
                </div>
              )}
            </div>
          </button>
        </div>

        {/* Desktop: Route text, car icon, and dropdown arrow */}
        <div className="hidden md:flex items-center gap-2 min-w-0">
          <Car className="w-4 h-4 text-slate-600 shrink-0" />
          <button
            type="button"
            onClick={onToggleOpen}
            className="flex items-center gap-2 min-w-0 group"
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
                  isOpen ? "rotate-0" : "-rotate-90",
                ].join(" ")}
              />
            </span>
            <div className="min-w-0">
              <div className="text-xs font-medium text-slate-800 truncate">
                {fromStopName} to {toStopName}
              </div>
              {roadSectorDate && (
                <div className="text-[11px] text-slate-600 truncate">
                  {formatShortRangeDate(roadSectorDate)}
                </div>
              )}
            </div>
          </button>
        </div>
      </div>

      {/* Road sector content (animated collapse) */}
      <div
        className={[
          "grid transition-[grid-template-rows] duration-250 ease-out",
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
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
                    value={activities}
                    onChange={(e) => onUpdateActivities(e.target.value)}
                  />
                </div>

                {/* Experience Cards */}
                {experiences && experiences.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-slate-200">
                    <label className="text-xs font-medium text-slate-900">
                      Added Experiences
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {experiences.map((experience) => (
                        <ExperienceCard
                          key={experience.id}
                          experience={experience}
                          onRemove={onRemoveExperience ? () => onRemoveExperience(experience.id) : undefined}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <ThingsToDoList location={routeName} onAddToItinerary={onAddToItinerary} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
