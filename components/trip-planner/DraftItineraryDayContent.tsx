"use client";

import { useRef, useState, useEffect, useMemo } from "react";
import { Car, Star, Compass, Ticket, Bed, Utensils, Zap, X, Home, MapPin } from "lucide-react";
import type { TripPlan, TripLeg } from "@/lib/itinerary";
import type { DayDetail, ManualTripEntry } from "@/lib/trip-planner/utils";
import ManualEntryInline from "@/components/trip-planner/ManualEntryInline";
import { formatDisplayDate, makeDayKey } from "@/lib/trip-planner/utils";
import { getResolvedHotelCoords } from "@/lib/trip-planner/manualEntry";
import { getCityById, NZ_CITIES, searchPlacesByName, type NzCity } from "@/lib/nzCities";
import type { WalkingExperience } from "@/lib/walkingExperiences";
import type { ExperienceItem } from "@/lib/viator-helpers";
import { useEvents, type Event } from "@/lib/hooks/useEvents";
import { useNearbyPlaces } from "@/lib/hooks/useNearbyPlaces";
import EventsAttractionsCarousel from "@/components/trip-planner/EventsAttractionsCarousel";
import NearbyPlacesCarousel from "@/components/trip-planner/NearbyPlacesCarousel";

export type LocationBox = {
  stopIndex: number;
  cityId: string;
  cityName: string;
  arrivalDate: string;
  departureDate: string;
  nights: number;
  dayIndices: number[];
};

export type DraftItineraryDayContentProps = {
  selectedDay: TripPlan["days"][number];
  selectedDayIndex: number;
  selectedLocationIndex: number;
  locationBoxes: LocationBox[];
  dayDetails: Record<string, DayDetail>;
  plan: TripPlan;
  routeStops: string[];
  topExperiences: ExperienceItem[];
  walkingExperiences: WalkingExperience[];
  viatorProducts: ExperienceItem[];
  onShowAllThingsToDo: () => void;
  /** Opens full-width nearby restaurants map (same data as carousel; cached). */
  onShowNearbyRestaurantsMap?: () => void;
  /** Opens full-width nearby hotels map (same data as carousel; cached). */
  onShowNearbyHotelsMap?: () => void;
  onAddToItinerary?: (
    experience: WalkingExperience | ExperienceItem,
    location: string,
    dayDate?: string,
    dayLocation?: string
  ) => void;
  onRemoveExperienceFromDay?: (date: string, location: string, experienceId: string) => void;
  onRemoveViatorProductFromDay?: (date: string, location: string, productId: string) => void;
  onEventHearted?: (event: Event, date: string, location: string) => void;
  onRemoveEventFromDay?: (date: string, location: string, eventId: number) => void;
  onRequireAuth?: (event: Event, date: string, location: string) => void;
  /** Whether the trip currently treats the start as a road sector (no overnight) */
  isStartRoadSector?: boolean;
  /** Handler to convert the start road sector into an overnight stay */
  onConvertStartToItinerary?: () => void;
  /** Handler to convert the start back to a driving-only road sector */
  onConvertStartToRoad?: () => void;
  /** Optional driving legs for dynamic distance/time */
  legs?: TripLeg[];
  onAddManualTripEntry?: (date: string, location: string, entry: ManualTripEntry) => void;
  onRemoveManualTripEntry?: (date: string, location: string, id: string) => void;
};

