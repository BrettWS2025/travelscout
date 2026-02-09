"use client";

import { type CSSProperties } from "react";
import type { TripPlan } from "@/lib/itinerary";
import type { DayDetail, DayStopMeta, RoadSectorDetail } from "@/lib/trip-planner/utils";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import RoadSectorCard from "@/components/trip-planner/RoadSectorCard";
import StopGroupCard from "@/components/trip-planner/StopGroupCard";
import type { Group } from "@/components/trip-planner/DraftItinerary.types";

type StopGroupWithRoadSectorProps = {
  group: Group;
  idx: number;
  stopGroups: Group[];
  routeStops: string[];
  nightsPerStop: number[];
  plan: TripPlan;
  dayDetails: Record<string, DayDetail>;
  dayStopMeta: DayStopMeta[];
  roadSectorDetails: Record<number, RoadSectorDetail>;
  openStops: Record<number, boolean>;
  addingStopAfterIndex: number | null;
  newStopCityId: string | null;
  setNewStopCityId: (v: string) => void;
  onToggleStopOpen: (stopIndex: number) => void;
  onChangeNights: (stopIndex: number, newValue: number) => void;
  onToggleDayOpen: (date: string, location: string) => void;
  onUpdateDayNotes: (date: string, location: string, notes: string) => void;
  onUpdateDayAccommodation: (date: string, location: string, accommodation: string) => void;
  onRemoveExperienceFromDay?: (date: string, location: string, experienceId: string) => void;
  onToggleRoadSectorOpen: (destinationStopIndex: number) => void;
  onUpdateRoadSectorActivities: (destinationStopIndex: number, activities: string) => void;
  onRemoveExperienceFromRoadSector?: (destinationStopIndex: number, experienceId: string) => void;
  onStartAddStop: (stopIndex: number) => void;
  onConfirmAddStop: () => void;
  onCancelAddStop: () => void;
  onRemoveStop: (stopIndex: number) => void;
  onAddToItinerary?: (experience: import("@/lib/walkingExperiences").WalkingExperience, location: string) => void;
};

export default function StopGroupWithRoadSector({
  group,
  idx,
  stopGroups,
  routeStops,
  nightsPerStop,
  plan,
  dayDetails,
  dayStopMeta,
  roadSectorDetails,
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
  onToggleRoadSectorOpen,
  onUpdateRoadSectorActivities,
  onRemoveExperienceFromRoadSector,
  onStartAddStop,
  onConfirmAddStop,
  onCancelAddStop,
  onRemoveStop,
  onAddToItinerary,
}: StopGroupWithRoadSectorProps) {
  const isDragDisabled = group.stopIndex === 0 || group.stopIndex === routeStops.length - 1;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: group.stopIndex,
    disabled: isDragDisabled,
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Render road sector before each stop (except the first one)
  const showRoadSector = idx > 0;
  const fromStopIndex = showRoadSector ? stopGroups[idx - 1].stopIndex : -1;
  const fromStopName = showRoadSector ? routeStops[fromStopIndex] : "";
  const roadSectorDetail = showRoadSector ? roadSectorDetails[group.stopIndex] : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        "space-y-3",
        isDragging ? "opacity-80" : "",
      ].join(" ")}
    >
      {showRoadSector && (
        <RoadSectorCard
          fromStopIndex={fromStopIndex}
          toStopIndex={group.stopIndex}
          fromStopName={fromStopName}
          toStopName={group.stopName}
          isOpen={roadSectorDetail?.isOpen ?? false}
          activities={roadSectorDetail?.activities ?? ""}
          experiences={roadSectorDetail?.experiences}
          plan={plan}
          nightsPerStop={nightsPerStop}
          startDate={plan?.days[0]?.date ?? ""}
          dayStopMeta={dayStopMeta}
          routeStops={routeStops}
          onToggleOpen={() => onToggleRoadSectorOpen(group.stopIndex)}
          onUpdateActivities={(activities) => onUpdateRoadSectorActivities(group.stopIndex, activities)}
          onRemoveExperience={onRemoveExperienceFromRoadSector ? (experienceId) => onRemoveExperienceFromRoadSector(group.stopIndex, experienceId) : undefined}
          onAddToItinerary={onAddToItinerary}
        />
      )}
      <StopGroupCard
        group={group}
        routeStops={routeStops}
        nightsPerStop={nightsPerStop}
        plan={plan}
        dayDetails={dayDetails}
        dayStopMeta={dayStopMeta}
        openStops={openStops}
        addingStopAfterIndex={addingStopAfterIndex}
        newStopCityId={newStopCityId}
        setNewStopCityId={setNewStopCityId}
        onToggleStopOpen={onToggleStopOpen}
        onChangeNights={onChangeNights}
        onToggleDayOpen={onToggleDayOpen}
        onUpdateDayNotes={onUpdateDayNotes}
        onUpdateDayAccommodation={onUpdateDayAccommodation}
        onRemoveExperienceFromDay={onRemoveExperienceFromDay}
        onStartAddStop={onStartAddStop}
        onConfirmAddStop={onConfirmAddStop}
        onCancelAddStop={onCancelAddStop}
        onRemoveStop={onRemoveStop}
        dragAttributes={attributes}
        dragListeners={listeners}
        isDragDisabled={isDragDisabled}
        onAddToItinerary={onAddToItinerary}
      />
    </div>
  );
}
