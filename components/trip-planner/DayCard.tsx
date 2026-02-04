"use client";

import { useMemo, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { TripPlan } from "@/lib/itinerary";
import { formatDisplayDate, type DayDetail } from "@/lib/trip-planner/utils";
import EventsAttractionsCarousel from "@/components/trip-planner/EventsAttractionsCarousel";
import { useEvents } from "@/lib/hooks/useEvents";
import { getCityById, NZ_CITIES, searchPlacesByName, type NzCity } from "@/lib/nzCities";

type TripDay = TripPlan["days"][number];

type Props = {
  day: TripDay;
  isOpen: boolean;
  detail?: DayDetail;

  onToggleOpen: () => void;
  onUpdateNotes: (notes: string) => void;
  onUpdateAccommodation: (accommodation: string) => void;

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

  return (
    <div className="rounded-2xl bg-slate-50 border border-slate-200 overflow-hidden">
      <div className="px-3 py-3">
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
            </div>
          </div>

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
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-xs font-semibold text-slate-900">
                Day {day.dayNumber}
              </div>
              <span className="text-[11px] text-slate-700">
                {formatDisplayDate(day.date)}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onToggleOpen}
            className="px-2.5 py-1.5 rounded-full border border-slate-300 text-xs hover:bg-slate-100 text-slate-900"
          >
            {isOpen ? "Hide details" : "Day details"}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="px-3 pb-3">
          <div className="rounded-xl bg-white border border-slate-200 p-3 space-y-3">
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
                  <EventsAttractionsCarousel events={events} />
                )}
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
