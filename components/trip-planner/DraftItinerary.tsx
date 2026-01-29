"use client";

import { useMemo, useState, useRef, useEffect, type CSSProperties } from "react";
import { ChevronDown, GripVertical, Search, MapPin, Car } from "lucide-react";
import { NZ_CITIES, getCityById, searchPlacesByName, getPlaceById, type Place } from "@/lib/nzCities";
import type { TripPlan } from "@/lib/itinerary";
import {
  formatShortRangeDate,
  makeDayKey,
  normalize,
  type DayDetail,
  type DayStopMeta,
  type CityLite,
  type RoadSectorDetail,
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

  roadSectorDetails: Record<number, RoadSectorDetail>;
  onToggleRoadSectorOpen: (destinationStopIndex: number) => void;
  onUpdateRoadSectorActivities: (destinationStopIndex: number, activities: string) => void;
  startSectorType: "road" | "itinerary";
  endSectorType: "road" | "itinerary";
  onConvertStartToItinerary: () => void;
  onConvertStartToRoad: () => void;
  onConvertEndToItinerary: () => void;
  onConvertEndToRoad: () => void;

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
  const [dbSearchResults, setDbSearchResults] = useState<Place[]>([]);
  const [selectedPlaceData, setSelectedPlaceData] = useState<Place | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Try to get selected city from stored data, cache, or fetch from database
  const selectedCity = useMemo(() => {
    if (!value) return null;
    
    // First try stored data
    if (selectedPlaceData && selectedPlaceData.id === value) {
      return selectedPlaceData;
    }
    
    // Then try cache
    const cached = getCityById(value);
    if (cached) return cached;
    
    return null;
  }, [value, selectedPlaceData]);

  const suggested = pickSuggestedCities();

  // Search places from database when user types (same as PlacesPickerPanel)
  useEffect(() => {
    if (!query.trim()) {
      setDbSearchResults([]);
      return;
    }

    const searchPlaces = async () => {
      try {
        const results = await searchPlacesByName(query, 20);
        setDbSearchResults(results.slice(0, 8));
      } catch (error) {
        console.error("Error searching places:", error);
        setDbSearchResults([]);
      }
    };

    // Debounce search
    const timeoutId = setTimeout(searchPlaces, 300);
    return () => clearTimeout(timeoutId);
  }, [query]);

  // Fetch place data when value changes (if not already stored)
  useEffect(() => {
    if (!value) {
      setSelectedPlaceData(null);
      return;
    }

    // If we already have the data, don't fetch again
    if (selectedPlaceData && selectedPlaceData.id === value) {
      return;
    }

    // Try cache first
    const cached = getCityById(value);
    if (cached) {
      setSelectedPlaceData(cached);
      return;
    }

    // Fetch from database
    const fetchPlace = async () => {
      try {
        const place = await getPlaceById(value);
        if (place) {
          setSelectedPlaceData(place);
        }
      } catch (error) {
        console.error("Error fetching place:", error);
      }
    };

    fetchPlace();
  }, [value, selectedPlaceData]);

  const searchResults = useMemo(() => {
    return dbSearchResults.map((p) => ({ id: p.id, name: p.name }));
  }, [dbSearchResults]);

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

  async function handleSelectCity(cityId: string) {
    // Try to get place data from search results first (we have full data there)
    const foundInResults = dbSearchResults.find((r) => r.id === cityId);
    if (foundInResults) {
      setSelectedPlaceData(foundInResults);
    } else {
      // If not in search results (e.g., from suggested), try cache or fetch
      let place = getCityById(cityId);
      if (!place) {
        try {
          place = await getPlaceById(cityId);
        } catch (error) {
          console.error("Error fetching place:", error);
        }
      }
      if (place) {
        setSelectedPlaceData(place);
      }
    }
    
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

function StartEndSectorCard({
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
}: {
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
}) {
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
                I&apos;m staying here
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
              I&apos;m staying here
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

function RoadSectorCard({
  fromStopIndex,
  toStopIndex,
  fromStopName,
  toStopName,
  isOpen,
  activities,
  onToggleOpen,
  onUpdateActivities,
}: {
  fromStopIndex: number;
  toStopIndex: number;
  fromStopName: string;
  toStopName: string;
  isOpen: boolean;
  activities: string;
  onToggleOpen: () => void;
  onUpdateActivities: (activities: string) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      {/* Road sector header - thinner than itinerary sectors */}
      <div className="px-3 md:px-4 py-2">
        {/* Mobile: Just car icon and dropdown arrow */}
        <div className="md:hidden flex items-center gap-2">
          <Car className="w-4 h-4 text-slate-600 shrink-0" />
          <button
            type="button"
            onClick={onToggleOpen}
            className="flex items-center gap-2 min-w-0 flex-1 group"
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
                  isOpen ? "rotate-0" : "-rotate-90",
                ].join(" ")}
              />
            </span>
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
                  value={activities}
                  onChange={(e) => onUpdateActivities(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StopGroupWithRoadSector({
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
  onToggleRoadSectorOpen,
  onUpdateRoadSectorActivities,
  onStartAddStop,
  onConfirmAddStop,
  onCancelAddStop,
  onRemoveStop,
}: {
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
  onToggleRoadSectorOpen: (destinationStopIndex: number) => void;
  onUpdateRoadSectorActivities: (destinationStopIndex: number, activities: string) => void;
  onStartAddStop: (stopIndex: number) => void;
  onConfirmAddStop: () => void;
  onCancelAddStop: () => void;
  onRemoveStop: (stopIndex: number) => void;
}) {
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
          onToggleOpen={() => onToggleRoadSectorOpen(group.stopIndex)}
          onUpdateActivities={(activities) => onUpdateRoadSectorActivities(group.stopIndex, activities)}
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
        onStartAddStop={onStartAddStop}
        onConfirmAddStop={onConfirmAddStop}
        onCancelAddStop={onCancelAddStop}
        onRemoveStop={onRemoveStop}
        dragAttributes={attributes}
        dragListeners={listeners}
        isDragDisabled={isDragDisabled}
      />
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
  dragAttributes,
  dragListeners,
  isDragDisabled,
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
  dragAttributes?: any;
  dragListeners?: any;
  isDragDisabled?: boolean;
}) {
  const isStopOpen = openStops[g.stopIndex] ?? false;
  const dayCount = g.dayIndices.length;
  const nightsHere = nightsPerStop[g.stopIndex] ?? 1;

  const isDragDisabledLocal = isDragDisabled ?? (g.stopIndex === 0 || g.stopIndex === routeStops.length - 1);

  return (
    <div
      className="rounded-2xl border border-slate-200 bg-white overflow-hidden"
    >
      {/* Stop header */}
      <div className="px-3 md:px-4 py-3">
        {/* Mobile: Stack layout */}
        <div className="md:hidden space-y-3">
          <div className="flex items-center gap-2 min-w-0">
            {!isDragDisabledLocal && dragAttributes && dragListeners && (
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="p-1.5 -ml-1 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 active:bg-slate-100 touch-none cursor-grab"
                aria-label="Reorder stop"
                {...dragListeners}
                {...dragAttributes}
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
            {!isDragDisabledLocal && dragAttributes && dragListeners && (
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="p-2 -ml-2 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 active:bg-slate-100 touch-none cursor-grab"
                aria-label="Reorder stop"
                {...dragListeners}
                {...dragAttributes}
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
