"use client";

import { useMemo, useState, useEffect } from "react";
import { Calendar, Zap, ChevronLeft, ChevronRight } from "lucide-react";
import type { TripPlan } from "@/lib/itinerary";
import type { DayDetail, DayStopMeta } from "@/lib/trip-planner/utils";
import { formatShortRangeDate, addDaysToIsoDate, formatDisplayDate } from "@/lib/trip-planner/utils";
import {
  getCityById,
  NZ_CITIES,
  searchPlacesByName,
  getPrimaryPlaceImageUrls,
  placeKeyFromOsm,
  type NzCity,
} from "@/lib/nzCities";
import { usePrefetchThingsToDo } from "@/lib/hooks/usePrefetchThingsToDo";
import { useThingsToDo } from "@/lib/hooks/useThingsToDo";
import { transformWalkingExperience, type ExperienceItem } from "@/lib/viator-helpers";
import { useEvents, type Event } from "@/lib/hooks/useEvents";
import EventsAttractionsCarousel from "@/components/trip-planner/EventsAttractionsCarousel";
import ThingsToDoList from "@/components/trip-planner/Things_todo/ThingsToDoList";
import DraftItineraryDayContent from "@/components/trip-planner/DraftItineraryDayContent";
import type { DraftItineraryProps } from "@/components/trip-planner/DraftItinerary.types";

type Props = DraftItineraryProps;

/** Location box shape used for sidebar (subset of what locationBoxes contains) */
type LocationBoxForSidebar = {
  stopIndex: number;
  cityId: string;
  cityName: string;
  dayIndices: number[];
};

/**
 * Sidebar day button that fetches and displays the number of available events for that day
 * (from the API), so the sidebar shows correct counts like the old timeline view.
 */
