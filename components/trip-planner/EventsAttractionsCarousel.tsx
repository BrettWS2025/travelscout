"use client";

import { useState, useEffect } from "react";
import type { Event } from "@/lib/hooks/useEvents";
import { saveEventToCache } from "@/lib/events.api";
import { useAuth } from "@/components/AuthProvider";

type Props = {
  events?: Event[];
  /** Itinerary day (YYYY-MM-DD). When provided, we can display this day as the date while keeping the event start time. */
  targetDate?: string;
  onPinEvent?: (event: Event) => void; // Called when Interested is clicked to pin event to current day
  pinnedEventIds?: Set<number>; // Events already marked interested for this day
  onRequireAuth?: (event: Event) => void; // Called when authentication is required
  /**
   * `compact`: narrower tiles; on `md+` equal-width columns so ~3 items fit without horizontal scroll.
   */
  size?: "default" | "compact";
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

export default function EventsAttractionsCarousel({
  events = [],
  targetDate,
  onPinEvent,
  pinnedEventIds,
  onRequireAuth,
  size = "default",
}: Props) {
  const { user } = useAuth();
  const isCompact = size === "compact";
  /** More than three: keep fixed-width tiles so ~3 fit in view and the rest scroll; otherwise equal flex columns. */
  const scrollOnMd = isCompact && events.length > 3;

  // Track locally interested events (saved to cache), merged with pinned events from props.
  const [interestedEvents, setInterestedEvents] = useState<Set<number>>(new Set());
  const [savingEventId, setSavingEventId] = useState<number | null>(null);

  // When user removes an event from the day (X button), revert its local interested state.
  const pinnedIdsSerialized = [...(pinnedEventIds || [])].sort((a, b) => a - b).join(",");
  useEffect(() => {
    if (!pinnedEventIds) return;
    setInterestedEvents((prev) => {
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

  // Combine local interested events with pinned events from props.
  const allInterestedEvents = new Set([
    ...interestedEvents,
    ...(pinnedEventIds || [])
  ]);

  // Don't render if no events
  if (events.length === 0) {
    return null;
  }

  const handleInterestedClick = async (event: Event, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (allInterestedEvents.has(event.id)) {
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
        setInterestedEvents((prev) => new Set(prev).add(event.id));
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

  const handleFindTicketsClick = (event: Event) => {
    // Best-effort cache write so ticket-clicked events are also present in cached_events.
    void saveEventToCache(event).then((result) => {
      if (!result.success) {
        console.error("Failed to cache event on Find Tickets click:", result.error);
      }
    }).catch((err) => {
      console.error("Error caching event on Find Tickets click:", err);
    });
  };

  return (
    <div className="relative">
      <div
        className={[
          "flex pb-2 scroll-smooth w-full snap-x snap-mandatory overflow-x-auto",
          isCompact ? "gap-2 md:gap-3" : "gap-0 md:gap-4",
          isCompact && !scrollOnMd ? "md:overflow-x-visible md:snap-none" : "",
        ].join(" ")}
      >
        {events.map((event) => (
          <div
            key={event.id}
            data-carousel-item
            className={[
              "flex-shrink-0 snap-start min-w-0",
              isCompact
                ? scrollOnMd
                  ? "w-[min(82vw,200px)] sm:w-44 md:w-44"
                  : "w-[min(82vw,200px)] sm:w-44 md:w-auto md:flex-1 md:max-w-none"
                : "w-full md:w-56",
            ].join(" ")}
          >
            <div className="flex flex-col flex-shrink-0 h-full rounded-xl overflow-hidden bg-white border border-slate-200 shadow-sm hover:shadow-md transition-all">
              <div
                className={[
                  "relative mx-1 mt-1 flex-shrink-0 bg-slate-200 rounded-lg overflow-hidden",
                  isCompact ? "h-16 md:h-[4.25rem]" : "h-20 md:h-24",
                ].join(" ")}
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
                  <span className="text-[10px] text-slate-500">No image</span>
                </div>
              </div>
              <div
                className={[
                  "p-2 flex flex-col flex-1 min-w-0",
                  isCompact ? "min-h-[4.5rem]" : "min-h-[72px] md:min-h-[76px]",
                ].join(" ")}
              >
                <h4
                  className={[
                    "font-semibold text-slate-900 mb-0.5 text-left line-clamp-2 min-h-[2rem]",
                    isCompact ? "text-[11px] leading-tight" : "text-xs md:text-sm",
                  ].join(" ")}
                >
                  <a
                    href={event.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-indigo-600 transition-colors line-clamp-2"
                  >
                    {event.name}
                  </a>
                </h4>
                <p className="text-[10px] text-slate-600 mb-1 flex-shrink-0 min-h-[14px] leading-snug">
                  {formatEventDateWithTime(event, targetDate) || event.datetime_summary || "\u00A0"}
                </p>
                {event.description ? (
                  <p
                    className={[
                      "text-slate-500 line-clamp-2",
                      isCompact ? "text-[10px] leading-snug min-h-[2.25rem]" : "text-[10px] min-h-[2.5rem]",
                    ].join(" ")}
                  >
                    {event.description}
                  </p>
                ) : (
                  <p
                    className={[
                      "text-slate-500 line-clamp-2",
                      isCompact ? "text-[10px] min-h-[2.25rem]" : "text-[10px] min-h-[2.5rem]",
                    ].join(" ")}
                    aria-hidden
                  />
                )}
                <div className="mt-auto pt-2 flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => handleInterestedClick(event, e)}
                    disabled={savingEventId === event.id || allInterestedEvents.has(event.id)}
                    className={[
                      "inline-flex items-center justify-center rounded-full border px-2 py-1 text-[10px] font-semibold transition-colors",
                      "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100",
                      "disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed",
                    ].join(" ")}
                  >
                    Interested
                  </button>
                  {event.url ? (
                    <a
                      href={event.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => handleFindTicketsClick(event)}
                      className="inline-flex items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors"
                    >
                      Find Tickets
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}

