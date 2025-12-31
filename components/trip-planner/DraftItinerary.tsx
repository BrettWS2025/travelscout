"use client";

import { useMemo, type CSSProperties } from "react";
import { ChevronDown, GripVertical } from "lucide-react";
import { NZ_CITIES } from "@/lib/nzCities";
import type { TripPlan } from "@/lib/itinerary";
import {
  formatShortRangeDate,
  makeDayKey,
  type DayDetail,
  type DayStopMeta,
} from "@/lib/trip-planner/utils";
import DayCard from "@/components/trip-planner/DayCard";

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

  // ✅ new
  onReorderStops: (fromIndex: number, toIndex: number) => void;
};

type Group = {
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
  const stopGroups = useMemo(() => {
    if (!plan || plan.days.length === 0) return [];

    const groups: Group[] = [];
    const seen = new Set<number>();

    for (let i = 0; i < plan.days.length; i++) {
      const meta = dayStopMeta[i];
      const stopIndex = meta?.stopIndex ?? -1;
      if (stopIndex < 0) continue;
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
    <div className="card p-4 md:p-6 space-y-4">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 md:gap-4">
        <div>
          <h2 className="text-lg font-semibold">Your draft itinerary</h2>
          <p className="text-sm text-gray-400 mt-1">
            Expand a location to see its days. Drag the grip to reorder stops.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onExpandAllStops}
            className="px-3 py-1.5 rounded-full border border-white/15 text-xs hover:bg-white/10 active:bg-white/15 transition"
          >
            Expand all
          </button>
          <button
            type="button"
            onClick={onCollapseAllStops}
            className="px-3 py-1.5 rounded-full border border-white/15 text-xs hover:bg-white/10 active:bg-white/15 transition"
          >
            Collapse all
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={stopGroups.map((g) => g.stopIndex)} strategy={verticalListSortingStrategy}>
            {stopGroups.map((g) => (
              <StopGroupCard
                key={`stop-${g.stopIndex}-${g.stopName}`}
                group={g}
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
                onStartAddStop={onStartAddStop}
                onConfirmAddStop={onConfirmAddStop}
                onCancelAddStop={onCancelAddStop}
                onRemoveStop={onRemoveStop}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}

function StopGroupCard({
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
}: {
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
}) {
  const isStopOpen = openStops[g.stopIndex] ?? false;
  const dayCount = g.dayIndices.length;
  const nightsHere = nightsPerStop[g.stopIndex] ?? 1;

  const isDragDisabled = g.stopIndex === 0 || g.stopIndex === routeStops.length - 1;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: g.stopIndex,
    disabled: isDragDisabled,
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        "rounded-2xl border border-white/10 bg-white/5 overflow-hidden",
        isDragging ? "opacity-80" : "",
      ].join(" ")}
    >
      {/* Stop header */}
      <div className="px-3 md:px-4 py-3">
        {/* Mobile: Stack layout */}
        <div className="md:hidden space-y-3">
          <div className="flex items-center gap-2 min-w-0">
            {!isDragDisabled && (
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="p-1.5 -ml-1 rounded-full border border-white/15 text-gray-300 hover:bg-white/10 active:bg-white/15 touch-none cursor-grab"
                aria-label="Reorder stop"
                {...listeners}
                {...attributes}
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
                  "border border-white/10 bg-white/5 group-hover:bg-white/10 transition",
                ].join(" ")}
                aria-hidden
              >
                <ChevronDown
                  className={[
                    "w-3.5 h-3.5 opacity-80 transition-transform duration-200",
                    isStopOpen ? "rotate-0" : "-rotate-90",
                  ].join(" ")}
                />
              </span>

              <div className="min-w-0 flex-1">
                <div className="text-base font-semibold text-white break-words">{g.stopName}</div>
                <div className="text-[11px] text-gray-300 mt-0.5">
                  {formatShortRangeDate(g.startDate)} – {formatShortRangeDate(g.endDate)} · {dayCount} day
                  {dayCount === 1 ? "" : "s"}
                </div>
              </div>
            </button>
          </div>

          {/* Nights stepper for mobile */}
          <div className="flex items-center gap-2 pl-9">
            <span className="text-[11px] text-gray-400">Nights:</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onChangeNights(g.stopIndex, nightsHere - 1)}
                className="w-8 h-8 rounded-lg border border-white/20 text-sm hover:bg-white/10 active:bg-white/15 flex items-center justify-center"
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
                className="w-8 h-8 rounded-lg border border-white/20 text-sm hover:bg-white/10 active:bg-white/15 flex items-center justify-center"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Desktop: Horizontal layout */}
        <div className="hidden md:flex items-center justify-between gap-3">
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
                  "border border-white/10 bg-white/5 group-hover:bg-white/10 transition",
                ].join(" ")}
                aria-hidden
              >
                <ChevronDown
                  className={[
                    "w-4 h-4 opacity-80 transition-transform duration-200",
                    isStopOpen ? "rotate-0" : "-rotate-90",
                  ].join(" ")}
                />
              </span>

              <div className="min-w-0">
                <div className="text-sm font-semibold text-white truncate">{g.stopName}</div>
                <div className="text-[11px] text-gray-300 truncate">
                  {formatShortRangeDate(g.startDate)} – {formatShortRangeDate(g.endDate)} · {dayCount} day
                  {dayCount === 1 ? "" : "s"}
                </div>
              </div>
            </button>
          </div>

          {/* Nights stepper for desktop */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-400 mr-1">Nights</span>
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
                onChange={(e) => onChangeNights(g.stopIndex, Number(e.target.value))}
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
            <div className="pl-2 md:pl-3 border-l border-white/10 space-y-2">
              {g.dayIndices.map((dayIdx, localIdx) => {
                const d = plan.days[dayIdx];
                const key = makeDayKey(d.date, d.location);
                const detail = dayDetails[key];
                const isOpen = detail?.isOpen ?? false;

                const isFirstForStop = localIdx === 0;

                const stopOptions =
                  isFirstForStop ? (
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
                            className="input-dark text-xs w-56"
                          >
                            {NZ_CITIES.map((city) => (
                              <option key={city.id} value={city.id}>
                                {city.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={onConfirmAddStop}
                            className="rounded-full px-3 py-1.5 text-[11px] font-medium bg-[var(--accent)] text-slate-900 hover:brightness-110"
                          >
                            Add stop
                          </button>
                          <button
                            type="button"
                            onClick={onCancelAddStop}
                            className="text-[11px] text-gray-300 hover:underline underline-offset-2"
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
                    onUpdateNotes={(notes) => onUpdateDayNotes(d.date, d.location, notes)}
                    onUpdateAccommodation={(accommodation) =>
                      onUpdateDayAccommodation(d.date, d.location, accommodation)
                    }
                    stopOptions={stopOptions}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