function SidebarDayItem({
  day,
  dayIndex,
  idx,
  selectedLocation,
  locationBoxes,
  selectedLocationIndex,
  routeStops,
  formatDayDate,
  isSelected,
  onSelect,
}: {
  day: TripPlan["days"][number];
  dayIndex: number;
  idx: number;
  selectedLocation: LocationBoxForSidebar;
  locationBoxes: LocationBoxForSidebar[];
  selectedLocationIndex: number;
  routeStops: string[];
  formatDayDate: (dateStr: string) => string;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const isDrivingDay = idx === 0;

  // Resolve destination coords (for all days)
  const [destCoords, setDestCoords] = useState<{ lat: number; lng: number } | undefined>(undefined);
  useEffect(() => {
    if (!selectedLocation.cityId) {
      setDestCoords(undefined);
      return;
    }
    const city = getCityById(selectedLocation.cityId);
    if (city) {
      setDestCoords({ lat: city.lat, lng: city.lng });
      return;
    }
    const place = NZ_CITIES.find((p: NzCity) =>
      p.name.toLowerCase() === selectedLocation.cityName.toLowerCase()
    );
    if (place) {
      setDestCoords({ lat: place.lat, lng: place.lng });
      return;
    }
    searchPlacesByName(selectedLocation.cityName, 1).then((results) => {
      if (results.length > 0) setDestCoords({ lat: results[0].lat, lng: results[0].lng });
      else setDestCoords(undefined);
    }).catch(() => setDestCoords(undefined));
  }, [selectedLocation.cityId, selectedLocation.cityName]);

  // Resolve "from" location for driving days
  const fromLocationName = useMemo(() => {
    if (!isDrivingDay) return "";
    if (selectedLocationIndex > 0 && locationBoxes[selectedLocationIndex - 1]) {
      return locationBoxes[selectedLocationIndex - 1].cityName;
    }
    const startId = routeStops[0];
    return getCityById(startId)?.name || startId;
  }, [isDrivingDay, selectedLocationIndex, locationBoxes, routeStops]);

  const fromLocationId = useMemo(() => {
    if (!isDrivingDay) return "";
    if (selectedLocationIndex > 0 && locationBoxes[selectedLocationIndex - 1]) {
      return locationBoxes[selectedLocationIndex - 1].cityId;
    }
    return routeStops[0] ?? "";
  }, [isDrivingDay, selectedLocationIndex, locationBoxes, routeStops]);

  const [fromCoords, setFromCoords] = useState<{ lat: number; lng: number } | undefined>(undefined);
  useEffect(() => {
    if (!isDrivingDay || !fromLocationId) {
      setFromCoords(undefined);
      return;
    }
    const city = getCityById(fromLocationId);
    if (city) {
      setFromCoords({ lat: city.lat, lng: city.lng });
      return;
    }
    const place = NZ_CITIES.find((p: NzCity) =>
      p.name.toLowerCase() === fromLocationName.toLowerCase()
    );
    if (place) {
      setFromCoords({ lat: place.lat, lng: place.lng });
      return;
    }
    searchPlacesByName(fromLocationName, 1).then((results) => {
      if (results.length > 0) setFromCoords({ lat: results[0].lat, lng: results[0].lng });
      else setFromCoords(undefined);
    }).catch(() => setFromCoords(undefined));
  }, [isDrivingDay, fromLocationId, fromLocationName]);

  const { events: destinationEvents } = useEvents(
    day.date,
    selectedLocation.cityName,
    destCoords?.lat,
    destCoords?.lng
  );

  const { events: fromLocationEvents } = useEvents(
    day.date,
    fromLocationName,
    fromCoords?.lat,
    fromCoords?.lng
  );

  const eventCount = useMemo(() => {
    if (isDrivingDay && fromLocationEvents && destinationEvents) {
      const seen = new Set<number>();
      fromLocationEvents.forEach((e) => seen.add(e.id));
      destinationEvents.forEach((e) => seen.add(e.id));
      return seen.size;
    }
    return destinationEvents?.length ?? 0;
  }, [isDrivingDay, fromLocationEvents, destinationEvents]);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`
        w-full rounded-lg transition-all duration-200 text-center
        ${isSelected
          ? "bg-indigo-600 text-white shadow-md"
          : "bg-white text-slate-700 hover:shadow-sm"
        }
      `}
    >
      <div className="py-1 px-1.5 md:py-1.5 md:px-2">
        <div
          className={`font-bold text-[10px] md:text-[12px] mb-0 ${isSelected ? "text-white" : "text-slate-900"}`}
        >
          {formatDayDate(day.date)}
        </div>
        <div className={`text-[8px] md:text-[10px] leading-tight ${isSelected ? "text-indigo-100" : "text-slate-500"}`}>
          DAY {day.dayNumber}
        </div>
        <div className={`text-[7px] md:text-[9px] mt-0.5 leading-tight ${isSelected ? "text-indigo-100" : "text-slate-500"}`}>
          {eventCount} {eventCount === 1 ? "Event" : "Events"}
        </div>
      </div>
    </button>
  );
}

