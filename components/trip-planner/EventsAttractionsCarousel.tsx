"use client";

import { useState, useEffect } from "react";
import { Heart } from "lucide-react";
import type { Event } from "@/lib/hooks/useEvents";
import { saveEventToCache } from "@/lib/events.api";
import { useAuth } from "@/components/AuthProvider";

type Props = {
  events?: Event[];
  /** Itinerary day (YYYY-MM-DD). When provided, we can display this day as the date while keeping the event start time. */
  targetDate?: string;
  onPinEvent?: (event: Event) => void; // Called when heart is clicked to pin event to current day
  pinnedEventIds?: Set<number>; // Events already pinned to this day
  onRequireAuth?: (event: Event) => void; // Called when authentication is required
};

/** Format event start as "Sat, Jun 13, 2:30pm" using datetime_start when available. */
function extractLocalYmd(isoOrDate: string): string | null {
  if (!isoOrDate) return null;
  const d = isoOrDate.length === 10 ? new Date(isoOrDate + "T00:00:00") : new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatEventDateWithTime(event: Event, targetDate?: string): string {
  if (!event.datetime_start) return event.datetime_summary ?? "";
  const start = new Date(event.datetime_start);
  if (Number.isNaN(start.getTime())) return event.datetime_summary ?? "";

  const startDateLocal = extractLocalYmd(event.datetime_start);
  const shouldUseTargetDate = !!targetDate && !!startDateLocal && targetDate !== startDateLocal;

  const dateForDisplay = shouldUseTargetDate ? new Date(targetDate + "T00:00:00") : start;
  const datePart = dateForDisplay.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  // Always keep the time from the event's start time.
  const timePart = start.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${datePart}, ${timePart}`;
}

export default function EventsAttractionsCarousel({ events = [], targetDate, onPinEvent, pinnedEventIds, onRequireAuth }: Props) {
  const { user } = useAuth();

  // Track which events are hearted (saved to cache) - combine with pinned events
  const [heartedEvents, setHeartedEvents] = useState<Set<number>>(new Set());
  const [savingEventId, setSavingEventId] = useState<number | null>(null);

  // When user removes an event from the day (X button), revert its heart in the carousel
  const pinnedIdsSerialized = [...(pinnedEventIds || [])].sort((a, b) => a - b).join(",");
  useEffect(() => {
    if (!pinnedEventIds) return;
    setHeartedEvents((prev) => {
      let changed = false;
      const next = new Set(prev);
      next.forEach((id) => {
        if (!pinnedEventIds.has(id)) {
          next.delete(id);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [pinnedIdsSerialized]);

  // Combine local hearted events with pinned events from props
  const allHeartedEvents = new Set([
    ...heartedEvents,
    ...(pinnedEventIds || [])
  ]);

  // Don't render if no events
  if (events.length === 0) {
    return null;
  }

  const handleHeartClick = async (event: Event, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // If already hearted or pinned, don't do anything (or could allow un-hearting later)
    if (allHeartedEvents.has(event.id)) {
      return;
    }

    // Check if user is authenticated
    if (!user) {
      // Call onRequireAuth callback if provided, which will show auth modal
      if (onRequireAuth) {
        onRequireAuth(event);
      }
      return;
    }

    setSavingEventId(event.id);

    try {
      const result = await saveEventToCache(event);
      if (result.success) {
        setHeartedEvents((prev) => new Set(prev).add(event.id));
        // Pin event to the current day
        if (onPinEvent) {
          onPinEvent(event);
        }
      } else {
        console.error("Failed to save event:", result.error);
        // Could show a toast notification here
      }
    } catch (err) {
      console.error("Error saving event:", err);
    } finally {
      setSavingEventId(null);
    }
  };

  return (
    <div className="relative">
      {/* Scroll container - same max-width and card size as Things to do carousel */}
      <div
        className={[
          "flex gap-0 md:gap-4 overflow-x-auto pb-2 scroll-smooth",
          "w-full snap-x snap-mandatory",
        ].join(" ")}
      >
        {events.map((event) => (
          <div
            key={event.id}
            data-carousel-item
            className="flex-shrink-0 w-full md:w-56 snap-start"
          >
            <div className="flex flex-col flex-shrink-0 h-full rounded-xl overflow-hidden bg-white border border-slate-200 shadow-sm hover:shadow-md transition-all">
              {/* Image - same fixed height as Things to do cards */}
              <div className="relative mx-1 mt-1 h-20 md:h-24 flex-shrink-0 bg-slate-200 rounded-lg overflow-hidden">
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
                {/* Heart icon overlay */}
                <button
                  type="button"
                  onClick={(e) => handleHeartClick(event, e)}
                  disabled={savingEventId === event.id}
                  className={[
                    "absolute top-1 right-1 p-1 rounded-full transition-all",
                    "bg-white/90 backdrop-blur-sm shadow-sm",
                    "hover:bg-white hover:scale-110",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    allHeartedEvents.has(event.id)
                      ? "text-red-500"
                      : "text-slate-600 hover:text-red-500",
                  ].join(" ")}
                  aria-label={allHeartedEvents.has(event.id) ? "Event saved" : "Save event"}
                >
                  <Heart
                    className={[
                      "w-3 h-3 transition-all",
                      allHeartedEvents.has(event.id) ? "fill-current" : "",
                    ].join(" ")}
                  />
                </button>
              </div>
              {/* Content - fixed height so all cards align; title + date + description slot */}
              <div className="p-2 flex flex-col min-w-0 min-h-[72px] md:min-h-[76px]">
                <h4 className="font-semibold text-slate-900 text-xs md:text-sm mb-0.5 text-left line-clamp-2">
                  <a
                    href={event.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-indigo-600 transition-colors line-clamp-2"
                  >
                    {event.name}
                  </a>
                </h4>
                <p className="text-[10px] text-slate-600 mb-1 flex-shrink-0 min-h-[14px]">
                  {formatEventDateWithTime(event, targetDate) || event.datetime_summary || "\u00A0"}
                </p>
                {event.description ? (
                  <p className="text-[10px] text-slate-500 line-clamp-2 min-h-[2.5rem]">
                    {event.description}
                  </p>
                ) : (
                  <p className="text-[10px] text-slate-500 line-clamp-2 min-h-[2.5rem]" aria-hidden />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}

