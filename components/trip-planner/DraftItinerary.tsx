"use client";

import { useMemo, useState, useRef, useEffect, type CSSProperties } from "react";
import { ChevronDown, GripVertical, Search, MapPin } from "lucide-react";
import { NZ_CITIES, getCityById } from "@/lib/nzCities";
import type { TripPlan } from "@/lib/itinerary";
import {
  formatShortRangeDate,
  makeDayKey,
  normalize,
  type DayDetail,
  type DayStopMeta,
  type CityLite,
  pickSuggestedCities,
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

function CitySearchPill({
  value,
  onSelect,
  onCancel,
  onConfirm,
}: {
  value: string | null;
  onSelect: (cityId: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedCity = value ? getCityById(value) : null;
  const suggested = pickSuggestedCities();

  const searchResults = useMemo(() => {
    const q = normalize(query);
    if (!q) return [];
    return NZ_CITIES.filter((c) => normalize(c.name).includes(q))
      .slice(0, 8)
      .map((c) => ({ id: c.id, name: c.name }));
  }, [query]);

  const showSuggestions = normalize(query).length === 0;
  const filteredSuggested = suggested.filter((c) => c.id !== value);
  const filteredResults = searchResults.filter((c) => c.id !== value);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  function handleSelectCity(cityId: string) {
    onSelect(cityId);
    setIsOpen(false);
    setQuery("");
  }

  // Calculate dropdown position
  const [dropdownStyle, setDropdownStyle] = useState<{ top?: string; left?: string; width?: string }>({});
  
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    function updatePosition() {
      if (!containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      setDropdownStyle({
        top: `${containerRect.bottom + 8}px`,
        left: `${containerRect.left}px`,
        width: `${containerRect.width}px`,
      });
    }

    // Update position initially
    updatePosition();

    // Update position on scroll and resize
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [isOpen]);

  return (
    <>
      <div ref={containerRef} className="relative">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            {!isOpen ? (
              <button
                type="button"
                onClick={() => setIsOpen(true)}
                className={[
                  "w-full rounded-full bg-slate-100 border border-slate-200",
                  "px-3 py-2 md:px-4 md:py-2",
                  "hover:bg-slate-50 transition flex items-center gap-2 text-left",
                ].join(" ")}
              >
                <Search className="w-4 h-4 text-slate-500 shrink-0" />
                <span className={selectedCity ? "text-sm text-slate-800 font-semibold truncate" : "text-sm text-slate-500 truncate"}>
                  {selectedCity ? selectedCity.name : "Search places"}
                </span>
              </button>
            ) : (
              <div className="rounded-full bg-slate-100 border border-slate-200 px-3 py-2 md:px-4 md:py-2 flex items-center gap-2">
                <Search className="w-4 h-4 text-slate-500 shrink-0" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search places"
                  className="w-full bg-transparent outline-none text-sm placeholder:text-slate-400 text-slate-800"
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setIsOpen(false);
                      setQuery("");
                    }
                  }}
                />
              </div>
            )}
          </div>

          {!isOpen && (
            <>
              <button
                type="button"
                onClick={onConfirm}
                disabled={!value}
                className="rounded-full px-3 py-1.5 md:px-4 md:py-2 text-[11px] md:text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Add stop
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="text-[11px] md:text-xs text-slate-600 hover:text-slate-800 hover:underline underline-offset-2"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>

      {isOpen && (
        <div
          ref={dropdownRef}
          className="fixed z-[9999] rounded-2xl bg-white p-3 border border-slate-200 shadow-lg max-h-64 overflow-auto"
          style={dropdownStyle}
        >
          {showSuggestions ? (
            <>
              {filteredSuggested.length > 0 && (
                <div className="mb-2">
                  <div className="text-[11px] text-slate-600 uppercase tracking-wide px-2 mb-1">
                    Suggested places
                  </div>
                  <div className="space-y-1">
                    {filteredSuggested.map((c) => (
                      <button
                        key={`suggested-${c.id}`}
                        type="button"
                        onClick={() => handleSelectCity(c.id)}
                        className="w-full text-left flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-slate-50 transition"
                      >
                        <div className="w-8 h-8 rounded-xl bg-[#F6F1EA] flex items-center justify-center border border-black/5">
                          <MapPin className="w-4 h-4 text-amber-700" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-800 truncate">{c.name}</div>
                          <div className="text-[12px] text-slate-600 truncate">Top destination</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="text-[11px] text-slate-600 uppercase tracking-wide px-2 mb-1">
                Matches
              </div>
              {filteredResults.length === 0 ? (
                <div className="px-2 py-3 text-sm text-slate-600">
                  No matches. Try a different spelling.
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredResults.map((c) => (
                    <button
                      key={`result-${c.id}`}
                      type="button"
                      onClick={() => handleSelectCity(c.id)}
                      className="w-full text-left flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-slate-50 transition"
                    >
                      <div className="w-8 h-8 rounded-xl bg-[#F6F1EA] flex items-center justify-center border border-black/5">
                        <MapPin className="w-4 h-4 text-amber-700" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-800 truncate">{c.name}</div>
                        <div className="text-[12px] text-slate-600 truncate">New Zealand</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
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
        "rounded-2xl border border-slate-200 bg-white overflow-hidden",
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
                className="p-1.5 -ml-1 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 active:bg-slate-100 touch-none cursor-grab"
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
                  "border border-slate-200 bg-slate-50 group-hover:bg-slate-100 transition",
                ].join(" ")}
                aria-hidden
              >
                <ChevronDown
                  className={[
                    "w-3.5 h-3.5 text-slate-600 transition-transform duration-200",
                    isStopOpen ? "rotate-0" : "-rotate-90",
                  ].join(" ")}
                />
              </span>

              <div className="min-w-0 flex-1">
                <div className="text-base font-semibold text-slate-800 break-words">{g.stopName}</div>
                <div className="text-[11px] text-slate-600 mt-0.5">
                  {formatShortRangeDate(g.startDate)} – {formatShortRangeDate(g.endDate)} · {dayCount} day
                  {dayCount === 1 ? "" : "s"}
                </div>
              </div>
            </button>
          </div>

          {/* Nights stepper for mobile */}
          <div className="flex items-center gap-2 pl-9">
            <span className="text-[11px] text-slate-600">Nights:</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onChangeNights(g.stopIndex, nightsHere - 1)}
                className="w-8 h-8 rounded-lg border border-slate-200 text-sm hover:bg-slate-50 active:bg-slate-100 flex items-center justify-center text-slate-700"
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
                className="w-8 h-8 rounded-lg border border-slate-200 text-sm hover:bg-slate-50 active:bg-slate-100 flex items-center justify-center text-slate-700"
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
                className="p-2 -ml-2 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 active:bg-slate-100 touch-none cursor-grab"
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
                  "border border-slate-200 bg-slate-50 group-hover:bg-slate-100 transition",
                ].join(" ")}
                aria-hidden
              >
                <ChevronDown
                  className={[
                    "w-4 h-4 text-slate-600 transition-transform duration-200",
                    isStopOpen ? "rotate-0" : "-rotate-90",
                  ].join(" ")}
                />
              </span>

              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-800 truncate">{g.stopName}</div>
                <div className="text-[11px] text-slate-600 truncate">
                  {formatShortRangeDate(g.startDate)} – {formatShortRangeDate(g.endDate)} · {dayCount} day
                  {dayCount === 1 ? "" : "s"}
                </div>
              </div>
            </button>
          </div>

          {/* Nights stepper for desktop */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-600 mr-1">Nights</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onChangeNights(g.stopIndex, nightsHere - 1)}
                className="px-2 py-1 rounded-full border border-slate-200 text-xs hover:bg-slate-50 text-slate-700"
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
                className="px-2 py-1 rounded-full border border-slate-200 text-xs hover:bg-slate-50 text-slate-700"
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
            <div className="pl-2 md:pl-3 border-l border-slate-200 space-y-2">
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
                  />
                );
              })}
            </div>

            {/* Stop options - only visible when expanded */}
            <div className="pl-2 md:pl-3 mt-4 pt-4 border-t border-slate-200">
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
          </div>
        </div>
      </div>
    </div>
  );
}