export default function DraftItinerary(props: Props) {
  const {
    plan,
    routeStops,
    nightsPerStop,
    dayStopMeta,
    dayDetails,
    onChangeNights,
    onRemoveExperienceFromDay,
    onRemoveEventFromDay,
    onRemoveViatorProductFromDay,
    onEventHearted,
    onRequireAuth,
    startSectorType,
    onConvertStartToItinerary,
    onConvertStartToRoad,
    onAddToItinerary,
    legs,
  } = props;
  // State for selected location and day in the new sidebar view
  const [selectedLocationIndex, setSelectedLocationIndex] = useState<number>(0);
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(0);
  const [showAllThingsToDo, setShowAllThingsToDo] = useState<boolean>(false);
  const [mobileDaysCollapsed, setMobileDaysCollapsed] = useState<boolean>(true);
  
  // Prefetch "Things to do" data for all route stops when the itinerary is generated
  // This ensures data is ready immediately when users switch to the "Things to do" tab
  usePrefetchThingsToDo(routeStops);

  // Format date as "OCT 12" format
  const formatDayDate = (dateStr: string): string => {
    const d = new Date(dateStr + "T00:00:00");
    if (Number.isNaN(d.getTime())) return dateStr;
    const month = d.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
    const day = d.getDate();
    return `${month} ${day}`;
  };

  // Calculate event/activity count for each day
  const getDayEventCount = (dayIndex: number): number => {
    if (!plan || dayIndex < 0 || dayIndex >= plan.days.length) return 0;
    const day = plan.days[dayIndex];
    const dayKey = `${day.date}|${day.location}`;
    const detail = dayDetails[dayKey];
    if (!detail) return 0;
    
    const eventsCount = detail.events?.length || 0;
    const experiencesCount = detail.experiences?.length || 0;
    const viatorCount = detail.viatorProducts?.length || 0;
    
    return eventsCount + experiencesCount + viatorCount;
  };

  // Calculate location boxes data for horizontal display
  // Only include locations with at least 1 night stay
  const locationBoxes = useMemo(() => {
    if (!plan || routeStops.length === 0) return [];
    
    return routeStops
      .map((stopId, stopIndex) => {
        const city = getCityById(stopId);
        const cityName = city?.name || stopId;
        const nights = nightsPerStop[stopIndex] ?? 0;
        
        // Only include locations with at least 1 night
        if (nights < 1) return null;
        
        // Find days for this stop
        const dayIndices: number[] = [];
        for (let j = 0; j < plan.days.length; j++) {
          if ((dayStopMeta[j]?.stopIndex ?? -1) === stopIndex) {
            dayIndices.push(j);
          }
        }
        
        let arrivalDate = "";
        let departureDate = "";
        
        if (dayIndices.length > 0) {
          const firstDay = plan.days[dayIndices[0]];
          const lastDay = plan.days[dayIndices[dayIndices.length - 1]];
          arrivalDate = firstDay.date;
          departureDate = addDaysToIsoDate(lastDay.date, 1);
        }
        
        return {
          stopIndex,
          cityId: stopId,
          cityName,
          arrivalDate,
          departureDate,
          nights,
          dayIndices, // Store day indices for filtering
        };
      })
      .filter((box): box is NonNullable<typeof box> => box !== null);
  }, [plan, routeStops, nightsPerStop, dayStopMeta]);

  // Image URLs for the currently selected trip locations.
  const [placeImageUrls, setPlaceImageUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    const names = locationBoxes.map((l) => l.cityId);
    if (names.length === 0) {
      setPlaceImageUrls({});
      return;
    }

    let cancelled = false;

    const run = async () => {
      // Convert each city name to the stable nz_places_final identity (place_key),
      // then fetch the primary image for each.
      const placeKeyByName: Record<string, string> = {};
      const placeKeys: string[] = [];

      await Promise.all(
        names.map(async (name) => {
          const results = await searchPlacesByName(name, 1);
          const best = results[0];
          const key = placeKeyFromOsm(best?.country_code, best?.osm_type, best?.osm_id);
          if (!key) return;

          placeKeyByName[name] = key;
          placeKeys.push(key);
        })
      );

      const urlsByKey = await getPrimaryPlaceImageUrls(placeKeys);
      if (cancelled) return;

      const urlsByName: Record<string, string> = {};
      for (const [name, key] of Object.entries(placeKeyByName)) {
        const url = urlsByKey[key];
        if (url) urlsByName[name] = url;
      }
      setPlaceImageUrls(urlsByName);
    };

    run().catch((err) => {
      console.error("Error fetching place images:", err);
      if (!cancelled) setPlaceImageUrls({});
    });

    return () => {
      cancelled = true;
    };
  }, [locationBoxes, getPrimaryPlaceImageUrls]);

  // Get days for the selected location
  const selectedLocationDays = useMemo(() => {
    if (!plan || locationBoxes.length === 0) return [];
    const selectedLocation = locationBoxes[selectedLocationIndex];
    if (!selectedLocation) return [];
    
    return selectedLocation.dayIndices.map(idx => ({
      dayIndex: idx,
      day: plan.days[idx],
    }));
  }, [plan, locationBoxes, selectedLocationIndex]);

  // Reset selected day index when location changes
  useEffect(() => {
    if (selectedLocationDays.length > 0) {
      setSelectedDayIndex(0);
      setMobileDaysCollapsed(true);
    }
  }, [selectedLocationIndex, selectedLocationDays.length]);

  // Get location string for things to do (for carousel)
  const thingsToDoLocation = useMemo(() => {
    if (selectedLocationIndex >= locationBoxes.length) return "";
    const selectedLocation = locationBoxes[selectedLocationIndex];
    if (!selectedLocation) return "";

    const isStartLocation = selectedLocation.stopIndex === 0;
    const isDrivingDay = selectedDayIndex === 0 && startSectorType === "road";

    if (isDrivingDay && !isStartLocation) {
      // For driving days between start and another stop: use route name
      const startLocationId = routeStops[0];
      const startCity = getCityById(startLocationId);
      const startLocationName = startCity?.name || startLocationId;
      return `${startLocationName} to ${selectedLocation.cityName}`;
    }

    // For non-driving days (including start when staying overnight): use location name
    return selectedLocation.cityName;
  }, [selectedDayIndex, selectedLocationIndex, locationBoxes, routeStops, startSectorType]);

  // Fetch things to do data
  const { data: thingsToDoData } = useThingsToDo(thingsToDoLocation);
  const walkingExperiences = thingsToDoData?.walkingExperiences || [];
  const viatorProducts = thingsToDoData?.viatorProducts || [];
  
  // Combine and sort experiences for carousel (top 10)
  const topExperiences = useMemo(() => {
    if (thingsToDoLocation === "") return [];
    
    // Transform walking experiences
    const transformed = walkingExperiences.map(exp => transformWalkingExperience(exp));
    const allExperiences = [...transformed, ...viatorProducts];
    
    // Helper to extract numeric price from price string (e.g., "NZD 50.00" -> 50.00)
    const getPriceValue = (priceStr: string | undefined): number => {
      if (!priceStr) return Infinity; // Items without price go to end
      const match = priceStr.match(/[\d.]+/);
      return match ? parseFloat(match[0]) : Infinity;
    };
    
    // Sort by: rating (desc), then number of reviews (desc), then price (asc), then title (asc)
    const sorted = allExperiences.sort((a, b) => {
      // First: by rating (highest first)
      const ratingA = a.rating ?? 0;
      const ratingB = b.rating ?? 0;
      if (ratingA !== ratingB) {
        return ratingB - ratingA; // Descending
      }
      
      // Second: by number of reviews (highest first)
      const reviewsA = a.totalReviews ?? 0;
      const reviewsB = b.totalReviews ?? 0;
      if (reviewsA !== reviewsB) {
        return reviewsB - reviewsA; // Descending
      }
      
      // Third: by price (cheapest first)
      const priceA = getPriceValue(a.price);
      const priceB = getPriceValue(b.price);
      if (priceA !== priceB) {
        return priceA - priceB; // Ascending
      }
      
      // Fourth: by title (alphabetical)
      return a.title.localeCompare(b.title);
    });
    
    // Return top 10
    return sorted.slice(0, 10);
  }, [walkingExperiences, viatorProducts, thingsToDoLocation]);

  return (
    <div className="bg-slate-50/50">
      {/* Keep a single, consistent page container so all sections align on desktop and mobile */}
      <div className="mx-auto w-full max-w-5xl px-4 md:px-6 py-4 md:py-6">
        {/* One continuous white surface so the top location strip and the left "Days" strip touch (no gap) */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {/* Location boxes - horizontal layout */}
          {locationBoxes.length > 0 && (
            <div className="p-4 md:p-6">
              <div className="flex gap-3 md:gap-4 overflow-x-auto pb-2 snap-x snap-mandatory scroll-smooth">
                {locationBoxes.map((location, idx) => {
                  const isActive = idx === selectedLocationIndex;
                  const imgUrl = placeImageUrls[location.cityId];
                  return (
                    <button
                      key={`location-box-${location.stopIndex}`}
                      onClick={() => setSelectedLocationIndex(idx)}
                      className={`
                        relative flex flex-col flex-shrink-0 w-52 md:w-56 rounded-xl overflow-hidden snap-start
                        bg-white border transition-all duration-200 cursor-pointer
                        ${isActive ? "border-indigo-500 shadow-md" : "border-slate-200 shadow-sm hover:shadow-md"}
                      `}
                    >
                      {/* Image container - slightly inset with rounded corners */}
                      <div className="relative mx-1 mt-1 h-20 md:h-24 bg-gradient-to-br from-slate-100 to-slate-200 rounded-lg overflow-hidden">
                        <div
                          className="w-full h-full flex items-center justify-center"
                          data-placeholder="true"
                          style={{ display: imgUrl ? "none" : "flex" }}
                        >
                          <div className="text-slate-400 text-xs">Image</div>
                        </div>

                        {imgUrl ? (
                          <img
                            src={imgUrl}
                            alt={location.cityName}
                            className="absolute inset-0 w-full h-full object-cover"
                            onError={(e) => {
                              const target = e.currentTarget as HTMLImageElement;
                              target.style.display = "none";
                              const placeholder = target.parentElement?.querySelector('[data-placeholder="true"]') as HTMLElement | null;
                              if (placeholder) placeholder.style.display = "flex";
                            }}
                          />
                        ) : null}
                        {/* Active indicator */}
                        {isActive && (
                          <div className="absolute top-1.5 right-1.5 bg-indigo-600 text-white text-[10px] font-medium px-1.5 py-0.5 rounded z-10">
                            ACTIVE
                          </div>
                        )}
                      </div>

                      {/* Content container */}
                      <div className="p-2">
                        {/* Location name */}
                        <h3 className="font-semibold text-slate-900 text-xs md:text-sm mb-0.5 text-left">
                          {location.cityName}
                        </h3>

                        {/* Date and nights */}
                        {location.arrivalDate && location.departureDate && (
                          <div className="flex items-center gap-1 text-[10px] md:text-xs text-slate-600">
                            <Calendar className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">
                              {formatShortRangeDate(location.arrivalDate)} – {formatShortRangeDate(location.departureDate)}
                            </span>
                            <span className="text-slate-400">•</span>
                            <div className="flex items-center gap-1">
                              <span className="text-slate-500">
                                {location.nights} {location.nights === 1 ? "Night" : "Nights"}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onChangeNights(location.stopIndex, location.nights - 1);
                                }}
                                className="w-4 h-4 flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded border border-slate-200 transition-all duration-200 text-[10px]"
                              >
                                −
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onChangeNights(location.stopIndex, location.nights + 1);
                                }}
                                className="w-4 h-4 flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded border border-slate-200 transition-all duration-200 text-[10px]"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* New Day-by-Day View - Left Sidebar and Main Content (or Show All Things to Do) */}
          {plan && selectedLocationDays.length > 0 && (() => {
            const selectedLocation =
              selectedLocationIndex < locationBoxes.length ? locationBoxes[selectedLocationIndex] : null;
            const showAllLocationString = selectedLocation?.cityName ?? "";
            const selectedDayForLabel = selectedLocationDays[selectedDayIndex]?.day;

            return (
              <div className="p-4 md:p-6">
                <div className="flex flex-row gap-3 md:gap-6">
                  {/* Left Sidebar - Day Navigation (hidden when Show all is active) */}
                  {!showAllThingsToDo && (
                    <>
                      {/* Desktop sidebar */}
                      <div className="hidden md:block flex-shrink-0 w-[141px] pr-4">
                        <div className="space-y-2">
                          {selectedLocation &&
                            selectedLocationDays.map(({ dayIndex, day }, idx) => (
                              <SidebarDayItem
                                key={`day-nav-${dayIndex}`}
                                day={day}
                                dayIndex={dayIndex}
                                idx={idx}
                                selectedLocation={selectedLocation}
                                locationBoxes={locationBoxes}
                                selectedLocationIndex={selectedLocationIndex}
                                routeStops={routeStops}
                                formatDayDate={formatDayDate}
                                isSelected={idx === selectedDayIndex}
                                onSelect={() => setSelectedDayIndex(idx)}
                              />
                            ))}
                        </div>
                      </div>

                      {/* Mobile: true collapsible left sidebar that stays in-layout (timeline reflows) */}
                      <div
                        className={[
                          "md:hidden relative flex-shrink-0 transition-[width] duration-200 ease-out",
                          mobileDaysCollapsed ? "w-[28px]" : "w-[140px]",
                        ].join(" ")}
                      >
                        {/* Edge handle */}
                        <button
                          type="button"
                          onClick={() => setMobileDaysCollapsed((v) => !v)}
                          aria-label={mobileDaysCollapsed ? "Expand day list" : "Collapse day list"}
                          className="absolute right-0 top-3 translate-x-1/2 w-6 h-10 rounded-full bg-white shadow-md border border-slate-200 flex items-center justify-center text-slate-600 hover:text-slate-900"
                        >
                          {mobileDaysCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                        </button>

                        {/* Content */}
                        <div
                          className={[
                            "h-full",
                            mobileDaysCollapsed ? "opacity-0 pointer-events-none" : "opacity-100",
                            "transition-opacity duration-150",
                          ].join(" ")}
                        >
                          <div className="text-[11px] font-semibold text-slate-500 mb-2">
                            Days
                            {selectedDayForLabel ? (
                              <span className="ml-2 font-medium text-slate-400">
                                {formatDayDate(selectedDayForLabel.date)}
                              </span>
                            ) : null}
                          </div>
                          <div className="space-y-2">
                            {selectedLocation &&
                              selectedLocationDays.map(({ dayIndex, day }, idx) => (
                                <SidebarDayItem
                                  key={`day-nav-mobile-${dayIndex}`}
                                  day={day}
                                  dayIndex={dayIndex}
                                  idx={idx}
                                  selectedLocation={selectedLocation}
                                  locationBoxes={locationBoxes}
                                  selectedLocationIndex={selectedLocationIndex}
                                  routeStops={routeStops}
                                  formatDayDate={formatDayDate}
                                  isSelected={idx === selectedDayIndex}
                                  onSelect={() => setSelectedDayIndex(idx)}
                                />
                              ))}
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Main Content Area - Show All panel or Selected Day Details */}
                  {showAllThingsToDo ? (
                    <div className="flex-1 min-w-0">
                      <div className="space-y-6">
                        <button
                          type="button"
                          onClick={() => setShowAllThingsToDo(false)}
                          className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
                        >
                          <ChevronLeft className="w-4 h-4" />
                          Back to day view
                        </button>
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <Zap className="w-4 h-4 text-indigo-600" />
                            <h4 className="text-sm font-semibold text-slate-900">Things to do</h4>
                          </div>
                          <ThingsToDoList location={showAllLocationString} onAddToItinerary={onAddToItinerary} />
                        </div>
                      </div>
                    </div>
                  ) : selectedLocationDays[selectedDayIndex] ? (
                    <div className="flex-1 min-w-0">
                      <DraftItineraryDayContent
                        selectedDay={selectedLocationDays[selectedDayIndex].day}
                        selectedDayIndex={selectedDayIndex}
                        selectedLocationIndex={selectedLocationIndex}
                        locationBoxes={locationBoxes}
                        dayDetails={dayDetails}
                        plan={plan}
                        routeStops={routeStops}
                        topExperiences={topExperiences}
                        walkingExperiences={walkingExperiences}
                        viatorProducts={viatorProducts}
                        onShowAllThingsToDo={() => setShowAllThingsToDo(true)}
                        onAddToItinerary={onAddToItinerary}
                        onRemoveExperienceFromDay={onRemoveExperienceFromDay}
                        onRemoveViatorProductFromDay={onRemoveViatorProductFromDay}
                        onEventHearted={onEventHearted}
                        onRemoveEventFromDay={onRemoveEventFromDay}
                        onRequireAuth={onRequireAuth}
                        isStartRoadSector={startSectorType === "road"}
                        onConvertStartToItinerary={onConvertStartToItinerary}
                        onConvertStartToRoad={onConvertStartToRoad}
                        legs={legs}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
