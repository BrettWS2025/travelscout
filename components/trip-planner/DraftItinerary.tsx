"use client";

import { useMemo } from "react";
import type { TripPlan } from "@/lib/itinerary";
import type { DayDetail, DayStopMeta, RoadSectorDetail } from "@/lib/trip-planner/utils";
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
  roadSectorDetails,
  onToggleRoadSectorOpen,
  onUpdateRoadSectorActivities,
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
}: Props) {
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
    <div className="card p-4 md:p-6 space-y-4" style={{ borderColor: "rgba(148, 163, 184, 0.3)" }}>
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 md:gap-4">
        <div>
          <h2 className="text-lg font-semibold">Your Itinerary</h2>
          <p className="text-sm text-slate-600 mt-1">
            Expand a location to see its days. Drag the grip to reorder stops.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onExpandAllStops}
            className="px-3 py-1.5 rounded-full border border-slate-200 text-xs hover:bg-slate-50 active:bg-slate-100 transition text-slate-700"
          >
            Expand all
          </button>
          <button
            type="button"
            onClick={onCollapseAllStops}
            className="px-3 py-1.5 rounded-full border border-slate-200 text-xs hover:bg-slate-50 active:bg-slate-100 transition text-slate-700"
          >
            Collapse all
          </button>
        </div>
      </div>

      <div className="space-y-3">
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

          return (
            <>
              {/* Start sector */}
              {startGroup && (
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
                  onChangeNights={onChangeNights}
                  onToggleDayOpen={onToggleDayOpen}
                  onUpdateDayNotes={onUpdateDayNotes}
                  onUpdateDayAccommodation={onUpdateDayAccommodation}
                  onConvertToItinerary={onConvertStartToItinerary}
                  onConvertToRoad={onConvertStartToRoad}
                  roadSectorDetails={roadSectorDetails}
                  onToggleRoadSectorOpen={onToggleRoadSectorOpen}
                  onUpdateRoadSectorActivities={onUpdateRoadSectorActivities}
                  onStartAddStop={onStartAddStop}
                  onConfirmAddStop={onConfirmAddStop}
                  onCancelAddStop={onCancelAddStop}
                />
              )}

              {/* Road sector from start to first middle stop - only show if start is itinerary sector */}
              {startGroup && stopGroups.length > 0 && startSectorType === "itinerary" && (
                <RoadSectorCard
                  fromStopIndex={0}
                  toStopIndex={stopGroups[0].stopIndex}
                  fromStopName={startGroup.stopName}
                  toStopName={stopGroups[0].stopName}
                  isOpen={roadSectorDetails[stopGroups[0].stopIndex]?.isOpen ?? false}
                  activities={roadSectorDetails[stopGroups[0].stopIndex]?.activities ?? ""}
                  onToggleOpen={() => onToggleRoadSectorOpen(stopGroups[0].stopIndex)}
                  onUpdateActivities={(activities) => onUpdateRoadSectorActivities(stopGroups[0].stopIndex, activities)}
                />
              )}

              {/* Road sector from start to end when both are itinerary sectors and no middle stops */}
              {startGroup && endGroup && stopGroups.length === 0 && startSectorType === "itinerary" && endSectorType === "itinerary" && (
                <RoadSectorCard
                  fromStopIndex={0}
                  toStopIndex={routeStops.length - 1}
                  fromStopName={startGroup.stopName}
                  toStopName={endGroup.stopName}
                  isOpen={roadSectorDetails[routeStops.length - 1]?.isOpen ?? false}
                  activities={roadSectorDetails[routeStops.length - 1]?.activities ?? ""}
                  onToggleOpen={() => onToggleRoadSectorOpen(routeStops.length - 1)}
                  onUpdateActivities={(activities) => onUpdateRoadSectorActivities(routeStops.length - 1, activities)}
                />
              )}

              {/* Middle stops */}
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={stopGroups.map((g) => g.stopIndex)} strategy={verticalListSortingStrategy}>
                  {stopGroups.map((g, idx) => (
                    <StopGroupWithRoadSector
                      key={`stop-wrapper-${g.stopIndex}`}
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
                    />
                  ))}
                </SortableContext>
              </DndContext>

              {/* Road sector from last middle stop to end - only show if end is itinerary sector */}
              {stopGroups.length > 0 && endGroup && endSectorType === "itinerary" && (
                <RoadSectorCard
                  fromStopIndex={stopGroups[stopGroups.length - 1].stopIndex}
                  toStopIndex={routeStops.length - 1}
                  fromStopName={stopGroups[stopGroups.length - 1].stopName}
                  toStopName={endGroup.stopName}
                  isOpen={roadSectorDetails[routeStops.length - 1]?.isOpen ?? false}
                  activities={roadSectorDetails[routeStops.length - 1]?.activities ?? ""}
                  onToggleOpen={() => onToggleRoadSectorOpen(routeStops.length - 1)}
                  onUpdateActivities={(activities) => onUpdateRoadSectorActivities(routeStops.length - 1, activities)}
                />
              )}

              {/* End sector */}
              {endGroup && (
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
                  onChangeNights={onChangeNights}
                  onToggleDayOpen={onToggleDayOpen}
                  onUpdateDayNotes={onUpdateDayNotes}
                  onUpdateDayAccommodation={onUpdateDayAccommodation}
                  onConvertToItinerary={onConvertEndToItinerary}
                  onConvertToRoad={onConvertEndToRoad}
                  roadSectorDetails={roadSectorDetails}
                  onToggleRoadSectorOpen={onToggleRoadSectorOpen}
                  onUpdateRoadSectorActivities={onUpdateRoadSectorActivities}
                  onStartAddStop={onStartAddStop}
                  onConfirmAddStop={onConfirmAddStop}
                  onCancelAddStop={onCancelAddStop}
                />
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
}
