"use client";

import { useMemo } from "react";
import type { TripPlan } from "@/lib/itinerary";
import type { DayDetail, DayStopMeta, RoadSectorDetail } from "@/lib/trip-planner/utils";
import { usePrefetchThingsToDo } from "@/lib/hooks/usePrefetchThingsToDo";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import StartEndSectorCard from "@/components/trip-planner/StartEndSectorCard";
import RoadSectorCard from "@/components/trip-planner/RoadSectorCard";
import StopGroupWithRoadSector from "@/components/trip-planner/StopGroupWithRoadSector";
import type { DraftItineraryProps, Group } from "@/components/trip-planner/DraftItinerary.types";

type Props = DraftItineraryProps;

export default function DraftItinerary({
  plan,
  routeStops,
  nightsPerStop,
  dayStopMeta,
  dayDetails,
  addingStopAfterIndex,
  newStopCityId,
  setNewStopCityId,
  openStops,
  onToggleStopOpen,
  onExpandAllStops,
  onCollapseAllStops,
  onChangeNights,
  onToggleDayOpen,
  onUpdateDayNotes,
  onUpdateDayAccommodation,
  onRemoveExperienceFromDay,
  roadSectorDetails,
  onToggleRoadSectorOpen,
  onUpdateRoadSectorActivities,
  onRemoveExperienceFromRoadSector,
  startSectorType,
  endSectorType,
  onConvertStartToItinerary,
  onConvertStartToRoad,
  onConvertEndToItinerary,
  onConvertEndToRoad,
  onStartAddStop,
  onConfirmAddStop,
  onCancelAddStop,
  onRemoveStop,
  onReorderStops,
  onAddToItinerary,
  endDate,
}: Props) {
  // Prefetch "Things to do" data for all route stops when the itinerary is generated
  // This ensures data is ready immediately when users switch to the "Things to do" tab
  usePrefetchThingsToDo(routeStops);

  const stopGroups = useMemo(() => {
    if (!plan || plan.days.length === 0) return [];

    const groups: Group[] = [];
    const seen = new Set<number>();

    for (let i = 0; i < plan.days.length; i++) {
      const meta = dayStopMeta[i];
      const stopIndex = meta?.stopIndex ?? -1;
      if (stopIndex < 0) continue;
      // Exclude start (0) and end (routeStops.length - 1) - they're rendered separately
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // long-press on touch so scrolling still works
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } })
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    if (active.id === over.id) return;

    const from = Number(active.id);
    const to = Number(over.id);
    if (Number.isNaN(from) || Number.isNaN(to)) return;

    onReorderStops(from, to);
  }

  return (
    <div className="bg-slate-50/50 p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 md:gap-4 mb-6 md:mb-7">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Your Journey</h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onExpandAllStops}
            className="px-3 py-1.5 rounded-full border border-slate-200/50 text-xs hover:bg-white/80 active:bg-white transition-all duration-200 text-slate-600 opacity-80"
          >
            Expand all
          </button>
          <button
            type="button"
            onClick={onCollapseAllStops}
            className="px-3 py-1.5 rounded-full border border-slate-200/50 text-xs hover:bg-white/80 active:bg-white transition-all duration-200 text-slate-600 opacity-80"
          >
            Collapse all
          </button>
        </div>
      </div>

      <div className="relative">
        {/* Helper to get group data for a stop index */}
        {(() => {
          const getGroupForStop = (stopIdx: number): Group | null => {
            if (!plan || plan.days.length === 0) return null;
            
            const indices: number[] = [];
            for (let j = 0; j < plan.days.length; j++) {
              if ((dayStopMeta[j]?.stopIndex ?? -1) === stopIdx) indices.push(j);
            }
            if (indices.length === 0) {
              // No days for this stop, return minimal group
              return {
                stopIndex: stopIdx,
                stopName: routeStops[stopIdx] ?? "",
                dayIndices: [],
                startDate: "",
                endDate: "",
              };
            }

            const first = plan.days[indices[0]];
            const last = plan.days[indices[indices.length - 1]];

            return {
              stopIndex: stopIdx,
              stopName: routeStops[stopIdx] ?? first.location,
              dayIndices: indices,
              startDate: first.date,
              endDate: last.date,
            };
          };

          const startGroup = routeStops.length > 0 ? getGroupForStop(0) : null;
          const endGroup = routeStops.length > 1 ? getGroupForStop(routeStops.length - 1) : null;
          const startNights = routeStops.length > 0 ? (nightsPerStop[0] ?? 0) : 0;
          const endNights = routeStops.length > 1 ? (nightsPerStop[routeStops.length - 1] ?? 0) : 0;

          // Calculate total items for timeline
          const totalItems = [
            startGroup,
            ...(startGroup && stopGroups.length > 0 && startSectorType === "itinerary" ? [null] : []), // road sector
            ...stopGroups.flatMap((g, idx) => [
              g,
              ...(idx < stopGroups.length - 1 || endGroup ? [null] : []), // road sectors between
            ]),
            ...(stopGroups.length > 0 && endGroup && endSectorType === "itinerary" ? [null] : []), // road sector before end
            endGroup,
          ].filter(Boolean);

          // Determine first circle position for timeline line
          // Circle centers: 28px mobile / 32px desktop for itinerary stops, 24px for road sectors
          let lineTop = 0;
          
          if (startGroup) {
            // First item is startGroup (itinerary stop) - use desktop value for line
            lineTop = 32;
          } else if (stopGroups.length > 0 && startSectorType === "itinerary") {
            // First item is a road sector - circle at 24px
            lineTop = 24;
          } else if (stopGroups.length > 0) {
            // First item is first middle stop - use desktop value for line
            lineTop = 32;
          }

          return (
            <div className="relative pl-8 md:pl-10">
              {/* Timeline line - starts at first circle center, ends at last circle center */}
              {lineTop > 0 && (
                <div 
                  className="absolute left-3 md:left-4 w-0.5 bg-slate-200"
                  style={{ 
                    top: `${lineTop}px`,
                    bottom: '32px' // End approximately at last circle center (32px desktop / 28px mobile from bottom)
                  }}
                />
              )}
              
              <div className="space-y-5 md:space-y-7">
              {/* Start sector */}
              {startGroup && (
                <div className="relative">
                  {/* Timeline indicator - centered on card header */}
                  {/* Mobile: py-4 (16px) + content center ~28px = 28px | Desktop: py-4 (16px) + content center ~16px = 32px */}
                  <div className="absolute -left-8 md:-left-10 top-7 md:top-8" style={{ transform: 'translateY(-50%)' }}>
                    <div className="w-6 h-6 rounded-full bg-white border-2 border-slate-300/80 flex items-center justify-center shadow-sm">
                      <div className="w-2 h-2 rounded-full bg-slate-400" />
                    </div>
                  </div>
                  <StartEndSectorCard
                  stopIndex={0}
                  stopName={startGroup.stopName}
                  sectorType={startSectorType}
                  nightsHere={startNights}
                  isOpen={openStops[0] ?? false}
                  dayIndices={startGroup.dayIndices}
                  plan={plan}
                  dayDetails={dayDetails}
                  dayStopMeta={dayStopMeta}
                  routeStops={routeStops}
                  nightsPerStop={nightsPerStop}
                  addingStopAfterIndex={addingStopAfterIndex}
                  newStopCityId={newStopCityId}
                  setNewStopCityId={setNewStopCityId}
                  onToggleOpen={() => onToggleStopOpen(0)}
                  endDate={endDate}
                  onChangeNights={onChangeNights}
                  onToggleDayOpen={onToggleDayOpen}
                  onUpdateDayNotes={onUpdateDayNotes}
                  onUpdateDayAccommodation={onUpdateDayAccommodation}
                  onRemoveExperienceFromDay={onRemoveExperienceFromDay}
                  onConvertToItinerary={onConvertStartToItinerary}
                  onConvertToRoad={onConvertStartToRoad}
                  roadSectorDetails={roadSectorDetails}
                  onToggleRoadSectorOpen={onToggleRoadSectorOpen}
                  onUpdateRoadSectorActivities={onUpdateRoadSectorActivities}
                  onRemoveExperienceFromRoadSector={onRemoveExperienceFromRoadSector}
                  onStartAddStop={onStartAddStop}
                  onConfirmAddStop={onConfirmAddStop}
                  onCancelAddStop={onCancelAddStop}
                  onAddToItinerary={onAddToItinerary}
                />
                </div>
              )}

              {/* Road sector from start to first middle stop - only show if start is itinerary sector */}
              {startGroup && stopGroups.length > 0 && startSectorType === "itinerary" && (
                <div className="relative">
                  {/* Timeline indicator for road - centered on card header (py-3 = 12px, header content ~24px, center at ~24px) */}
                  <div className="absolute -left-8 md:-left-10" style={{ top: '24px', transform: 'translateY(-50%)' }}>
                    <div className="w-6 h-6 rounded-full bg-white border-2 border-slate-300/80 flex items-center justify-center shadow-sm">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                    </div>
                  </div>
                  <RoadSectorCard
                  fromStopIndex={0}
                  toStopIndex={stopGroups[0].stopIndex}
                  fromStopName={startGroup.stopName}
                  toStopName={stopGroups[0].stopName}
                  isOpen={roadSectorDetails[stopGroups[0].stopIndex]?.isOpen ?? false}
                  activities={roadSectorDetails[stopGroups[0].stopIndex]?.activities ?? ""}
                  experiences={roadSectorDetails[stopGroups[0].stopIndex]?.experiences}
                  plan={plan}
                  nightsPerStop={nightsPerStop}
                  startDate={plan?.days[0]?.date ?? ""}
                  dayStopMeta={dayStopMeta}
                  routeStops={routeStops}
                  onToggleOpen={() => onToggleRoadSectorOpen(stopGroups[0].stopIndex)}
                  onUpdateActivities={(activities) => onUpdateRoadSectorActivities(stopGroups[0].stopIndex, activities)}
                  onRemoveExperience={onRemoveExperienceFromRoadSector ? (experienceId) => onRemoveExperienceFromRoadSector(stopGroups[0].stopIndex, experienceId) : undefined}
                  onAddToItinerary={onAddToItinerary}
                  endDate={endDate}
                />
                </div>
              )}

              {/* Road sector from start to end when both are itinerary sectors and no middle stops */}
              {startGroup && endGroup && stopGroups.length === 0 && startSectorType === "itinerary" && endSectorType === "itinerary" && (
                <div className="relative">
                  {/* Timeline indicator for road - centered on card header (py-3 = 12px, header content ~24px, center at ~24px) */}
                  <div className="absolute -left-8 md:-left-10" style={{ top: '24px', transform: 'translateY(-50%)' }}>
                    <div className="w-6 h-6 rounded-full bg-white border-2 border-slate-300/80 flex items-center justify-center shadow-sm">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                    </div>
                  </div>
                  <RoadSectorCard
                  fromStopIndex={0}
                  toStopIndex={routeStops.length - 1}
                  fromStopName={startGroup.stopName}
                  toStopName={endGroup.stopName}
                  isOpen={roadSectorDetails[routeStops.length - 1]?.isOpen ?? false}
                  activities={roadSectorDetails[routeStops.length - 1]?.activities ?? ""}
                  experiences={roadSectorDetails[routeStops.length - 1]?.experiences}
                  plan={plan}
                  nightsPerStop={nightsPerStop}
                  startDate={plan?.days[0]?.date ?? ""}
                  dayStopMeta={dayStopMeta}
                  routeStops={routeStops}
                  onToggleOpen={() => onToggleRoadSectorOpen(routeStops.length - 1)}
                  onUpdateActivities={(activities) => onUpdateRoadSectorActivities(routeStops.length - 1, activities)}
                  onRemoveExperience={onRemoveExperienceFromRoadSector ? (experienceId) => onRemoveExperienceFromRoadSector(routeStops.length - 1, experienceId) : undefined}
                  onAddToItinerary={onAddToItinerary}
                  endDate={endDate}
                />
                </div>
              )}

              {/* Middle stops */}
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={stopGroups.map((g) => g.stopIndex)} strategy={verticalListSortingStrategy}>
                  {stopGroups.map((g, idx) => {
                    // Calculate offset: if there's a road sector above (idx > 0), add road sector height + gap
                    // Road sector: ~56px height (py-3 = 24px padding + ~32px content)
                    // Gap: 12px (space-y-3)
                    // Stop header center: 32px mobile / 36px desktop (adjusted for better centering)
                    const roadSectorOffset = idx > 0 ? 68 : 0; // 56px road sector + 12px gap
                    const stopHeaderCenterMobile = 32;
                    const stopHeaderCenterDesktop = 36;
                    const totalOffsetMobile = roadSectorOffset + stopHeaderCenterMobile;
                    const totalOffsetDesktop = roadSectorOffset + stopHeaderCenterDesktop;
                    
                    return (
                    <div key={`stop-wrapper-${g.stopIndex}`} className="relative">
                      {/* Timeline indicator for stop - centered on card header */}
                      {/* Account for road sector above (if idx > 0): road sector height + gap + stop header center */}
                      {/* Mobile indicator */}
                      <div 
                        className="absolute -left-8 md:hidden" 
                        style={{ 
                          top: `${totalOffsetMobile}px`,
                          transform: 'translateY(-50%)',
                        }}
                      >
                        <div className="w-6 h-6 rounded-full bg-white border-2 border-indigo-400/80 flex items-center justify-center shadow-sm">
                          <div className="w-2 h-2 rounded-full bg-indigo-500" />
                        </div>
                      </div>
                      {/* Desktop indicator */}
                      <div 
                        className="absolute -left-10 hidden md:block" 
                        style={{ 
                          top: `${totalOffsetDesktop}px`,
                          transform: 'translateY(-50%)',
                        }}
                      >
                        <div className="w-6 h-6 rounded-full bg-white border-2 border-indigo-400/80 flex items-center justify-center shadow-sm">
                          <div className="w-2 h-2 rounded-full bg-indigo-500" />
                        </div>
                      </div>
                      <StopGroupWithRoadSector
                      group={g}
                      idx={idx}
                      stopGroups={stopGroups}
                      routeStops={routeStops}
                      nightsPerStop={nightsPerStop}
                      plan={plan}
                      dayDetails={dayDetails}
                      dayStopMeta={dayStopMeta}
                      roadSectorDetails={roadSectorDetails}
                      openStops={openStops}
                      addingStopAfterIndex={addingStopAfterIndex}
                      newStopCityId={newStopCityId}
                      setNewStopCityId={setNewStopCityId}
                      onToggleStopOpen={onToggleStopOpen}
                      onChangeNights={onChangeNights}
                      onToggleDayOpen={onToggleDayOpen}
                      onUpdateDayNotes={onUpdateDayNotes}
                      onUpdateDayAccommodation={onUpdateDayAccommodation}
                      onToggleRoadSectorOpen={onToggleRoadSectorOpen}
                      onUpdateRoadSectorActivities={onUpdateRoadSectorActivities}
                      onStartAddStop={onStartAddStop}
                      onConfirmAddStop={onConfirmAddStop}
                      onCancelAddStop={onCancelAddStop}
                      onRemoveStop={onRemoveStop}
                      onAddToItinerary={onAddToItinerary}
                    />
                    </div>
                    );
                  })}
                </SortableContext>
              </DndContext>

              {/* Road sector from last middle stop to end - only show if end is itinerary sector (not for return trips) */}
              {stopGroups.length > 0 && endGroup && endSectorType === "itinerary" && (
                <div className="relative">
                  {/* Timeline indicator for road - centered on card header (py-3 = 12px, header content ~24px, center at ~24px) */}
                  <div className="absolute -left-8 md:-left-10" style={{ top: '24px', transform: 'translateY(-50%)' }}>
                    <div className="w-6 h-6 rounded-full bg-white border-2 border-slate-300/80 flex items-center justify-center shadow-sm">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                    </div>
                  </div>
                  <RoadSectorCard
                  fromStopIndex={stopGroups[stopGroups.length - 1].stopIndex}
                  toStopIndex={routeStops.length - 1}
                  fromStopName={stopGroups[stopGroups.length - 1].stopName}
                  toStopName={endGroup.stopName}
                  isOpen={roadSectorDetails[routeStops.length - 1]?.isOpen ?? false}
                  activities={roadSectorDetails[routeStops.length - 1]?.activities ?? ""}
                  experiences={roadSectorDetails[routeStops.length - 1]?.experiences}
                  plan={plan}
                  nightsPerStop={nightsPerStop}
                  startDate={plan?.days[0]?.date ?? ""}
                  dayStopMeta={dayStopMeta}
                  routeStops={routeStops}
                  onToggleOpen={() => onToggleRoadSectorOpen(routeStops.length - 1)}
                  onUpdateActivities={(activities) => onUpdateRoadSectorActivities(routeStops.length - 1, activities)}
                  onRemoveExperience={onRemoveExperienceFromRoadSector ? (experienceId) => onRemoveExperienceFromRoadSector(routeStops.length - 1, experienceId) : undefined}
                  onAddToItinerary={onAddToItinerary}
                  endDate={endDate}
                />
                </div>
              )}

              {/* End sector */}
              {endGroup && (
                <div className="relative">
                  {/* Timeline indicator - centered on card header */}
                  {/* Mobile: py-4 (16px) + content center ~28px = 28px | Desktop: py-4 (16px) + content center ~16px = 32px */}
                  <div className="absolute -left-8 md:-left-10 top-7 md:top-8" style={{ transform: 'translateY(-50%)' }}>
                    <div className="w-6 h-6 rounded-full bg-white border-2 border-slate-300/80 flex items-center justify-center shadow-sm">
                      <div className="w-2 h-2 rounded-full bg-slate-400" />
                    </div>
                  </div>
                  <StartEndSectorCard
                  stopIndex={routeStops.length - 1}
                  stopName={endGroup.stopName}
                  sectorType={endSectorType}
                  nightsHere={endNights}
                  isOpen={openStops[routeStops.length - 1] ?? false}
                  dayIndices={endGroup.dayIndices}
                  plan={plan}
                  dayDetails={dayDetails}
                  dayStopMeta={dayStopMeta}
                  routeStops={routeStops}
                  nightsPerStop={nightsPerStop}
                  addingStopAfterIndex={addingStopAfterIndex}
                  newStopCityId={newStopCityId}
                  setNewStopCityId={setNewStopCityId}
                  onToggleOpen={() => onToggleStopOpen(routeStops.length - 1)}
                  endDate={endDate}
                  onChangeNights={onChangeNights}
                  onToggleDayOpen={onToggleDayOpen}
                  onUpdateDayNotes={onUpdateDayNotes}
                  onUpdateDayAccommodation={onUpdateDayAccommodation}
                  onRemoveExperienceFromDay={onRemoveExperienceFromDay}
                  onConvertToItinerary={onConvertEndToItinerary}
                  onConvertToRoad={onConvertEndToRoad}
                  roadSectorDetails={roadSectorDetails}
                  onToggleRoadSectorOpen={onToggleRoadSectorOpen}
                  onUpdateRoadSectorActivities={onUpdateRoadSectorActivities}
                  onRemoveExperienceFromRoadSector={onRemoveExperienceFromRoadSector}
                  onStartAddStop={onStartAddStop}
                  onConfirmAddStop={onConfirmAddStop}
                  onCancelAddStop={onCancelAddStop}
                  onAddToItinerary={onAddToItinerary}
                />
                </div>
              )}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
