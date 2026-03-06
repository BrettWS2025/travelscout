"use client";

import { useMemo, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { TripPlan } from "@/lib/itinerary";
import { formatDisplayDate, type DayDetail } from "@/lib/trip-planner/utils";
import EventsAttractionsCarousel from "@/components/trip-planner/EventsAttractionsCarousel";
import { useEvents, type Event } from "@/lib/hooks/useEvents";
import { getCityById, NZ_CITIES, searchPlacesByName, type NzCity } from "@/lib/nzCities";
import ExperienceCard from "@/components/trip-planner/ExperienceCard";
import { X } from "lucide-react";

type TripDay = TripPlan["days"][number];

/**
 * Calculate the duration of an event in nights
 * Returns null if we can't determine the duration
 */
function getEventDurationNights(event: Event): number | null {
  if (!event.datetime_start) return null;
  
  if (!event.datetime_end) {
    // Single day event
    return 0;
  }
  
  const start = new Date(event.datetime_start);
  const end = new Date(event.datetime_end);
  const diffTime = end.getTime() - start.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  // Convert days to nights (1 day = 0 nights, 2 days = 1 night, etc.)
  return Math.max(0, diffDays - 1);
}

/**
 * Check if an event is a "featured event" (single day only, no date range)
 */
function isFeaturedEvent(event: Event): boolean {
  const nights = getEventDurationNights(event);
  return nights !== null && nights === 0;
}

/**
 * Sort events by priority:
 * 1. 1 day only events first (0 nights)
 * 2. 2 day only events second (1 night)
 * 3. 3 day only events third (2 nights)
 * 4. Then alphabetical by name
 */
function sortEventsByPriority(events: Event[]): Event[] {
  return [...events].sort((a, b) => {
    const nightsA = getEventDurationNights(a);
    const nightsB = getEventDurationNights(b);
    
    // Priority: 0 nights (1 day) > 1 night (2 days) > 2 nights (3 days) > others
    if (nightsA === 0 && nightsB !== 0) return -1;
    if (nightsA !== 0 && nightsB === 0) return 1;
    if (nightsA === 1 && nightsB !== 1) return -1;
    if (nightsA !== 1 && nightsB === 1) return 1;
    if (nightsA === 2 && nightsB !== 2) return -1;
    if (nightsA !== 2 && nightsB === 2) return 1;
    
    // For same priority or non-featured events, sort alphabetically
    const nameA = (a.name || '').toLowerCase();
    const nameB = (b.name || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });
}

type Props = {
  day: TripDay;
  isOpen: boolean;
  detail?: DayDetail;

  onToggleOpen: () => void;
  onUpdateNotes: (notes: string) => void;
  onUpdateAccommodation: (accommodation: string) => void;
  onRemoveExperience?: (experienceId: string) => void;
  onRemoveEvent?: (eventId: number) => void;
  onRemoveViatorProduct?: (productId: string) => void;
  onEventHearted?: (event: Event, date: string, location: string) => void;

  /** Optional: render extra content inside the expanded panel (e.g. attraction / ticket options). */
  children?: ReactNode;
};

export default function DayCard({
  day,
  isOpen,
  detail,
  onToggleOpen,
  onUpdateNotes,
  onUpdateAccommodation,
  onRemoveExperience,
  onRemoveEvent,
  onRemoveViatorProduct,
  onEventHearted,
  children,
}: Props) {
  // Find location coordinates by matching location name
  // Try to match by city ID first, then by name, then search database
  const [locationCoords, setLocationCoords] = useState<{ lat: number; lng: number } | undefined>(undefined);

  useEffect(() => {
    // First try to find by city ID if location matches an ID pattern
    const city = getCityById(day.location);
    if (city) {
      setLocationCoords({ lat: city.lat, lng: city.lng });
      return;
    }
    
    // Try to find by name in NZ_CITIES (fallback data or cached)
    const place = NZ_CITIES.find((p: NzCity) => 
      p.name.toLowerCase() === day.location.toLowerCase()
    );
    if (place) {
      setLocationCoords({ lat: place.lat, lng: place.lng });
      return;
    }
    
    // Last resort: search database for the place
    searchPlacesByName(day.location, 1).then((results) => {
      if (results.length > 0) {
        const found = results[0];
        setLocationCoords({ lat: found.lat, lng: found.lng });
      } else {
        setLocationCoords(undefined);
      }
    }).catch(() => {
      setLocationCoords(undefined);
    });
  }, [day.location]);

  // Fetch events for this day
  const { events, loading } = useEvents(
    day.date,
    day.location,
    locationCoords?.lat,
    locationCoords?.lng
  );

  // Sort events by priority (1 night, 2 night, 3 night, then alphabetical)
  const sortedEvents = useMemo(() => {
    return sortEventsByPriority(events);
  }, [events]);

  // Get featured events (single day only, no date range) for preview when collapsed
  // Mobile: 1 event, Desktop: 2 events
  const featuredEvents = useMemo(() => {
    const featured = sortedEvents.filter(isFeaturedEvent);
    return featured.slice(0, 2);
  }, [sortedEvents]);
  
  const featuredEventsMobile = useMemo(() => {
    const featured = sortedEvents.filter(isFeaturedEvent);
    return featured.slice(0, 1);
  }, [sortedEvents]);

  return (
    <div className={[
      "rounded-2xl bg-white shadow-[0_1px_8px_rgba(0,0,0,0.06)] border border-slate-100/50 transition-all duration-200 ease-in-out hover:shadow-[0_2px_12px_rgba(0,0,0,0.1)] overflow-hidden",
      loading ? "event-loading-shimmer" : ""
    ].join(" ")}>
      <div className="px-4 py-3 relative z-0">
        {/* Mobile: Stacked layout */}
        <div className="md:hidden space-y-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-sm font-semibold text-slate-900">
                Day {day.dayNumber}
              </div>
              <span className="text-[11px] text-slate-700">
                {formatDisplayDate(day.date)}
              </span>
              {!loading && events.length > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-semibold">
                  {events.length} {events.length === 1 ? 'event' : 'events'}
                </span>
              )}
            </div>
          </div>

          {/* Experience Cards - shown when collapsed */}
          {!isOpen && detail?.experiences && detail.experiences.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {detail.experiences.map((experience) => (
                <ExperienceCard
                  key={experience.id}
                  experience={experience}
                  onRemove={onRemoveExperience ? () => onRemoveExperience(experience.id) : undefined}
                />
              ))}
            </div>
          )}

          {/* Featured events preview when collapsed - Mobile: 1 event */}
          {!isOpen && !loading && featuredEventsMobile.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-slate-700">Featured events</div>
              {featuredEventsMobile.map((event) => (
                <a
                  key={event.id}
                  href={event.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-lg border border-indigo-200 bg-indigo-50/50 p-2.5 hover:bg-indigo-100 transition-colors"
                >
                  <div className="flex items-start gap-2.5">
                    <div className="flex-shrink-0 w-16 h-16 rounded-md overflow-hidden bg-slate-200 flex items-center justify-center">
                      {event.imageUrl ? (
                        <img
                          src={event.imageUrl}
                          alt={event.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = "none";
                            const placeholder = target.nextElementSibling as HTMLElement;
                            if (placeholder) placeholder.style.display = "flex";
                          }}
                        />
                      ) : null}
                      <div
                        className={[
                          "w-full h-full flex items-center justify-center",
                          event.imageUrl ? "hidden" : "",
                        ].join(" ")}
                      >
                        <span className="text-[10px] text-slate-500">No image</span>
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs font-semibold text-slate-900 mb-0.5 line-clamp-1">
                        {event.name}
                      </h4>
                      {event.datetime_summary && (
                        <p className="text-[10px] text-slate-600 mb-1">
                          {event.datetime_summary}
                        </p>
                      )}
                      {event.description && (
                        <p className="text-[10px] text-slate-700 line-clamp-2">
                          {event.description}
                        </p>
                      )}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={onToggleOpen}
            className="w-full py-2.5 rounded-xl border border-slate-300 text-sm font-medium hover:bg-slate-100 active:bg-slate-200 transition text-slate-900"
          >
            {isOpen ? "Hide details" : "Day details"}
          </button>
        </div>

        {/* Desktop: Horizontal layout */}
        <div className="hidden md:flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-xs font-semibold text-slate-900">
                Day {day.dayNumber}
              </div>
              <span className="text-[11px] text-slate-700">
                {formatDisplayDate(day.date)}
              </span>
              {!loading && events.length > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-semibold">
                  {events.length} {events.length === 1 ? 'event' : 'events'}
                </span>
              )}
            </div>

            {/* Experience Cards - shown when collapsed */}
            {!isOpen && detail?.experiences && detail.experiences.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {detail.experiences.map((experience) => (
                  <ExperienceCard
                    key={experience.id}
                    experience={experience}
                    onRemove={onRemoveExperience ? () => onRemoveExperience(experience.id) : undefined}
                  />
                ))}
              </div>
            )}
            
            {/* Featured events preview when collapsed (desktop) - Side by side */}
            {!isOpen && !loading && featuredEvents.length > 0 && (
              <div className="mt-2">
                <div className="text-xs font-medium text-slate-700 mb-1.5">Featured events</div>
                <div className="flex gap-2">
                  {featuredEvents.map((event) => (
                    <a
                      key={event.id}
                      href={event.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 flex items-center gap-2 rounded-md border border-indigo-200 bg-indigo-50/50 p-2 hover:bg-indigo-100 transition-colors group"
                    >
                      <div className="flex-shrink-0 w-12 h-12 rounded overflow-hidden bg-slate-200 flex items-center justify-center">
                        {event.imageUrl ? (
                          <img
                            src={event.imageUrl}
                            alt={event.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = "none";
                              const placeholder = target.nextElementSibling as HTMLElement;
                              if (placeholder) placeholder.style.display = "flex";
                            }}
                          />
                        ) : null}
                        <div
                          className={[
                            "w-full h-full flex items-center justify-center",
                            event.imageUrl ? "hidden" : "",
                          ].join(" ")}
                        >
                          <span className="text-[9px] text-slate-500">No image</span>
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-1">
                          {event.name}
                        </h4>
                        {event.datetime_summary && (
                          <p className="text-[10px] text-slate-600 mt-0.5">
                            {event.datetime_summary}
                          </p>
                        )}
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onToggleOpen}
            className="px-2.5 py-1.5 rounded-full border border-slate-300 text-xs hover:bg-slate-100 text-slate-900 flex-shrink-0"
          >
            {isOpen ? "Hide details" : "Day details"}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="px-4 pb-4">
          <div className="rounded-xl bg-slate-50/50 border border-slate-200/50 p-4 space-y-4 shadow-sm">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-900">
                  What I&apos;m doing on this day
                </label>
                <textarea
                  rows={3}
                  className="input-dark w-full text-xs"
                  placeholder="e.g. Morning in the city, afternoon gondola, dinner at ..."
                  value={detail?.notes ?? ""}
                  onChange={(e) => onUpdateNotes(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-900">
                  Where I&apos;m staying
                </label>
                <input
                  type="text"
                  className="input-dark w-full text-xs"
                  placeholder="e.g. Holiday park, hotel name, friend's place"
                  value={detail?.accommodation ?? ""}
                  onChange={(e) => onUpdateAccommodation(e.target.value)}
                />
              </div>
            </div>

            {/* Added Experiences and Events */}
            {((detail?.experiences && detail.experiences.length > 0) || (detail?.events && detail.events.length > 0) || (detail?.viatorProducts && detail.viatorProducts.length > 0)) && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-900">
                  Added Experiences and Events
                </label>
                <div className="flex flex-wrap gap-2">
                  {/* Experience Cards */}
                  {detail?.experiences && detail.experiences.map((experience) => (
                    <ExperienceCard
                      key={experience.id}
                      experience={experience}
                      onRemove={onRemoveExperience ? () => onRemoveExperience(experience.id) : undefined}
                    />
                  ))}
                  
                  {/* Pinned Events */}
                  {detail?.events && detail.events.map((event) => (
                    <div
                      key={event.id}
                      className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md border border-rose-200 bg-rose-50 hover:border-rose-300 transition-all max-w-full"
                    >
                      {/* Image - clickable link */}
                      <a
                        href={event.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0 w-6 h-6 rounded overflow-hidden bg-slate-200 flex items-center justify-center hover:opacity-90 transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {event.imageUrl ? (
                          <img
                            src={event.imageUrl}
                            alt={event.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = "none";
                              const placeholder = target.nextElementSibling as HTMLElement;
                              if (placeholder) placeholder.style.display = "flex";
                            }}
                          />
                        ) : null}
                        <div
                          className={[
                            "w-full h-full flex items-center justify-center",
                            event.imageUrl ? "hidden" : "",
                          ].join(" ")}
                        >
                          <span className="text-[8px] text-slate-500">🎪</span>
                        </div>
                      </a>
                      
                      {/* Name - clickable link */}
                      <a
                        href={event.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-slate-900 hover:text-rose-600 transition-colors line-clamp-2 min-w-0 flex-1"
                        onClick={(e) => e.stopPropagation()}
                        style={{ maxWidth: "calc(100% - 2.5rem)" }}
                      >
                        {event.name}
                      </a>

                      {/* Remove button */}
                      {onRemoveEvent && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveEvent(event.id);
                          }}
                          className="flex-shrink-0 p-0.5 hover:bg-rose-200 rounded transition-colors"
                          aria-label="Remove event"
                        >
                          <X className="w-3 h-3 text-slate-600" />
                        </button>
                      )}
                    </div>
                  ))}
                  
                  {/* Pinned Viator Products */}
                  {detail?.viatorProducts && detail.viatorProducts.map((product) => (
                    <div
                      key={product.id}
                      className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md border border-indigo-200 bg-indigo-50 hover:border-indigo-300 transition-all max-w-full"
                    >
                      {/* Image - clickable link */}
                      <a
                        href={product.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0 w-6 h-6 rounded overflow-hidden bg-slate-200 flex items-center justify-center hover:opacity-90 transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {product.imageUrl ? (
                          <img
                            src={product.imageUrl}
                            alt={product.title}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = "none";
                              const placeholder = target.nextElementSibling as HTMLElement;
                              if (placeholder) placeholder.style.display = "flex";
                            }}
                          />
                        ) : null}
                        <div
                          className={[
                            "w-full h-full flex items-center justify-center",
                            product.imageUrl ? "hidden" : "",
                          ].join(" ")}
                        >
                          <span className="text-[8px] text-slate-500">🎫</span>
                        </div>
                      </a>
                      
                      {/* Name - clickable link */}
                      <a
                        href={product.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-slate-900 hover:text-indigo-600 transition-colors line-clamp-2 min-w-0 flex-1"
                        onClick={(e) => e.stopPropagation()}
                        style={{ maxWidth: "calc(100% - 2.5rem)" }}
                      >
                        {product.title}
                      </a>

                      {/* Remove button */}
                      {onRemoveViatorProduct && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveViatorProduct(product.id);
                          }}
                          className="flex-shrink-0 p-0.5 hover:bg-indigo-200 rounded transition-colors"
                          aria-label="Remove Viator product"
                        >
                          <X className="w-3 h-3 text-slate-600" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Events and Attractions - only show if there are events */}
            {events.length > 0 && (
              <div className="pt-3 border-t border-slate-200">
                <div className="mb-2">
                  <h4 className="text-xs font-semibold text-slate-900">
                    Events & Attractions
                  </h4>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Available for this day
                  </p>
                </div>
                {loading ? (
                  <div className="text-xs text-slate-600">Loading events...</div>
                ) : (
                  <EventsAttractionsCarousel 
                    events={sortedEvents} 
                    onPinEvent={(event) => {
                      // Pin event to this day
                      if (onEventHearted) {
                        onEventHearted(event, day.date, day.location);
                      }
                    }}
                    pinnedEventIds={detail?.events ? new Set(detail.events.map(e => e.id)) : undefined}
                  />
                )}
              </div>
            )}

            {/* Pinned Viator Products - show in expanded view */}
            {detail?.viatorProducts && detail.viatorProducts.length > 0 && (
              <div className="pt-3 border-t border-slate-200">
                <div className="mb-2">
                  <h4 className="text-xs font-semibold text-slate-900">
                    Viator Activities
                  </h4>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Added to this day
                  </p>
                </div>
                <div className="space-y-2">
                  {detail.viatorProducts.map((product) => (
                    <a
                      key={product.id}
                      href={product.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-lg border border-indigo-200 bg-indigo-50/50 p-2.5 hover:bg-indigo-100 transition-colors"
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="flex-shrink-0 w-16 h-16 rounded-md overflow-hidden bg-slate-200 flex items-center justify-center">
                          {product.imageUrl ? (
                            <img
                              src={product.imageUrl}
                              alt={product.title}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = "none";
                                const placeholder = target.nextElementSibling as HTMLElement;
                                if (placeholder) placeholder.style.display = "flex";
                              }}
                            />
                          ) : null}
                          <div
                            className={[
                              "w-full h-full flex items-center justify-center",
                              product.imageUrl ? "hidden" : "",
                            ].join(" ")}
                          >
                            <span className="text-[10px] text-slate-500">🎫</span>
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-semibold text-slate-900 mb-0.5 line-clamp-1">
                            {product.title}
                          </h4>
                          {product.rating && (
                            <p className="text-[10px] text-slate-600 mb-1">
                              ⭐ {product.rating.toFixed(1)} {product.totalReviews ? `(${product.totalReviews} reviews)` : ''}
                            </p>
                          )}
                          {product.duration && (
                            <p className="text-[10px] text-slate-600 mb-1">
                              ⏱️ {product.duration}
                            </p>
                          )}
                          {product.price && (
                            <p className="text-[10px] text-slate-700 mb-1">
                              💰 {product.price}
                            </p>
                          )}
                          {product.description && (
                            <p className="text-[10px] text-slate-700 line-clamp-2">
                              {product.description}
                            </p>
                          )}
                        </div>
                        {onRemoveViatorProduct && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onRemoveViatorProduct(product.id);
                            }}
                            className="flex-shrink-0 p-1 hover:bg-indigo-200 rounded transition-colors"
                            aria-label="Remove Viator product"
                          >
                            <X className="w-3 h-3 text-slate-600" />
                          </button>
                        )}
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {children ? (
              <div className="pt-3 border-t border-slate-200">{children}</div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
