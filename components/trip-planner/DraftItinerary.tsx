"use client";

import { useMemo, type CSSProperties } from "react";
import { ChevronDown, GripVertical } from "lucide-react";
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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { NZ_CITIES } from "@/lib/nzCities";
import type { TripPlan } from "@/lib/itinerary";
import {
  formatShortRangeDate,
  makeDayKey,
  type DayDetail,
  type DayStopMeta,
} from "@/lib/trip-planner/utils";
import DayCard from "@/components/trip-planner/DayCard";

type Props = {
  plan: TripPlan;
  routeStops: string[];
  nightsPerStop: number[];
  dayStopMeta: DayStopMeta[];
  dayDetails: Record<string, DayDetail>;

  addingStopAfterIndex: number | null;
  newStopCityId: string | null;
  setNewStopCityId: (v: string) => void;

  openStops: Record<number, boolean>;
  onToggleStopOpen: (stopIndex: number) => void;
  onExpandAllStops: () => void;
  onCollapseAllStops: () => void;

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

  onReorderStops: (fromIndex: number, toIndex: number) => void;
};

type StopGroup = {
  stopIndex: number;
  stopName: string;
  dayIndices: number[];
  startDate: string;
  endDate: string;
};

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
  onStartAddStop,
  onConfirmAddStop,
  onCancelAddStop,
  onRemoveStop,
  onReorderStops,
}: Props) {
  const stopGroups = useMemo<StopGroup[]>(() => {
    if (!plan || plan.days.length === 0) return [];

    const groups: StopGroup[] = [];
    const seen = new Set<number>();

    for (let i = 0; i < plan.days.length; i++) {
      const meta = dayStopMeta[i];
      if (!meta) continue;

      const idx = meta.stopIndex;
      if (seen.has(idx)) continue;
      seen.add(idx);

      const dayIndices: number[] = [];
      for (let j = 0; j < plan.days.length; j++) {
        if (dayStopMeta[j]?.stopIndex === idx) dayIndices.push(j);
      }

      const stopName = plan.days[dayIndices[0]]?.location ?? "";
      const startDate = plan.days[dayIndices[0]]?.date ?? "";
      const endDate = plan.days[dayIndices[dayIndices.length - 1]]?.date ?? "";

      groups.push({ stopIndex: idx, stopName, dayIndices, startDate, endDate });
    }

    groups.sort((a, b) => a.stopIndex - b.stopIndex);
    return groups;
  }, [plan, dayStopMeta]);

  // stable id per stop
  const sortableIds = useMemo(
    () => stopGroups.map((g) => `${g.stopName}::${g.stopIndex}`),
    [stopGroups]
  );

  const idToStopIndex = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of stopGroups) m.set(`${g.stopName}::${g.stopIndex}`, g.stopIndex);
    return m;
  }, [stopGroups]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } })
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    if (active.id === over.id) return;

    const from = idToStopIndex.get(String(active.id));
    const to = idToStopIndex.get(String(over.id));
    if (from == null || to == null) return;

    onReorderStops(from, to);
  }

  return (
    <div className="card p-4 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Draft itinerary</h2>
          <p className="text-sm text-gray-400">
            Drag stops to reorder your trip. Tap a stop to expand/collapse its days.
          </p>
        </div>

        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={onExpandAllStops}
            className="px-3 py-1.5 rounded-full border border-white/15 text-xs hover:bg-white/10"
          >
            Expand all
          </button>
          <button
            type="button"
            onClick={onCollapseAllStops}
            className="px-3 py-1.5 rounded-full border border-white/15 text-xs hover:bg-white/10"
          >
            Collapse all
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={sortableIds}
            strategy={verticalListSortingStrategy}
          >
            {stopGroups.map((g) => {
              const id = `${g.stopName}::${g.stopIndex}`;
              const isDragDisabled =
                g.stopIndex === 0 || g.stopIndex === routeStops.length - 1;

              return (
                <StopGroupItem
                  key={id}
                  id={id}
                  group={g}
                  plan={plan}
                  routeStops={routeStops}
                  nightsPerStop={nightsPerStop}
                  dayDetails={dayDetails}
                  openStops={openStops}
                  addingStopAfterIndex={addingStopAfterIndex}
                  newStopCityId={newStopCityId}
                  setNewStopCityId={setNewStopCityId}
                  isDragDisabled={isDragDisabled}
                  onToggleStopOpen={onToggleStopOpen}
                  onChangeNights={onChangeNights}
                  onToggleDayOpen={onToggleDayOpen}
                  onUpdateDayNotes={onUpdateDayNotes}
                  onUpdateDayAccommodation={onUpdateDayAccommodation}
                  onStartAddStop={onStartAddStop}
                  onConfirmAddStop={onConfirmAddStop}
                  onCancelAddStop={onCancelAddStop}
                  onRemoveStop={onRemoveStop}
                />
              );
            })}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}