export default function DraftItineraryDayContent({
  selectedDay,
  selectedDayIndex,
  selectedLocationIndex,
  locationBoxes,
  dayDetails,
  plan,
  routeStops,
  topExperiences,
  walkingExperiences,
  viatorProducts,
  onShowAllThingsToDo,
  onShowNearbyRestaurantsMap,
  onShowNearbyHotelsMap,
  onAddToItinerary,
  onRemoveExperienceFromDay,
  onRemoveViatorProductFromDay,
  onEventHearted,
  onRemoveEventFromDay,
  onRequireAuth,
  isStartRoadSector,
  onConvertStartToItinerary,
  onConvertStartToRoad,
  legs,
  onAddManualTripEntry,
  onRemoveManualTripEntry,
}: DraftItineraryDayContentProps) {
  // Use the same key helper as the rest of the trip planner to ensure
  // we read the exact same dayDetails entry that "Added Experiences and Events" uses.
  const dayKey = makeDayKey(selectedDay.date, selectedDay.location);
  const detail = dayDetails[dayKey] || {};
  const manualEntries = detail.manualEntries ?? [];
  const manualThings = manualEntries.filter((m) => m.section === "thingsToDo");
  const manualEvents = manualEntries.filter((m) => m.section === "events");
  const manualHotels = manualEntries.filter((m) => m.section === "hotel");
  const manualRestaurants = manualEntries.filter((m) => m.section === "restaurant");
  const hasManualHotel = manualHotels.length > 0;
  const city = getCityById(selectedDay.location);
  const locationName = city?.name || selectedDay.location;

  const eventsCarouselRef = useRef<HTMLDivElement>(null);
  const hotelCardRef = useRef<HTMLDivElement>(null);
  const nearbyPlacesCardRef = useRef<HTMLDivElement>(null);
  const contentColumnRef = useRef<HTMLDivElement>(null);
  /** Row that contains the timeline rail + content; used for icon offset math (not CSS .gap-4 — we use gap-2 sm:gap-4). */
  const timelineRowRef = useRef<HTMLDivElement>(null);
  const [ticketStubTop, setTicketStubTop] = useState<number | null>(null);
  const [hotelIconTop, setHotelIconTop] = useState<number | null>(null);
  const [nearbyPlacesIconTop, setNearbyPlacesIconTop] = useState<number | null>(null);
  const selectedLocation = selectedLocationIndex < locationBoxes.length ? locationBoxes[selectedLocationIndex] : null;
  // Show the main day timeline for all non-road stops, including Day 1 once the start has been converted
  const shouldShowTimeline =
    selectedLocationIndex < locationBoxes.length &&
    selectedLocation !== null &&
    (selectedLocation.stopIndex !== 0 || !isStartRoadSector);

  const showEventsCarousel = shouldShowTimeline;
  // Treat the first day for each stop as a driving day, except for the start city
  // where it is only a driving day while the start sector is still a road sector.
  const isStartLocation = selectedLocation?.stopIndex === 0;
  const isDrivingDay = selectedDayIndex === 0 && (!isStartLocation || !!isStartRoadSector);

  let eventsDestinationName = selectedLocation?.cityName || "";
  let eventsDestinationId = selectedLocation?.cityId || "";

  if (showEventsCarousel && selectedLocation) {
    eventsDestinationName = selectedLocation.cityName;
    eventsDestinationId = selectedLocation.cityId;
  }

  const [destinationLocationCoords, setDestinationLocationCoords] = useState<{ lat: number; lng: number } | undefined>(undefined);
  useEffect(() => {
    if (!eventsDestinationId) {
      setDestinationLocationCoords(undefined);
      return;
    }
    const c = getCityById(eventsDestinationId);
    if (c) {
      setDestinationLocationCoords({ lat: c.lat, lng: c.lng });
      return;
    }
    const place = NZ_CITIES.find((p: NzCity) => p.name.toLowerCase() === eventsDestinationName.toLowerCase());
    if (place) {
      setDestinationLocationCoords({ lat: place.lat, lng: place.lng });
      return;
    }
    searchPlacesByName(eventsDestinationName, 1).then((results) => {
      if (results.length > 0) setDestinationLocationCoords({ lat: results[0].lat, lng: results[0].lng });
      else setDestinationLocationCoords(undefined);
    }).catch(() => setDestinationLocationCoords(undefined));
  }, [eventsDestinationId, eventsDestinationName]);

  const resolvedHotelCoords = useMemo(() => getResolvedHotelCoords(detail), [detail]);
  /** City center when no manual hotel; hotel coordinates when manual hotel resolved in Places. */
  const restaurantSearchCoords = useMemo(() => {
    if (hasManualHotel) return resolvedHotelCoords ?? undefined;
    return destinationLocationCoords;
  }, [hasManualHotel, resolvedHotelCoords, destinationLocationCoords]);

  const { events: destinationEvents, loading: destinationLoading } = useEvents(
    selectedDay.date,
    eventsDestinationName,
    destinationLocationCoords?.lat,
    destinationLocationCoords?.lng
  );

  // Initial implementation: nearby places ranked by distance from the selected city's coordinates.
  // Later, we'll swap this input to use hotel/venue coordinates instead.
  const {
    places: nearbyRestaurants,
    loading: nearbyRestaurantsLoading,
    error: nearbyRestaurantsError,
  } = useNearbyPlaces({
    lat: restaurantSearchCoords?.lat,
    lng: restaurantSearchCoords?.lng,
    radiusMeters: 5000,
    maxPlaces: 20,
    includedType: "restaurant",
    sortBy: "rating",
  });

  const topRestaurantsNearby = useMemo(() => nearbyRestaurants.slice(0, 3), [nearbyRestaurants]);

  /** When more than 3 experience tiles, use fixed md width so ~3 show with horizontal scroll. */
  const thingsToDoScrollOnMd = topExperiences.length > 3;

  const {
    places: nearbyHotels,
    loading: nearbyHotelsLoading,
    error: nearbyHotelsError,
  } = useNearbyPlaces({
    lat: destinationLocationCoords?.lat,
    lng: destinationLocationCoords?.lng,
    radiusMeters: 8000,
    maxPlaces: 20,
    includedType: "lodging",
    sortBy: "rating",
  });

  const canLoadNearbyPlaces =
    destinationLocationCoords?.lat !== undefined && destinationLocationCoords?.lng !== undefined;

  const canLoadRestaurantNearbySearch = hasManualHotel
    ? resolvedHotelCoords !== undefined
    : canLoadNearbyPlaces;

  const topRatedHotelsNearby = useMemo(() => nearbyHotels.slice(0, 3), [nearbyHotels]);

  const getEventDurationNights = (event: Event): number | null => {
    if (!event.datetime_start) return null;
    if (!event.datetime_end) return 0;
    const start = new Date(event.datetime_start);
    const end = new Date(event.datetime_end);
    const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays - 1);
  };
  const sortEventsByPriority = (events: Event[]): Event[] =>
    [...events].sort((a, b) => {
      const nightsA = getEventDurationNights(a);
      const nightsB = getEventDurationNights(b);
      if (nightsA === 0 && nightsB !== 0) return -1;
      if (nightsA !== 0 && nightsB === 0) return 1;
      if (nightsA === 1 && nightsB !== 1) return -1;
      if (nightsA !== 1 && nightsB === 1) return 1;
      if (nightsA === 2 && nightsB !== 2) return -1;
      if (nightsA !== 2 && nightsB === 2) return 1;
      return (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase());
    });

  const allEvents = useMemo(
    () => sortEventsByPriority(destinationEvents || []),
    [destinationEvents]
  );

  const eventsLoading = destinationLoading;

  useEffect(() => {
    const measureIconPositions = () => {
      const parent = timelineRowRef.current;
      if (!parent) return;
      if (showEventsCarousel && eventsCarouselRef.current) {
        const rect = eventsCarouselRef.current.getBoundingClientRect();
        setTicketStubTop(rect.top - parent.getBoundingClientRect().top);
      } else setTicketStubTop(null);
      if (hotelCardRef.current) {
        const rect = hotelCardRef.current.getBoundingClientRect();
        setHotelIconTop(rect.top - parent.getBoundingClientRect().top);
      } else setHotelIconTop(null);
      if (nearbyPlacesCardRef.current) {
        const rect = nearbyPlacesCardRef.current.getBoundingClientRect();
        setNearbyPlacesIconTop(rect.top - parent.getBoundingClientRect().top);
      } else setNearbyPlacesIconTop(null);
    };
    const runAfterLayout = () => requestAnimationFrame(() => requestAnimationFrame(measureIconPositions));
    runAfterLayout();
    const el = contentColumnRef.current;
    if (!el) return;
    const observer = new ResizeObserver(runAfterLayout);
    observer.observe(el);
    return () => observer.disconnect();
  }, [
    showEventsCarousel,
    selectedLocation,
    selectedDayIndex,
    eventsLoading,
    allEvents.length,
    topExperiences.length,
    nearbyHotelsLoading,
    nearbyHotels.length,
    nearbyRestaurantsLoading,
    nearbyRestaurants.length,
  ]);

  let fromLocationName = "";
  if (isDrivingDay && selectedLocation) {
    if (selectedLocationIndex > 0) {
      fromLocationName = locationBoxes[selectedLocationIndex - 1].cityName;
    } else {
      const startCity = getCityById(routeStops[0]);
      fromLocationName = startCity?.name || routeStops[0];
    }
  }
  const destinationName = selectedLocation?.cityName ?? "";

  // Find matching leg for driving info (from -> to) if legs are provided
  let drivingDistanceLabel = "6h 15m drive";
  let drivingKmLabel = "480 km";
  if (legs && legs.length > 0 && fromLocationName && destinationName) {
    const match = legs.find(
      (leg) =>
        leg.from.toLowerCase() === fromLocationName.toLowerCase() &&
        leg.to.toLowerCase() === destinationName.toLowerCase()
    );
    if (match) {
      // Simple formatting: distance to nearest km, hours to 0.5h
      const km = Math.round(match.distanceKm);
      drivingKmLabel = `${km.toLocaleString()} km`;
      const totalMinutes = match.driveHours * 60;
      const hours = Math.floor(totalMinutes / 60);
      const minutes = Math.round(totalMinutes % 60);
      const parts: string[] = [];
      if (hours > 0) parts.push(`${hours}h`);
      if (minutes > 0) parts.push(`${minutes}m`);
      drivingDistanceLabel = parts.length ? `${parts.join(" ")} drive` : "Drive";
    }
  }

  // Count activities already added to this day (experiences + Viator products)
  const addedActivitiesCount =
    (detail.experiences?.length || 0) + (detail.viatorProducts?.length || 0);
  const addedExperiences = detail.experiences || [];
  const addedViatorProducts = detail.viatorProducts || [];

  return (
    <div className="flex-1 rounded-xl bg-slate-50/50 p-2 sm:p-3 md:p-6">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-slate-900">{formatDisplayDate(selectedDay.date)}</h2>
            <p className="text-sm text-slate-600 mt-1">{locationName}</p>
          </div>
        </div>
      </div>

      {selectedDay.dayNumber === 1 && !isStartRoadSector && onConvertStartToRoad && (
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={onConvertStartToRoad}
            className="inline-flex items-center rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 active:bg-slate-100 transition"
          >
            Revert to travel day
          </button>
        </div>
      )}

      <div className="space-y-9">
        {shouldShowTimeline && selectedLocation && (
          <div ref={timelineRowRef} className="flex gap-2 sm:gap-4 relative">
            <div className="flex flex-col items-center relative self-stretch w-10 flex-shrink-0">
              <div className="w-10 h-10 aspect-square rounded-full bg-white border-2 border-indigo-600 flex items-center justify-center shrink-0 z-10">
                {isDrivingDay ? <Car className="w-5 h-5 text-indigo-600" /> : <Zap className="w-5 h-5 text-indigo-600" />}
              </div>
              <div
                className="absolute top-10 left-1/2 -translate-x-1/2 w-0.5 bg-slate-200"
                style={{ bottom: nearbyPlacesIconTop !== null ? "2.5rem" : hotelIconTop !== null ? "2.5rem" : showEventsCarousel ? "2.5rem" : "0" }}
              />
              {showEventsCarousel && ticketStubTop !== null && (
                <div className="absolute left-1/2 -translate-x-1/2 w-10 h-10 aspect-square rounded-full bg-white border-2 border-indigo-600 flex items-center justify-center shrink-0 z-10" style={{ top: `${ticketStubTop}px` }}>
                  <Ticket className="w-5 h-5 text-indigo-600" />
                </div>
              )}
              {hotelIconTop !== null && (
                <div className="absolute left-1/2 -translate-x-1/2 w-10 h-10 aspect-square rounded-full bg-white border-2 border-indigo-600 flex items-center justify-center shrink-0 z-10" style={{ top: `${hotelIconTop}px` }}>
                  <Bed className="w-5 h-5 text-indigo-600" />
                </div>
              )}
              {nearbyPlacesIconTop !== null && (
                <div className="absolute left-1/2 -translate-x-1/2 w-10 h-10 aspect-square rounded-full bg-white border-2 border-indigo-600 flex items-center justify-center shrink-0 z-10" style={{ top: `${nearbyPlacesIconTop}px` }}>
                  <Utensils className="w-5 h-5 text-indigo-600" />
                </div>
              )}
            </div>

            <div ref={contentColumnRef} className="flex-1 min-w-0 space-y-9">
              {isDrivingDay && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-6">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="space-y-1.5">
                      <div className="text-sm font-semibold text-slate-900">
                        Driving from {fromLocationName} to {destinationName}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                        <div className="flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                          <span>{drivingDistanceLabel}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                          <span>{drivingKmLabel}</span>
                        </div>
                      </div>
                    </div>
                    {selectedDay.dayNumber === 1 && isStartRoadSector && onConvertStartToItinerary && (
                      <button
                        type="button"
                        onClick={onConvertStartToItinerary}
                        className="self-start md:self-auto inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 shadow-sm text-left hover:bg-slate-50 transition"
                      >
                        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500">
                          <Home className="h-3.5 w-3.5" />
                        </span>
                        <span className="flex flex-col">
                          <span className="text-xs font-semibold text-slate-900">
                            Stay in {fromLocationName || destinationName}
                          </span>
                          <span className="text-[10px] font-semibold tracking-wide text-slate-400">
                            ADD OVERNIGHT
                          </span>
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {addedActivitiesCount > 0 && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                    <div className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory scroll-smooth">
                      {addedExperiences.map((exp) => (
                        <div
                          key={`exp-${exp.id}`}
                          className="relative flex flex-col flex-shrink-0 w-32 md:w-36 rounded-lg overflow-hidden bg-white border border-emerald-200 shadow-sm hover:shadow-md transition-all snap-start"
                        >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onRemoveExperienceFromDay?.(selectedDay.date, selectedDay.location, exp.id);
                          }}
                          className="absolute top-0.5 right-0.5 z-10 w-4 h-4 rounded-full bg-slate-800/80 text-white flex items-center justify-center hover:bg-slate-700 transition-colors"
                          aria-label="Remove from day"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                        <div className="relative w-full aspect-[3/2] bg-gradient-to-br from-slate-100 to-slate-200">
                          {exp.url_to_thumbnail ? (
                            <img
                              src={exp.url_to_thumbnail}
                              alt={exp.track_name}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <span className="text-sm">🏔️</span>
                            </div>
                          )}
                        </div>
                        <div className="p-1 flex flex-col flex-1 min-h-0">
                          <h3 className="font-medium text-slate-900 text-[10px] md:text-xs text-left line-clamp-2 leading-tight">
                            {exp.track_name}
                          </h3>
                        </div>
                      </div>
                    ))}
                      {addedViatorProducts.map((vp) => (
                        <div
                          key={`vp-${vp.id}`}
                          className="relative flex flex-col flex-shrink-0 w-32 md:w-36 rounded-lg overflow-hidden bg-white border border-emerald-200 shadow-sm hover:shadow-md transition-all snap-start"
                        >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onRemoveViatorProductFromDay?.(selectedDay.date, selectedDay.location, vp.id);
                          }}
                          className="absolute top-0.5 right-0.5 z-10 w-4 h-4 rounded-full bg-slate-800/80 text-white flex items-center justify-center hover:bg-slate-700 transition-colors"
                          aria-label="Remove from day"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                        <div className="relative w-full aspect-[3/2] bg-gradient-to-br from-slate-100 to-slate-200">
                          {vp.imageUrl ? (
                            <img
                              src={vp.imageUrl}
                              alt={vp.title}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <span className="text-sm">🎫</span>
                            </div>
                          )}
                        </div>
                        <div className="p-1 flex flex-col flex-1 min-h-0">
                          <h3 className="font-medium text-slate-900 text-[10px] md:text-xs text-left line-clamp-2 leading-tight">
                            {vp.title}
                          </h3>
                        </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      {isDrivingDay ? <Compass className="w-4 h-4 text-indigo-600" /> : <Zap className="w-4 h-4 text-indigo-600" />}
                      <h4 className="text-sm font-semibold text-slate-900 min-w-0 break-words">
                        {destinationName
                          ? `Things to do in ${destinationName}`
                          : "Things to do"}
                      </h4>
                    </div>
                    {topExperiences.length > 0 && (
                      <button
                        type="button"
                        onClick={onShowAllThingsToDo}
                        className="shrink-0 px-2 py-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 border border-indigo-200 rounded hover:bg-indigo-50 transition-colors"
                      >
                        Show all
                      </button>
                    )}
                  </div>
                  {topExperiences.length > 0 ? (
                    <div className="overflow-hidden">
                      <div
                        className={[
                          "flex w-full gap-2 md:gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scroll-smooth",
                          thingsToDoScrollOnMd ? "" : "md:overflow-x-visible md:snap-none",
                        ].join(" ")}
                      >
                        {topExperiences.map((experience) => (
                          <div
                            key={experience.id}
                            className={[
                              "flex flex-col flex-shrink-0 snap-start min-w-0 rounded-xl overflow-hidden bg-white border border-slate-200 shadow-sm hover:shadow-md transition-all cursor-pointer",
                              thingsToDoScrollOnMd
                                ? "w-[min(82vw,200px)] sm:w-44 md:w-44"
                                : "w-[min(82vw,200px)] sm:w-44 md:w-auto md:flex-1 md:max-w-none",
                            ].join(" ")}
                          >
                            <div className="relative mx-1 mt-1 h-16 md:h-[4.25rem] bg-gradient-to-br from-slate-100 to-slate-200 rounded-lg overflow-hidden">
                              {experience.imageUrl ? (
                                <img src={experience.imageUrl} alt={experience.title} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center"><span className="text-xl">{experience.type === "viator" ? "🎫" : "🏔️"}</span></div>
                              )}
                            </div>
                            <div className="p-2 flex flex-col flex-1 min-w-0 min-h-[4.5rem]">
                              <h3 className="font-semibold text-slate-900 text-[11px] leading-tight mb-1 text-left line-clamp-2">{experience.title}</h3>
                              {experience.rating && (
                                <div className="flex items-center gap-1 text-[10px] text-slate-600 mb-1">
                                  <Star className="w-3 h-3 fill-yellow-400 text-yellow-400 shrink-0" />
                                  <span>{experience.rating}</span>
                                  {experience.totalReviews && <span className="text-slate-400 truncate">({experience.totalReviews})</span>}
                                </div>
                              )}
                              {experience.price && <div className="text-[10px] text-slate-600 mb-1 line-clamp-1">{experience.price}</div>}
                              {onAddToItinerary && (
                                <div className="flex flex-col gap-1 mt-auto w-full">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const originalExp = experience.type === "viator"
                                        ? viatorProducts.find((p) => p.id === experience.id)
                                        : walkingExperiences.find((exp) => exp.id === experience.id);
                                      if (originalExp) {
                                        onAddToItinerary(
                                          originalExp,
                                          destinationName,
                                          selectedDay.date,
                                          selectedDay.location
                                        );
                                      }
                                    }}
                                    className="inline-flex w-full items-center justify-center rounded-full px-2 py-1 text-[10px] font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                                  >
                                    Add to Trip
                                  </button>
                                  {experience.type === "viator" && (
                                    <a
                                      href={experience.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="inline-flex w-full items-center justify-center rounded-full px-2 py-1 text-[10px] font-medium text-white bg-gradient-to-r from-emerald-500 to-teal-600 hover:opacity-90 transition-opacity text-center"
                                    >
                                      Book now
                                    </a>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-slate-500 text-center py-4">No experiences found</div>
                  )}
                  {onAddManualTripEntry && onRemoveManualTripEntry && (
                    <div className="mt-3 pt-3 border-t border-slate-100/90">
                      <ManualEntryInline
                        section="thingsToDo"
                        entries={manualThings}
                        locationBias={destinationLocationCoords}
                        onAdd={(e) => onAddManualTripEntry(selectedDay.date, selectedDay.location, e)}
                        onRemove={(id) => onRemoveManualTripEntry(selectedDay.date, selectedDay.location, id)}
                      />
                    </div>
                  )}
                </div>
              </div>

              {showEventsCarousel && selectedLocation && (
                <>
                  {/* Added events - same pattern as "Things to do" added items: light green container, same tile size */}
                  {detail.events && detail.events.length > 0 && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                      <div className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory scroll-smooth">
                        {detail.events.map((event) => (
                          <div
                            key={`event-${event.id}`}
                            className="relative flex flex-col flex-shrink-0 w-32 md:w-36 rounded-lg overflow-hidden bg-white border border-emerald-200 shadow-sm hover:shadow-md transition-all snap-start"
                          >
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onRemoveEventFromDay?.(selectedDay.date, selectedDay.location, event.id);
                              }}
                              className="absolute top-0.5 right-0.5 z-10 w-4 h-4 rounded-full bg-slate-800/80 text-white flex items-center justify-center hover:bg-slate-700 transition-colors"
                              aria-label="Remove event from day"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                            <div className="relative w-full aspect-[3/2] bg-gradient-to-br from-slate-100 to-slate-200">
                              {event.imageUrl ? (
                                <img
                                  src={event.imageUrl}
                                  alt={event.name}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    e.currentTarget.style.display = "none";
                                  }}
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <span className="text-sm">🎫</span>
                                </div>
                              )}
                            </div>
                            <div className="p-1 flex flex-col flex-1 min-h-0">
                              <h3 className="font-medium text-slate-900 text-[10px] md:text-xs text-left line-clamp-2 leading-tight">
                                <a
                                  href={event.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="hover:text-indigo-600 transition-colors"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {event.name}
                                </a>
                              </h3>
                              {event.datetime_summary && (
                                <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">
                                  {event.datetime_summary}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div ref={eventsCarouselRef} className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                    <div className="flex items-center mb-3">
                      <Ticket className="w-4 h-4 text-indigo-600" />
                      <h4 className="text-sm font-semibold text-slate-900">Discover local events</h4>
                    </div>
                    {eventsLoading ? (
                      <div className="text-xs text-slate-600 text-center py-4">Loading events...</div>
                    ) : allEvents.length > 0 ? (
                      <EventsAttractionsCarousel
                        events={allEvents}
                        targetDate={selectedDay.date}
                        size="compact"
                        onPinEvent={(event) => onEventHearted?.(event, selectedDay.date, selectedDay.location)}
                        pinnedEventIds={detail?.events ? new Set(detail.events.map((e) => e.id)) : undefined}
                        onRequireAuth={(event) => onRequireAuth?.(event, selectedDay.date, selectedDay.location)}
                      />
                    ) : (
                      <div className="text-xs text-slate-500 text-center py-4">No events found for this day</div>
                    )}
                    {onAddManualTripEntry && onRemoveManualTripEntry && (
                      <div className="mt-3 pt-3 border-t border-slate-100/90">
                        <ManualEntryInline
                          section="events"
                          entries={manualEvents}
                          locationBias={destinationLocationCoords}
                          onAdd={(e) => onAddManualTripEntry(selectedDay.date, selectedDay.location, e)}
                          onRemove={(id) => onRemoveManualTripEntry(selectedDay.date, selectedDay.location, id)}
                        />
                      </div>
                    )}
                  </div>

                </>
              )}

              {shouldShowTimeline && selectedLocation && (
                <div ref={hotelCardRef} className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <Bed className="w-4 h-4 text-indigo-600 shrink-0" aria-hidden />
                      <h4 className="text-sm font-semibold text-slate-900">Where to stay</h4>
                    </div>
                    {onShowNearbyHotelsMap && (
                      <button
                        type="button"
                        onClick={onShowNearbyHotelsMap}
                        disabled={!canLoadNearbyPlaces}
                        title={!canLoadNearbyPlaces ? "Location not ready yet" : undefined}
                        className="shrink-0 inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 border border-indigo-200 rounded hover:bg-indigo-50 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                      >
                        <MapPin className="w-3.5 h-3.5" aria-hidden />
                        Map view
                      </button>
                    )}
                  </div>
                  {hasManualHotel ? (
                    onAddManualTripEntry && onRemoveManualTripEntry ? (
                      <ManualEntryInline
                        section="hotel"
                        entries={manualHotels}
                        locationBias={destinationLocationCoords}
                        onAdd={(e) => onAddManualTripEntry(selectedDay.date, selectedDay.location, e)}
                        onRemove={(id) => onRemoveManualTripEntry(selectedDay.date, selectedDay.location, id)}
                      />
                    ) : null
                  ) : (
                    <>
                      {!canLoadNearbyPlaces || nearbyHotelsLoading ? (
                        <div className="text-xs text-slate-600 text-center py-4">Loading hotels…</div>
                      ) : nearbyHotelsError ? (
                        <div className="text-xs text-slate-500 text-center py-4">{nearbyHotelsError}</div>
                      ) : topRatedHotelsNearby.length > 0 ? (
                        <>
                          <p className="text-xs text-slate-500 mb-2">
                            Top nearby hotels by rating and review count.
                          </p>
                          <NearbyPlacesCarousel
                            places={topRatedHotelsNearby}
                            title="Top nearby hotels"
                            size="compact"
                            showUserRatingCount
                            showDirectionsLink
                          />
                        </>
                      ) : (
                        <div className="text-xs text-slate-500 text-center py-4">
                          No nearby hotels found for this area.
                        </div>
                      )}
                      {onAddManualTripEntry && onRemoveManualTripEntry && (
                        <div className="mt-3 pt-3 border-t border-slate-100/90">
                          <ManualEntryInline
                            section="hotel"
                            entries={manualHotels}
                            locationBias={destinationLocationCoords}
                            onAdd={(e) => onAddManualTripEntry(selectedDay.date, selectedDay.location, e)}
                            onRemove={(id) => onRemoveManualTripEntry(selectedDay.date, selectedDay.location, id)}
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {shouldShowTimeline && selectedLocation && (
                <div ref={nearbyPlacesCardRef} className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <Utensils className="w-4 h-4 text-indigo-600 shrink-0" />
                      <h4 className="text-sm font-semibold text-slate-900">Nearby places to eat</h4>
                    </div>
                    {onShowNearbyRestaurantsMap && (
                      <button
                        type="button"
                        onClick={onShowNearbyRestaurantsMap}
                        disabled={!canLoadRestaurantNearbySearch}
                        title={
                          !canLoadRestaurantNearbySearch
                            ? hasManualHotel
                              ? "Pick your hotel from search so we can anchor restaurants"
                              : "Location not ready yet"
                            : undefined
                        }
                        className="shrink-0 inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 border border-indigo-200 rounded hover:bg-indigo-50 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                      >
                        <MapPin className="w-3.5 h-3.5" aria-hidden />
                        Map view
                      </button>
                    )}
                  </div>
                  {hasManualHotel && !resolvedHotelCoords ? (
                    <div className="text-xs text-slate-500 text-center py-4">
                      Nearby places to eat open once your hotel is chosen from Google search—we anchor the list to that
                      spot.
                    </div>
                  ) : !canLoadRestaurantNearbySearch || nearbyRestaurantsLoading ? (
                    <div className="text-xs text-slate-600 text-center py-4">Loading places...</div>
                  ) : nearbyRestaurantsError ? (
                    <div className="text-xs text-slate-500 text-center py-4">{nearbyRestaurantsError}</div>
                  ) : topRestaurantsNearby.length > 0 ? (
                    <NearbyPlacesCarousel
                      places={topRestaurantsNearby}
                      title="Nearby places to eat"
                      size="compact"
                      showUserRatingCount
                      showDirectionsLink
                    />
                  ) : (
                    <div className="text-xs text-slate-500 text-center py-4">No nearby places found</div>
                  )}
                  {onAddManualTripEntry && onRemoveManualTripEntry && (
                    <div className="mt-3 pt-3 border-t border-slate-100/90">
                      <ManualEntryInline
                        section="restaurant"
                        entries={manualRestaurants}
                        locationBias={destinationLocationCoords}
                        onAdd={(e) => onAddManualTripEntry(selectedDay.date, selectedDay.location, e)}
                        onRemove={(id) => onRemoveManualTripEntry(selectedDay.date, selectedDay.location, id)}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
