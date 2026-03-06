"use client";

import { useRef, useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Heart } from "lucide-react";
import type { Event } from "@/lib/hooks/useEvents";
import { saveEventToCache } from "@/lib/events.api";

type Props = {
  events?: Event[];
  onPinEvent?: (event: Event) => void; // Called when heart is clicked to pin event to current day
  pinnedEventIds?: Set<number>; // Events already pinned to this day
};

export default function EventsAttractionsCarousel({ events = [], onPinEvent, pinnedEventIds }: Props) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  
  // For mobile swipe
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  
  // Track which events are hearted (saved to cache) - combine with pinned events
  const [heartedEvents, setHeartedEvents] = useState<Set<number>>(new Set());
  const [savingEventId, setSavingEventId] = useState<number | null>(null);

  // Combine local hearted events with pinned events from props
  const allHeartedEvents = new Set([
    ...heartedEvents,
    ...(pinnedEventIds || [])
  ]);

  // Don't render if no events
  if (events.length === 0) {
    return null;
  }

  const checkScrollButtons = () => {
    if (!scrollContainerRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
  };

  useEffect(() => {
    checkScrollButtons();
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      checkScrollButtons();
      // Update mobile currentIndex based on scroll position
      const itemElement = container.querySelector('[data-carousel-item]') as HTMLElement;
      if (itemElement) {
        const itemWidth = itemElement.offsetWidth;
        const gap = 12; // gap-3 = 0.75rem = 12px
        const scrollIndex = Math.round(container.scrollLeft / (itemWidth + gap));
        setCurrentIndex(Math.max(0, Math.min(scrollIndex, events.length - 1)));
      }
    };

    container.addEventListener("scroll", handleScroll);
    window.addEventListener("resize", checkScrollButtons);
    return () => {
      container.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", checkScrollButtons);
    };
  }, [events.length]);

  const scroll = (direction: "left" | "right") => {
    if (!scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    const scrollAmount = container.clientWidth * 0.8; // Scroll ~80% of container width
    const newScrollLeft =
      direction === "left"
        ? container.scrollLeft - scrollAmount
        : container.scrollLeft + scrollAmount;

    container.scrollTo({
      left: newScrollLeft,
      behavior: "smooth",
    });
  };

  // Mobile swipe handlers
  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    touchEndX.current = null;
    touchStartX.current = e.targetTouches[0].clientX;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const onTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;

    const distance = touchStartX.current - touchEndX.current;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe && currentIndex < events.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
    if (isRightSwipe && currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  // For mobile, scroll to current index
  useEffect(() => {
    if (!scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    // On mobile, items are w-full, so scroll by container width + gap
    const itemElement = container.querySelector('[data-carousel-item]') as HTMLElement;
    if (itemElement) {
      const itemWidth = itemElement.offsetWidth;
      const gap = 12; // gap-3 = 0.75rem = 12px
      const scrollPosition = currentIndex * (itemWidth + gap);
      container.scrollTo({
        left: scrollPosition,
        behavior: "smooth",
      });
    }
  }, [currentIndex, events.length]);

  const handleHeartClick = async (event: Event, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // If already hearted or pinned, don't do anything (or could allow un-hearting later)
    if (allHeartedEvents.has(event.id)) {
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
      {/* Desktop: Show arrows */}
      <div className="hidden md:flex items-center gap-2 mb-3">
        <button
          type="button"
          onClick={() => scroll("left")}
          disabled={!canScrollLeft}
          className={[
            "p-1.5 rounded-lg border border-slate-400 bg-slate-300 transition",
            canScrollLeft
              ? "hover:bg-slate-400 cursor-pointer text-white"
              : "opacity-40 cursor-not-allowed text-white",
          ].join(" ")}
          aria-label="Scroll left"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => scroll("right")}
          disabled={!canScrollRight}
          className={[
            "p-1.5 rounded-lg border border-slate-400 bg-slate-300 transition",
            canScrollRight
              ? "hover:bg-slate-400 cursor-pointer text-white"
              : "opacity-40 cursor-not-allowed text-white",
          ].join(" ")}
          aria-label="Scroll right"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Scroll container */}
      <div
        ref={scrollContainerRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className={[
          "flex gap-3 overflow-x-auto scrollbar-hide",
          "snap-x snap-mandatory",
        ].join(" ")}
      >
        {events.map((event, index) => (
          <div
            key={event.id}
            data-carousel-item
            className={[
              "flex-shrink-0 snap-start",
              // Mobile: full width (gap handled by flexbox)
              "w-full",
              // Desktop: show 3 items - (100% - 2 gaps of 0.75rem each) / 3
              "md:w-[calc((100%-1.5rem)/3)]",
            ].join(" ")}
          >
            <div className="rounded-xl bg-slate-300 border border-slate-400 p-2.5">
              <div className="aspect-video bg-slate-400 rounded-lg mb-2 overflow-hidden relative group">
                {event.imageUrl ? (
                  <img
                    src={event.imageUrl}
                    alt={event.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      // Fallback to placeholder if image fails to load
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
                    "absolute top-2 right-2 p-1.5 rounded-full transition-all",
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
                      "w-4 h-4 transition-all",
                      allHeartedEvents.has(event.id) ? "fill-current" : "",
                    ].join(" ")}
                  />
                </button>
              </div>
              <h4 className="text-xs font-semibold text-slate-900 mb-0.5">
                <a
                  href={event.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-indigo-600 transition-colors"
                >
                  {event.name}
                </a>
              </h4>
              {event.datetime_summary && (
                <p className="text-[10px] text-slate-700 mb-1 font-medium">
                  {event.datetime_summary}
                </p>
              )}
              {event.description && (
                <p className="text-[10px] text-slate-800 line-clamp-2">
                  {event.description}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Mobile: Show indicators */}
      <div className="md:hidden flex items-center justify-center gap-2 mt-3">
        {events.map((_, index) => (
          <button
            key={index}
            type="button"
            onClick={() => setCurrentIndex(index)}
            className={[
              "h-2 rounded-full transition-all duration-200",
              index === currentIndex
                ? "bg-white/60 w-6"
                : "bg-white/20 w-2",
            ].join(" ")}
            aria-label={`Go to item ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