function StopGroupItem({
  id,
  group: g,
  plan,
  routeStops,
  nightsPerStop,
  dayDetails,
  openStops,
  addingStopAfterIndex,
  newStopCityId,
  setNewStopCityId,
  isDragDisabled,
  onToggleStopOpen,
  onChangeNights,
  onToggleDayOpen,
  onUpdateDayNotes,
  onUpdateDayAccommodation,
  onStartAddStop,
  onConfirmAddStop,
  onCancelAddStop,
  onRemoveStop,
}: {
  id: string;
  group: StopGroup;
  plan: TripPlan;
  routeStops: string[];
  nightsPerStop: number[];
  dayDetails: Record<string, DayDetail>;
  openStops: Record<number, boolean>;
  addingStopAfterIndex: number | null;
  newStopCityId: string | null;
  setNewStopCityId: (v: string) => void;
  isDragDisabled: boolean;

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
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id,
      disabled: isDragDisabled,
    });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isStopOpen = openStops[g.stopIndex] ?? false;
  const dayCount = g.dayIndices.length;
  const nightsHere = nightsPerStop[g.stopIndex] ?? 1;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-2xl border border-white/10 bg-white/5 overflow-hidden ${
        isDragging ? "opacity-80" : ""
      }`}
    >
      <div className="px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {!isDragDisabled && (
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              className="p-2 -ml-2 rounded-full border border-white/15 text-gray-300 hover:bg-white/10 active:bg-white/15 touch-none cursor-grab"
              aria-label="Reorder stop"
              {...listeners}
              {...attributes}
            >
              <GripVertical className="h-4 w-4" />
            </button>
          )}

          <button
            type="button"
            onClick={() => onToggleStopOpen(g.stopIndex)}
            className="flex items-center gap-3 min-w-0 group"
          >
            <ChevronDown
              className={`h-4 w-4 text-gray-400 transition-transform ${
                isStopOpen ? "rotate-180" : ""
              }`}
            />
            <div className="min-w-0 text-left">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold truncate">{g.stopName}</span>
                <span className="text-xs text-gray-400">
                  {formatShortRangeDate(g.startDate, g.endDate)} • {dayCount} day
                  {dayCount === 1 ? "" : "s"}
                </span>
              </div>
            </div>
          </button>
        </div>

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

      {isStopOpen && (
        <div className="border-t border-white/10">
          <div className="p-3 md:p-4 space-y-3">
            {g.dayIndices.map((dayIdx, localIdx) => {
              const d = plan.days[dayIdx];
              const key = makeDayKey(d.date, d.location);

              const detail = dayDetails[key];
              const isOpen = detail?.isOpen ?? false;
              const isFirstForStop = localIdx === 0;

              const stopOptions = isFirstForStop ? (
                <div>
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
                  </div>

                  {addingStopAfterIndex === g.stopIndex && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <select
                        value={newStopCityId ?? ""}
                        onChange={(e) => setNewStopCityId(e.target.value)}
                        className="input-dark text-sm py-2 px-3"
                      >
                        {NZ_CITIES.filter(
                          (c) => c.name !== routeStops[g.stopIndex]
                        ).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={onConfirmAddStop}
                        className="btn btn-accent text-sm px-4 py-2"
                      >
                        Add
                      </button>

                      <button
                        type="button"
                        onClick={onCancelAddStop}
                        className="btn btn-ghost text-sm px-4 py-2"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              ) : undefined;

              return (
                <DayCard
                  key={`day-${d.dayNumber}-${key}`}
                  day={d}
                  stopName={g.stopName}
                  isFirstForStop={isFirstForStop}
                  isOpen={isOpen}
                  detail={detail}
                  onToggleOpen={() => onToggleDayOpen(d.date, d.location)}
                  onUpdateNotes={(notes) =>
                    onUpdateDayNotes(d.date, d.location, notes)
                  }
                  onUpdateAccommodation={(accommodation) =>
                    onUpdateDayAccommodation(d.date, d.location, accommodation)
                  }
                  stopOptions={stopOptions}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
