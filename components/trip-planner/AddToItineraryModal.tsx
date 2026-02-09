"use client";

import { useEffect, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { X, ChevronDown, Car } from "lucide-react";
import type { TripPlan } from "@/lib/itinerary";
import type { WalkingExperience } from "@/lib/walkingExperiences";
import type { DayDetail, DayStopMeta, RoadSectorDetail } from "@/lib/trip-planner/utils";
import {
  formatShortRangeDate,
  formatDisplayDate,
  makeDayKey,
  addDaysToIsoDate,
} from "@/lib/trip-planner/utils";

type AddToItineraryModalProps = {
  isOpen: boolean;
  onClose: () => void;
  experience: WalkingExperience;
  location: string; // The location context (city name or "CityA to CityB")
  plan: TripPlan;
  routeStops: string[];
  nightsPerStop: number[];
  dayStopMeta: DayStopMeta[];
  dayDetails: Record<string, DayDetail>;
  roadSectorDetails: Record<number, RoadSectorDetail>;
  startSectorType: "road" | "itinerary";
  endSectorType: "road" | "itinerary";
  onAddToDay: (date: string, location: string, experience: WalkingExperience) => void;
  onAddToRoadSector: (destinationStopIndex: number, experience: WalkingExperience) => void;
};

export default function AddToItineraryModal({
  isOpen,
  onClose,
  experience,
  location,
  plan,
  routeStops,
  nightsPerStop,
  dayStopMeta,
  dayDetails,
  roadSectorDetails,
  startSectorType,
  endSectorType,
  onAddToDay,
  onAddToRoadSector,
}: AddToItineraryModalProps) {
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Determine which section should be expanded based on location
  const defaultExpandedSection = useMemo(() => {
    if (!location) return null;
    
    // Check if it's a road sector (contains " to ")
    const isRoadSector = location.includes(" to ");
    
    if (isRoadSector) {
      // For road sectors, return the road sector key
      const [fromCity, toCity] = location.split(" to ").map(s => s.trim());
      
      // Check if it's the start road sector
      if (startSectorType === "road" && routeStops.length > 1) {
        const startStop = routeStops[0];
        const firstStop = routeStops[1];
        if (
          (startStop.includes(fromCity) || fromCity.includes(startStop)) &&
          (firstStop.includes(toCity) || toCity.includes(firstStop))
        ) {
          return "road-start";
        }
      }
      
      // Check if it's the end road sector
      if (endSectorType === "road" && routeStops.length > 1) {
        const prevStop = routeStops[routeStops.length - 2];
        const endStop = routeStops[routeStops.length - 1];
        if (
          (prevStop.includes(fromCity) || fromCity.includes(prevStop)) &&
          (endStop.includes(toCity) || toCity.includes(endStop))
        ) {
          return "road-end";
        }
      }
      
      // Find matching road sector between stops
      for (let i = 1; i < routeStops.length; i++) {
        const fromStop = routeStops[i - 1];
        const toStop = routeStops[i];
        if (
          (fromStop.includes(fromCity) || fromCity.includes(fromStop)) &&
          (toStop.includes(toCity) || toCity.includes(toStop))
        ) {
          return `road-${i}`;
        }
      }
      
      // Also check start to first stop (when start is itinerary)
      if (startSectorType === "itinerary" && routeStops.length > 1) {
        const startStop = routeStops[0];
        const firstStop = routeStops[1];
        if (
          (startStop.includes(fromCity) || fromCity.includes(startStop)) &&
          (firstStop.includes(toCity) || toCity.includes(firstStop))
        ) {
          return `road-1`;
        }
      }
    } else {
      // For itinerary sectors, find the stop index
      for (let i = 0; i < routeStops.length; i++) {
        const stopName = routeStops[i];
        // Check if location matches this stop (case-insensitive, partial match)
        if (
          stopName.toLowerCase().includes(location.toLowerCase()) ||
          location.toLowerCase().includes(stopName.toLowerCase())
        ) {
          return `stop-${i}`;
        }
      }
    }
    
    return null;
  }, [location, routeStops, startSectorType, endSectorType]);

  // Initialize expanded sections with the default expanded section
  useEffect(() => {
    if (defaultExpandedSection) {
      setExpandedSections(new Set([defaultExpandedSection]));
    } else {
      setExpandedSections(new Set());
    }
  }, [defaultExpandedSection]);

  const toggleSection = (sectionKey: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionKey)) {
        next.delete(sectionKey);
      } else {
        next.add(sectionKey);
      }
      return next;
    });
  };

  // Get groups for itinerary display
  const stopGroups = useMemo(() => {
    if (!plan || plan.days.length === 0) return [];

    const groups: Array<{
      stopIndex: number;
      stopName: string;
      dayIndices: number[];
      startDate: string;
      endDate: string;
    }> = [];
    const seen = new Set<number>();

    for (let i = 0; i < plan.days.length; i++) {
      const meta = dayStopMeta[i];
      const stopIndex = meta?.stopIndex ?? -1;
      if (stopIndex < 0) continue;
      if (stopIndex === 0 || stopIndex === routeStops.length - 1) continue;
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

  // Get start and end groups
  const startGroup = useMemo(() => {
    if (routeStops.length === 0) return null;
    
    // For road sectors, we still need to return a group for display purposes
    if (startSectorType === "road") {
      return {
        stopIndex: 0,
        stopName: routeStops[0] ?? "",
        dayIndices: [],
        startDate: plan?.days[0]?.date ?? "",
        endDate: plan?.days[0]?.date ?? "",
      };
    }
    
    if (!plan) return null;
    
    if (plan.days.length === 0) return null;
    
    const indices: number[] = [];
    for (let j = 0; j < plan.days.length; j++) {
      if ((dayStopMeta[j]?.stopIndex ?? -1) === 0) indices.push(j);
    }
    if (indices.length === 0) return null;

    const first = plan.days[indices[0]];
    const last = plan.days[indices[indices.length - 1]];

    return {
      stopIndex: 0,
      stopName: routeStops[0] ?? first.location,
      dayIndices: indices,
      startDate: first.date,
      endDate: last.date,
    };
  }, [plan, dayStopMeta, routeStops, startSectorType]);

  const endGroup = useMemo(() => {
    if (routeStops.length < 2) return null;
    
    // For road sectors, we still need to return a group for display purposes
    if (endSectorType === "road") {
      return {
        stopIndex: routeStops.length - 1,
        stopName: routeStops[routeStops.length - 1] ?? "",
        dayIndices: [],
        startDate: plan?.days?.length > 0 ? plan.days[plan.days.length - 1]?.date ?? "" : "",
        endDate: plan?.days?.length > 0 ? plan.days[plan.days.length - 1]?.date ?? "" : "",
      };
    }
    
    if (!plan) return null;
    
    if (plan.days.length === 0) return null;
    
    const endIndex = routeStops.length - 1;
    const indices: number[] = [];
    for (let j = 0; j < plan.days.length; j++) {
      if ((dayStopMeta[j]?.stopIndex ?? -1) === endIndex) indices.push(j);
    }
    if (indices.length === 0) return null;

    const first = plan.days[indices[0]];
    const last = plan.days[indices[indices.length - 1]];

    return {
      stopIndex: endIndex,
      stopName: routeStops[endIndex] ?? first.location,
      dayIndices: indices,
      startDate: first.date,
      endDate: last.date,
    };
  }, [plan, dayStopMeta, routeStops, endSectorType]);

  const handleAddToDay = (date: string, location: string) => {
    onAddToDay(date, location, experience);
    onClose();
  };

  const handleAddToRoadSector = (destinationStopIndex: number) => {
    onAddToRoadSector(destinationStopIndex, experience);
    onClose();
  };

  // Calculate road sector dates
  const getRoadSectorDate = (fromStopIndex: number, toStopIndex: number): string => {
    if (!plan || plan.days.length === 0 || !dayStopMeta || dayStopMeta.length === 0) return "";
    
    if (fromStopIndex === 0) {
      const startNights = nightsPerStop[0] ?? 0;
      if (startNights > 0) {
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
      return plan.days[0]?.date ?? "";
    }
    
    const isEndStop = toStopIndex === routeStops.length - 1;
    if (isEndStop) {
      let lastItineraryStopIndex = -1;
      for (let i = toStopIndex - 1; i >= 0; i--) {
        if (nightsPerStop[i] > 0) {
          lastItineraryStopIndex = i;
          break;
        }
      }
      
      if (lastItineraryStopIndex >= 0) {
        let lastDayAtPreviousStop = null;
        for (let idx = plan.days.length - 1; idx >= 0; idx--) {
          if (dayStopMeta[idx]?.stopIndex === lastItineraryStopIndex) {
            lastDayAtPreviousStop = plan.days[idx];
            break;
          }
        }
        if (lastDayAtPreviousStop) {
          return addDaysToIsoDate(lastDayAtPreviousStop.date, 1);
        }
      }
    }
    
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
    
    return "";
  };

  if (!mounted || !isOpen) return null;

  const activityText = experience.track_name;
  const isRoadSector = location.includes(" to ");

  return createPortal(
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <div
        className={`relative z-10 w-full rounded-2xl bg-white border border-slate-200 shadow-2xl max-h-[90vh] overflow-y-auto flex flex-col ${
          isMobile ? "p-4 max-w-full" : "p-6 max-w-3xl"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-200">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-slate-800 mb-1">
              Add to itinerary
            </h2>
            <p className="text-sm text-slate-600 truncate">
              {activityText}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition ml-3 flex-shrink-0"
          >
            <X className="w-4 h-4 text-slate-700" />
          </button>
        </div>

        {/* Mini Itinerary */}
        <div className="flex-1 overflow-y-auto pr-2 space-y-3">
          {/* Start road sector - show when start is road sector and there are at least 2 stops */}
          {startSectorType === "road" && routeStops.length >= 2 && (
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <button
                type="button"
                onClick={() => toggleSection("road-start")}
                className="w-full px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between hover:bg-slate-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Car className="w-3 h-3 text-slate-600" />
                  <div className="text-xs font-semibold text-slate-800">
                    {routeStops.length > 1 
                      ? `${routeStops[0]} to ${routeStops[1]}`
                      : routeStops[0] ?? ""}
                  </div>
                </div>
                <ChevronDown
                  className={[
                    "w-4 h-4 text-slate-600 transition-transform duration-200",
                    expandedSections.has("road-start") ? "rotate-0" : "-rotate-90",
                  ].join(" ")}
                />
              </button>
              {expandedSections.has("road-start") && (
                <div className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      handleAddToRoadSector(routeStops.length > 1 ? 1 : 0);
                    }}
                    className="w-full text-left rounded-lg border-2 border-indigo-200 bg-indigo-50 hover:bg-indigo-100 p-3 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-slate-900">
                          Road trip
                        </div>
                        <div className="text-[10px] text-slate-600 mt-0.5">
                          {formatShortRangeDate(getRoadSectorDate(0, routeStops.length > 1 ? 1 : 0))}
                        </div>
                      </div>
                      <div className="text-[10px] text-indigo-600 font-medium">
                        Add here
                      </div>
                    </div>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Start sector */}
          {startGroup && (
            <>
              {/* Start itinerary sector */}
              {startSectorType === "itinerary" && startGroup && (
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleSection("stop-0")}
                    className="w-full px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between hover:bg-slate-100 transition-colors"
                  >
                    <div className="text-xs font-semibold text-slate-800">
                      {startGroup.stopName}
                    </div>
                    <ChevronDown
                      className={[
                        "w-4 h-4 text-slate-600 transition-transform duration-200",
                        expandedSections.has("stop-0") ? "rotate-0" : "-rotate-90",
                      ].join(" ")}
                    />
                  </button>
                  {expandedSections.has("stop-0") && (
                    <div className="px-3 py-2 space-y-2" onClick={(e) => e.stopPropagation()}>
                    {startGroup.dayIndices.map((dayIdx) => {
                      const d = plan.days[dayIdx];
                      const key = makeDayKey(d.date, d.location);
                      const detail = dayDetails[key];
                      const isDayOpen = detail?.isOpen ?? false;

                      return (
                        <div key={`day-${d.dayNumber}-${key}`}>
                          <button
                            type="button"
                            onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            handleAddToDay(d.date, d.location);
                          }}
                            className="w-full text-left rounded-lg border-2 border-indigo-200 bg-indigo-50 hover:bg-indigo-100 p-3 transition-colors"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-semibold text-slate-900">
                                  Day {d.dayNumber}
                                </div>
                                <div className="text-[10px] text-slate-600 mt-0.5">
                                  {formatDisplayDate(d.date)}
                                </div>
                              </div>
                              <div className="text-[10px] text-indigo-600 font-medium">
                                Add here
                              </div>
                            </div>
                          </button>
                        </div>
                      );
                    })}
                    </div>
                  )}
                </div>
              )}

              {/* Road sector from start to first middle stop */}
              {startSectorType === "itinerary" && stopGroups.length > 0 && startGroup && (
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleSection("road-1")}
                    className="w-full px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Car className="w-3 h-3 text-slate-600" />
                      <div className="text-xs font-semibold text-slate-800">
                        {startGroup.stopName} to {stopGroups[0].stopName}
                      </div>
                    </div>
                    <ChevronDown
                      className={[
                        "w-4 h-4 text-slate-600 transition-transform duration-200",
                        expandedSections.has("road-1") ? "rotate-0" : "-rotate-90",
                      ].join(" ")}
                    />
                  </button>
                  {expandedSections.has("road-1") && (
                    <div className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        handleAddToRoadSector(stopGroups[0].stopIndex);
                      }}
                      className="w-full text-left rounded-lg border-2 border-indigo-200 bg-indigo-50 hover:bg-indigo-100 p-3 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-slate-900">
                            Road trip
                          </div>
                          <div className="text-[10px] text-slate-600 mt-0.5">
                            {formatShortRangeDate(getRoadSectorDate(0, stopGroups[0].stopIndex))}
                          </div>
                        </div>
                        <div className="text-[10px] text-indigo-600 font-medium">
                          Add here
                        </div>
                      </div>
                    </button>
                    </div>
                  )}
                </div>
              )}

              {/* Road sector from start to end when only 2 stops and both are itinerary */}
              {startSectorType === "itinerary" && endSectorType === "itinerary" && 
               routeStops.length === 2 && stopGroups.length === 0 && startGroup && endGroup && (
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleSection(`road-${routeStops.length - 1}`)}
                    className="w-full px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Car className="w-3 h-3 text-slate-600" />
                      <div className="text-xs font-semibold text-slate-800">
                        {startGroup.stopName} to {endGroup.stopName}
                      </div>
                    </div>
                    <ChevronDown
                      className={[
                        "w-4 h-4 text-slate-600 transition-transform duration-200",
                        expandedSections.has(`road-${routeStops.length - 1}`) ? "rotate-0" : "-rotate-90",
                      ].join(" ")}
                    />
                  </button>
                  {expandedSections.has(`road-${routeStops.length - 1}`) && (
                    <div className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        handleAddToRoadSector(routeStops.length - 1);
                      }}
                      className="w-full text-left rounded-lg border-2 border-indigo-200 bg-indigo-50 hover:bg-indigo-100 p-3 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-slate-900">
                            Road trip
                          </div>
                          <div className="text-[10px] text-slate-600 mt-0.5">
                            {formatShortRangeDate(getRoadSectorDate(0, routeStops.length - 1))}
                          </div>
                        </div>
                        <div className="text-[10px] text-indigo-600 font-medium">
                          Add here
                        </div>
                      </div>
                    </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Middle stops */}
          {stopGroups.map((group, idx) => {
            const roadSectorKey = `road-${group.stopIndex}`;
            const stopKey = `stop-${group.stopIndex}`;
            const fromStopName = idx === 0 && startGroup
              ? startGroup.stopName
              : stopGroups[idx - 1]?.stopName ?? "";
            
            return (
              <div key={`group-${group.stopIndex}`} className="space-y-2">
                {/* Road sector before this stop */}
                {/* Don't render if: (1) first stop and start is itinerary, OR (2) first stop and start is road (already rendered above) */}
                {idx === 0 && ((startGroup && startSectorType === "itinerary") || startSectorType === "road") ? null : (
                  <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleSection(roadSectorKey)}
                      className="w-full px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Car className="w-3 h-3 text-slate-600" />
                        <div className="text-xs font-semibold text-slate-800">
                          {fromStopName} to {group.stopName}
                        </div>
                      </div>
                      <ChevronDown
                        className={[
                          "w-4 h-4 text-slate-600 transition-transform duration-200",
                          expandedSections.has(roadSectorKey) ? "rotate-0" : "-rotate-90",
                        ].join(" ")}
                      />
                    </button>
                    {expandedSections.has(roadSectorKey) && (
                      <div className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            handleAddToRoadSector(group.stopIndex);
                          }}
                          className="w-full text-left rounded-lg border-2 border-indigo-200 bg-indigo-50 hover:bg-indigo-100 p-3 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-semibold text-slate-900">
                                Road trip
                              </div>
                              <div className="text-[10px] text-slate-600 mt-0.5">
                                {formatShortRangeDate(
                                  getRoadSectorDate(
                                    idx === 0 && startGroup ? 0 : stopGroups[idx - 1]?.stopIndex ?? 0,
                                    group.stopIndex
                                  )
                                )}
                              </div>
                            </div>
                            <div className="text-[10px] text-indigo-600 font-medium">
                              Add here
                            </div>
                          </div>
                        </button>
                      </div>
                    )}
                  </div>
                )}

              {/* Itinerary stop */}
              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleSection(stopKey)}
                  className="w-full px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between hover:bg-slate-100 transition-colors"
                >
                  <div className="text-xs font-semibold text-slate-800">
                    {group.stopName}
                  </div>
                  <ChevronDown
                    className={[
                      "w-4 h-4 text-slate-600 transition-transform duration-200",
                      expandedSections.has(stopKey) ? "rotate-0" : "-rotate-90",
                    ].join(" ")}
                  />
                </button>
                {expandedSections.has(stopKey) && (
                  <div className="px-3 py-2 space-y-2" onClick={(e) => e.stopPropagation()}>
                  {group.dayIndices.map((dayIdx) => {
                    const d = plan.days[dayIdx];
                    const key = makeDayKey(d.date, d.location);
                    const detail = dayDetails[key];
                    const isDayOpen = detail?.isOpen ?? false;
                    return (
                      <div key={`day-${d.dayNumber}-${key}`}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            handleAddToDay(d.date, d.location);
                          }}
                          className="w-full text-left rounded-lg border-2 border-indigo-200 bg-indigo-50 hover:bg-indigo-100 p-3 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-semibold text-slate-900">
                                Day {d.dayNumber}
                              </div>
                              <div className="text-[10px] text-slate-600 mt-0.5">
                                {formatDisplayDate(d.date)}
                              </div>
                            </div>
                            <div className="text-[10px] text-indigo-600 font-medium">
                              Add here
                            </div>
                          </div>
                        </button>
                      </div>
                    );
                  })}
                  </div>
                )}
              </div>
            </div>
          );
          })}

          {/* Road sector to end */}
          {stopGroups.length > 0 && endGroup && endSectorType === "itinerary" && (
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <button
                type="button"
                onClick={() => toggleSection(`road-${routeStops.length - 1}`)}
                className="w-full px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between hover:bg-slate-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Car className="w-3 h-3 text-slate-600" />
                  <div className="text-xs font-semibold text-slate-800">
                    {stopGroups[stopGroups.length - 1].stopName} to {endGroup.stopName}
                  </div>
                </div>
                <ChevronDown
                  className={[
                    "w-4 h-4 text-slate-600 transition-transform duration-200",
                    expandedSections.has(`road-${routeStops.length - 1}`) ? "rotate-0" : "-rotate-90",
                  ].join(" ")}
                />
              </button>
              {expandedSections.has(`road-${routeStops.length - 1}`) && (
                <div className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    handleAddToRoadSector(routeStops.length - 1);
                  }}
                  className="w-full text-left rounded-lg border-2 border-indigo-200 bg-indigo-50 hover:bg-indigo-100 p-3 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-slate-900">
                        Road trip
                      </div>
                      <div className="text-[10px] text-slate-600 mt-0.5">
                        {formatShortRangeDate(
                          getRoadSectorDate(stopGroups[stopGroups.length - 1].stopIndex, routeStops.length - 1)
                        )}
                      </div>
                    </div>
                    <div className="text-[10px] text-indigo-600 font-medium">
                      Add here
                    </div>
                  </div>
                </button>
                </div>
              )}
            </div>
          )}


          {/* End road sector */}
          {(endGroup || (routeStops.length >= 2 && endSectorType === "road")) && endSectorType === "road" && (
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <button
                type="button"
                onClick={() => toggleSection("road-end")}
                className="w-full px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between hover:bg-slate-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Car className="w-3 h-3 text-slate-600" />
                  <div className="text-xs font-semibold text-slate-800">
                    {routeStops.length > 1
                      ? `${routeStops[routeStops.length - 2]} to ${endGroup?.stopName ?? routeStops[routeStops.length - 1] ?? ""}`
                      : endGroup?.stopName ?? routeStops[routeStops.length - 1] ?? ""}
                  </div>
                </div>
                <ChevronDown
                  className={[
                    "w-4 h-4 text-slate-600 transition-transform duration-200",
                    expandedSections.has("road-end") ? "rotate-0" : "-rotate-90",
                  ].join(" ")}
                />
              </button>
              {expandedSections.has("road-end") && (
                <div className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      handleAddToRoadSector(routeStops.length - 1);
                    }}
                    className="w-full text-left rounded-lg border-2 border-indigo-200 bg-indigo-50 hover:bg-indigo-100 p-3 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-slate-900">
                          Road trip
                        </div>
                        <div className="text-[10px] text-slate-600 mt-0.5">
                          {formatShortRangeDate(getRoadSectorDate(
                            routeStops.length > 1 ? routeStops.length - 2 : 0,
                            routeStops.length - 1
                          ))}
                        </div>
                      </div>
                      <div className="text-[10px] text-indigo-600 font-medium">
                        Add here
                      </div>
                    </div>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* End itinerary sector */}
          {endGroup && endSectorType === "itinerary" && (
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <button
                type="button"
                onClick={() => toggleSection(`stop-${routeStops.length - 1}`)}
                className="w-full px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between hover:bg-slate-100 transition-colors"
              >
                <div className="text-xs font-semibold text-slate-800">
                  {endGroup.stopName}
                </div>
                <ChevronDown
                  className={[
                    "w-4 h-4 text-slate-600 transition-transform duration-200",
                    expandedSections.has(`stop-${routeStops.length - 1}`) ? "rotate-0" : "-rotate-90",
                  ].join(" ")}
                />
              </button>
              {expandedSections.has(`stop-${routeStops.length - 1}`) && (
                <div className="px-3 py-2 space-y-2">
                {endGroup.dayIndices.map((dayIdx) => {
                  const d = plan.days[dayIdx];
                  const key = makeDayKey(d.date, d.location);
                  const detail = dayDetails[key];
                  const isDayOpen = detail?.isOpen ?? false;
                  return (
                    <div key={`day-${d.dayNumber}-${key}`}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          handleAddToDay(d.date, d.location);
                        }}
                        className="w-full text-left rounded-lg border-2 border-indigo-200 bg-indigo-50 hover:bg-indigo-100 p-3 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-slate-900">
                              Day {d.dayNumber}
                            </div>
                            <div className="text-[10px] text-slate-600 mt-0.5">
                              {formatDisplayDate(d.date)}
                            </div>
                          </div>
                          <div className="text-[10px] text-indigo-600 font-medium">
                            Add here
                          </div>
                        </div>
                      </button>
                    </div>
                  );
                })}
                </div>
              )}
            </div>
          )}

          {/* Ensure end sector always shows if routeStops has at least 2 stops */}
          {!endGroup && routeStops.length >= 2 && (
            <>
              {/* End road sector fallback */}
              {endSectorType === "road" && (
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleSection("road-end")}
                    className="w-full px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Car className="w-3 h-3 text-slate-600" />
                      <div className="text-xs font-semibold text-slate-800">
                        {routeStops.length > 1
                          ? `${routeStops[routeStops.length - 2]} to ${routeStops[routeStops.length - 1]}`
                          : routeStops[routeStops.length - 1]}
                      </div>
                    </div>
                    <ChevronDown
                      className={[
                        "w-4 h-4 text-slate-600 transition-transform duration-200",
                        expandedSections.has("road-end") ? "rotate-0" : "-rotate-90",
                      ].join(" ")}
                    />
                  </button>
                  {expandedSections.has("road-end") && (
                    <div className="px-3 py-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddToRoadSector(routeStops.length - 1);
                        }}
                        className="w-full text-left rounded-lg border-2 border-indigo-200 bg-indigo-50 hover:bg-indigo-100 p-3 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-slate-900">
                              Road trip
                            </div>
                            <div className="text-[10px] text-slate-600 mt-0.5">
                              {formatShortRangeDate(getRoadSectorDate(
                                routeStops.length > 1 ? routeStops.length - 2 : 0,
                                routeStops.length - 1
                              ))}
                            </div>
                          </div>
                          <div className="text-[10px] text-indigo-600 font-medium">
                            Add here
                          </div>
                        </div>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* End itinerary sector fallback */}
              {endSectorType === "itinerary" && (
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleSection(`stop-${routeStops.length - 1}`)}
                    className="w-full px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between hover:bg-slate-100 transition-colors"
                  >
                    <div className="text-xs font-semibold text-slate-800">
                      {routeStops[routeStops.length - 1]}
                    </div>
                    <ChevronDown
                      className={[
                        "w-4 h-4 text-slate-600 transition-transform duration-200",
                        expandedSections.has(`stop-${routeStops.length - 1}`) ? "rotate-0" : "-rotate-90",
                      ].join(" ")}
                    />
                  </button>
                  {expandedSections.has(`stop-${routeStops.length - 1}`) && (
                    <div className="px-3 py-2 space-y-2">
                      <div className="text-xs text-slate-500 text-center py-2">
                        No days available for this location
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
