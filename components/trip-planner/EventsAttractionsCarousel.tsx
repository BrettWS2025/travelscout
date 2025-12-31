"use client";

import { useRef, useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type EventAttraction = {
  id: string;
  title: string;
  // Additional fields will be added when API is integrated
};

type Props = {
  items?: EventAttraction[];
};

export default function EventsAttractionsCarousel({ items = [] }: Props) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  
  // For mobile swipe
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Generate placeholder items (3 for now)
  const displayItems: EventAttraction[] = items.length > 0 
    ? items 
    : Array.from({ length: 3 }, (_, i) => ({
        id: `placeholder-${i}`,
        title: `Event or Attraction ${i + 1}`,
      }));

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
        setCurrentIndex(Math.max(0, Math.min(scrollIndex, displayItems.length - 1)));
      }
    };

    container.addEventListener("scroll", handleScroll);
    window.addEventListener("resize", checkScrollButtons);
    return () => {
      container.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", checkScrollButtons);
    };
  }, [displayItems.length]);

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

    if (isLeftSwipe && currentIndex < displayItems.length - 1) {
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
  }, [currentIndex, displayItems.length]);

  return (
    <div className="relative">
      {/* Desktop: Show arrows */}
      <div className="hidden md:flex items-center gap-2 mb-3">
        <button
          type="button"
          onClick={() => scroll("left")}
          disabled={!canScrollLeft}
          className={[
            "p-1.5 rounded-lg border border-white/20 transition",
            canScrollLeft
              ? "hover:bg-white/10 cursor-pointer"
              : "opacity-40 cursor-not-allowed",
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
            "p-1.5 rounded-lg border border-white/20 transition",
            canScrollRight
              ? "hover:bg-white/10 cursor-pointer"
              : "opacity-40 cursor-not-allowed",
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
        {displayItems.map((item, index) => (
          <div
            key={item.id}
            data-carousel-item
            className={[
              "flex-shrink-0 snap-start",
              // Mobile: full width (gap handled by flexbox)
              "w-full",
              // Desktop: show 3 items - (100% - 2 gaps of 0.75rem each) / 3
              "md:w-[calc((100%-1.5rem)/3)]",
            ].join(" ")}
          >
            <div className="rounded-xl bg-white/5 border border-white/10 p-4 h-full">
              <div className="aspect-video bg-white/5 rounded-lg mb-3 flex items-center justify-center">
                <span className="text-xs text-gray-400">Image placeholder</span>
              </div>
              <h4 className="text-sm font-semibold text-white mb-1">
                {item.title}
              </h4>
              <p className="text-xs text-gray-400 line-clamp-2">
                Description placeholder text for event or attraction details.
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Mobile: Show indicators */}
      <div className="md:hidden flex items-center justify-center gap-2 mt-3">
        {displayItems.map((_, index) => (
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

