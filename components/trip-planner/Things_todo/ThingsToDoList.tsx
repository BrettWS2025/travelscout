"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { ChevronLeft, ChevronRight, List, MapPin } from "lucide-react";
import {
  type WalkingExperience,
} from "@/lib/walkingExperiences";
import {
  transformWalkingExperience,
  type ExperienceItem,
} from "@/lib/viator-helpers";
import { useThingsToDo, useTags, type ViatorTag } from "@/lib/hooks/useThingsToDo";
import dynamic from "next/dynamic";

// Lazy load the map component to improve initial load performance
const ThingsToDoMap = dynamic(
  () => import("./ThingsToDoMap"),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[400px] flex items-center justify-center bg-slate-100 rounded-lg border border-slate-200">
        <div className="text-xs text-slate-500">Loading map...</div>
      </div>
    ),
  }
);

type ThingsToDoListProps = {
  location: string;
  onAddToItinerary?: (experience: WalkingExperience | ExperienceItem, location: string) => void;
};

const ITEMS_PER_PAGE = 12;

export default function ThingsToDoList({ location, onAddToItinerary }: ThingsToDoListProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const tagsScrollRef = useRef<HTMLDivElement>(null);
  
  // Tag filtering state
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [selectedWalkingFilter, setSelectedWalkingFilter] = useState(false);
  const [canScrollTagsLeft, setCanScrollTagsLeft] = useState(false);
  const [canScrollTagsRight, setCanScrollTagsRight] = useState(true);

  // Fetch things to do using React Query
  const {
    data: thingsToDoData,
    isLoading: loading,
    error: thingsToDoError,
  } = useThingsToDo(location);

  const walkingExperiences = thingsToDoData?.walkingExperiences || [];
  const viatorProducts = thingsToDoData?.viatorProducts || [];
  const error = thingsToDoError
    ? (thingsToDoError instanceof Error
        ? thingsToDoError.message
        : "Failed to load experiences")
    : null;

  // Fetch tags using React Query
  const {
    data: tagsData,
    isLoading: tagsLoading,
  } = useTags(viatorProducts);

  const tags = tagsData?.tags || [];
  const childTagToParentsMap = tagsData?.childTagToParentsMap || new Map();

  // Reset to first page and clear filters when location changes
  useEffect(() => {
    setCurrentPage(1);
    setSelectedTagIds([]);
    setSelectedWalkingFilter(false);
  }, [location]);

  // Check scroll buttons for tags
  const checkTagsScrollButtons = () => {
    if (!tagsScrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = tagsScrollRef.current;
    setCanScrollTagsLeft(scrollLeft > 0);
    setCanScrollTagsRight(scrollLeft < scrollWidth - clientWidth - 1);
  };

  // Scroll tags horizontally
  const scrollTags = (direction: "left" | "right") => {
    if (!tagsScrollRef.current) return;
    const scrollAmount = 200; // pixels to scroll
    const currentScroll = tagsScrollRef.current.scrollLeft;
    const maxScroll = tagsScrollRef.current.scrollWidth - tagsScrollRef.current.clientWidth;
    let newScroll: number;
    
    if (direction === "left") {
      newScroll = Math.max(0, currentScroll - scrollAmount);
    } else {
      newScroll = Math.min(maxScroll, currentScroll + scrollAmount);
    }
    
    tagsScrollRef.current.scrollTo({ left: newScroll, behavior: "smooth" });
    
    // Update button states after a short delay to account for smooth scrolling
    setTimeout(() => {
      checkTagsScrollButtons();
    }, 100);
  };


  // Update scroll buttons when tags change or container resizes
  useEffect(() => {
    checkTagsScrollButtons();
    const container = tagsScrollRef.current;
    if (!container) return;

    const handleScroll = () => checkTagsScrollButtons();
    container.addEventListener("scroll", handleScroll);
    window.addEventListener("resize", checkTagsScrollButtons);
    
    return () => {
      container.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", checkTagsScrollButtons);
    };
  }, [tags]);

  // Transform walking experiences to ExperienceItem and combine with Viator products
  // Deduplicate products by ID to prevent duplicate keys
  const allExperiences = useMemo(() => {
    const walking = walkingExperiences.map(transformWalkingExperience);
    
    // Deduplicate viator products by ID (in case same product appears multiple times)
    const seenIds = new Set<string>();
    const uniqueViatorProducts = viatorProducts.filter(product => {
      if (seenIds.has(product.id)) {
        console.warn(`[ThingsToDoList] Duplicate product detected and removed: ${product.id} - ${product.title}`);
        return false;
      }
      seenIds.add(product.id);
      return true;
    });
    
    return [...walking, ...uniqueViatorProducts];
  }, [walkingExperiences, viatorProducts]);

  // Helper function to parse duration to minutes for sorting
  const parseDurationToMinutes = (duration: string | undefined | null, durationInMinutes?: number): number => {
    // If we already have duration in minutes (from Viator), use that
    if (durationInMinutes !== undefined) {
      return durationInMinutes;
    }
    
    if (!duration) return Infinity; // Put items without duration at the end
    
    const durationStr = duration.toLowerCase().trim();
    
    // Try to parse formats like "2 to 60 days", "2-4 days", "2h 30m", "3h", "45m", "72h", etc.
    const dayMatch = durationStr.match(/(\d+)\s*(?:to|-)\s*(\d+)?\s*d/);
    const hourMatch = durationStr.match(/(\d+)\s*h/);
    const minuteMatch = durationStr.match(/(\d+)\s*m/);
    
    let totalMinutes = 0;
    
    if (dayMatch) {
      // Handle "2 to 60 days" or "2-4 days" - use the minimum for sorting
      const minDays = parseInt(dayMatch[1], 10);
      totalMinutes = minDays * 24 * 60; // Use minimum days
    } else {
      if (hourMatch) {
        totalMinutes += parseInt(hourMatch[1], 10) * 60;
      }
      if (minuteMatch) {
        totalMinutes += parseInt(minuteMatch[1], 10);
      }
    }
    
    // If no matches, try to parse as just a number (assume minutes)
    if (totalMinutes === 0) {
      const numberMatch = durationStr.match(/(\d+)/);
      if (numberMatch) {
        totalMinutes = parseInt(numberMatch[1], 10);
      }
    }
    
    return totalMinutes === 0 ? Infinity : totalMinutes;
  };

  // Filter and sort experiences
  const filteredAndSortedExperiences = useMemo(() => {
    // First filter by walking filter or tag filters
    let filtered = allExperiences;
    
    // If walking filter is selected, show only walking experiences
    if (selectedWalkingFilter) {
      filtered = allExperiences.filter(exp => exp.type === "walking");
    } 
    // If tag filters are selected (but not walking filter), show only matching Viator products
    else if (selectedTagIds.length > 0) {
      filtered = allExperiences.filter(exp => {
        // Walking experiences are excluded when tag filters are active
        if (exp.type !== "viator") return false;
        // Viator products must have at least one matching tag
        if (!exp.tagIds || exp.tagIds.length === 0) return false;
        
        // Check if product matches any selected parent tag
        return exp.tagIds.some(productTagId => {
          // Direct match: product has the parent tag directly
          if (selectedTagIds.includes(productTagId)) {
            return true;
          }
          
          // Indirect match: product has a child tag that references this parent
          const childParents = childTagToParentsMap.get(productTagId);
          if (childParents && Array.isArray(childParents)) {
            return childParents.some(parentId => selectedTagIds.includes(parentId));
          }
          
          return false;
        });
      });
    }
    
    // Then sort by duration (shortest to longest), then alphabetically for same duration
    return [...filtered].sort((a, b) => {
      // For Viator products, prefer durationInMinutes if available, otherwise parse duration string
      const aDuration = a.type === "viator" 
        ? (a.durationInMinutes !== undefined ? a.durationInMinutes : parseDurationToMinutes(a.duration))
        : parseDurationToMinutes(a.completion_time);
      const bDuration = b.type === "viator"
        ? (b.durationInMinutes !== undefined ? b.durationInMinutes : parseDurationToMinutes(b.duration))
        : parseDurationToMinutes(b.completion_time);
      
      // Sort by duration first
      if (aDuration !== bDuration) {
        return aDuration - bDuration;
      }
      
      // If same duration, sort alphabetically by title
      return a.title.localeCompare(b.title);
    });
  }, [allExperiences, selectedTagIds, selectedWalkingFilter, childTagToParentsMap]);

  // Use filteredAndSortedExperiences instead of sortedExperiences
  const sortedExperiences = filteredAndSortedExperiences;

  // Calculate pagination
  const totalPages = Math.ceil(sortedExperiences.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentPageExperiences = sortedExperiences.slice(startIndex, endIndex);

  const handlePreviousPage = () => {
    setCurrentPage((prev) => Math.max(1, prev - 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(totalPages, prev + 1));
  };

  // Scroll to top when page changes
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [currentPage]);

  // Count experiences with valid coordinates for map view
  // This must be called before any conditional returns to follow Rules of Hooks
  const experiencesWithCoords = useMemo(() => {
    return sortedExperiences.filter(
      (exp) => exp.latitude !== null && exp.longitude !== null && !isNaN(exp.latitude) && !isNaN(exp.longitude)
    );
  }, [sortedExperiences]);

  if (loading) {
    return (
      <div className="max-h-[calc(3*120px+2*12px+24px)] overflow-y-auto pr-2">
        <div className="text-xs text-slate-500 text-center py-4">Searching for things to do</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-h-[calc(3*120px+2*12px+24px)] overflow-y-auto pr-2">
        <div className="text-xs text-red-500 text-center py-4">{error}</div>
      </div>
    );
  }

  if (sortedExperiences.length === 0) {
    return (
      <div className="max-h-[calc(3*120px+2*12px+24px)] overflow-y-auto pr-2">
        <div className="text-xs text-slate-500 text-center py-4">
          No activities found for this location.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filter Section - show if we have walking experiences or tags/Viator products */}
      {(walkingExperiences.length > 0 || (tags.length > 0 && viatorProducts.length > 0)) && (
        <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
          <div className="flex items-center justify-end mb-2">
            {(selectedTagIds.length > 0 || selectedWalkingFilter) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedTagIds([]);
                  setSelectedWalkingFilter(false);
                  setCurrentPage(1);
                }}
                className="px-2 py-0.5 text-xs font-medium rounded bg-slate-200 text-slate-700 border border-slate-300 hover:bg-slate-300 transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>
          
          {/* Horizontal scrollable filters with navigation arrows on sides */}
          <div className="relative flex items-center gap-2">
            {/* Left arrow */}
            <button
              type="button"
              onClick={() => scrollTags("left")}
              disabled={!canScrollTagsLeft}
              className={[
                "p-1.5 rounded-full border transition flex-shrink-0",
                canScrollTagsLeft
                  ? "border-slate-400 bg-slate-200 hover:bg-slate-300 cursor-pointer"
                  : "border-slate-300 bg-slate-100 opacity-40 cursor-not-allowed"
              ].join(" ")}
              aria-label="Scroll filters left"
            >
              <ChevronLeft className="w-4 h-4 text-slate-600" />
            </button>

            {/* Scrollable filters container */}
            <div
              ref={tagsScrollRef}
              className="flex gap-2 overflow-x-auto scrollbar-hide flex-1"
            >
              {/* Nature Hike/Walk filter - always first if walking experiences exist */}
              {walkingExperiences.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (selectedWalkingFilter) {
                      setSelectedWalkingFilter(false);
                    } else {
                      setSelectedWalkingFilter(true);
                      setSelectedTagIds([]); // Clear tag filters when selecting walking filter
                    }
                    setCurrentPage(1); // Reset to first page when filter changes
                  }}
                  className={[
                    "px-2.5 py-1 text-xs font-medium rounded-full transition-colors border whitespace-nowrap flex-shrink-0",
                    selectedWalkingFilter
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white text-slate-700 border-slate-300 hover:border-indigo-400 hover:text-indigo-700"
                  ].join(" ")}
                  title="Filter to show only nature hikes and walking experiences"
                >
                  Nature Hike/Walk
                </button>
              )}
              
              {/* Viator tag filters */}
              {tags.length > 0 && viatorProducts.length > 0 && tags.map((tag) => {
                const isSelected = selectedTagIds.includes(tag.tag_id);
                // Extract English name from metadata, fallback to tag_name if not available
                const displayName = tag.metadata?.allNamesByLocale?.en || tag.tag_name;
                return (
                  <button
                    key={tag.tag_id}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        setSelectedTagIds(selectedTagIds.filter(id => id !== tag.tag_id));
                      } else {
                        setSelectedTagIds([...selectedTagIds, tag.tag_id]);
                        setSelectedWalkingFilter(false); // Clear walking filter when selecting tag filter
                      }
                      setCurrentPage(1); // Reset to first page when filter changes
                    }}
                    className={[
                      "px-2.5 py-1 text-xs font-medium rounded-full transition-colors border whitespace-nowrap flex-shrink-0",
                      isSelected
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-white text-slate-700 border-slate-300 hover:border-indigo-400 hover:text-indigo-700"
                    ].join(" ")}
                    title={tag.description || displayName}
                  >
                    {displayName}
                  </button>
                );
              })}
            </div>

            {/* Right arrow */}
            <button
              type="button"
              onClick={() => scrollTags("right")}
              disabled={!canScrollTagsRight}
              className={[
                "p-1.5 rounded-full border transition flex-shrink-0",
                canScrollTagsRight
                  ? "border-slate-400 bg-slate-200 hover:bg-slate-300 cursor-pointer"
                  : "border-slate-300 bg-slate-100 opacity-40 cursor-not-allowed"
              ].join(" ")}
              aria-label="Scroll filters right"
            >
              <ChevronRight className="w-4 h-4 text-slate-600" />
            </button>
          </div>
        </div>
      )}
      
      {/* View Toggle */}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setViewMode("list")}
          className={[
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
            viewMode === "list"
              ? "bg-slate-200 text-slate-900 border border-slate-300"
              : "bg-transparent text-slate-600 hover:text-slate-800 border border-slate-200 hover:border-slate-300",
          ].join(" ")}
        >
          <List className="w-3.5 h-3.5" />
          List
        </button>
        <button
          type="button"
          onClick={() => setViewMode("map")}
          disabled={experiencesWithCoords.length === 0}
          className={[
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
            viewMode === "map"
              ? "bg-slate-200 text-slate-900 border border-slate-300"
              : "bg-transparent text-slate-600 hover:text-slate-800 border border-slate-200 hover:border-slate-300",
            experiencesWithCoords.length === 0 ? "opacity-50 cursor-not-allowed" : "",
          ].join(" ")}
          title={experiencesWithCoords.length === 0 ? "No experiences with location data available" : "View on map"}
        >
          <MapPin className="w-3.5 h-3.5" />
          Map {experiencesWithCoords.length > 0 && `(${experiencesWithCoords.length})`}
        </button>
      </div>

      {/* Map View */}
      {viewMode === "map" && (
        <ThingsToDoMap
          experiences={sortedExperiences}
          onAddToItinerary={onAddToItinerary}
          location={location}
        />
      )}

      {/* List View */}
      {viewMode === "list" && (
        <div 
          ref={scrollContainerRef}
          className="overflow-y-auto pr-2"
        >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {currentPageExperiences.map((experience) => (
          <a
            key={experience.id}
            href={experience.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-xl bg-white border border-slate-200 overflow-hidden hover:shadow-md hover:border-slate-300 transition-all cursor-pointer flex flex-col"
          >
            {/* Thumbnail - Full width at top */}
            <div className="relative w-full aspect-[4/3] bg-slate-200">
              {experience.imageUrl ? (
                <img
                  src={experience.imageUrl}
                  alt={experience.title}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    // Hide image on error
                    e.currentTarget.style.display = "none";
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-2xl">{experience.type === "viator" ? "🎫" : "🏔️"}</span>
                </div>
              )}
              {/* Heart icon placeholder - top right */}
              <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center">
                <span className="text-xs">♡</span>
              </div>
            </div>
            
            {/* Content */}
            <div className="p-3 flex flex-col h-full">
                {/* Rating */}
                {experience.type === "viator" && experience.rating && (
                  <div className="flex items-center gap-1 mb-1.5">
                    <span className="text-xs font-medium text-green-600">⭐</span>
                    <span className="text-xs font-medium text-slate-900">{experience.rating.toFixed(1)}</span>
                    {experience.totalReviews && (
                      <span className="text-xs text-slate-500">({experience.totalReviews.toLocaleString()})</span>
                    )}
                  </div>
                )}
                
                {/* Title */}
                <h4 className="text-sm font-semibold text-slate-900 line-clamp-2 mb-2 hover:text-indigo-600 transition-colors">
                  {experience.title}
                </h4>
                {/* Details */}
                <div className="flex items-center gap-3 text-xs text-slate-600 mb-2">
                  {experience.type === "viator" && (
                    <span className="flex items-center gap-1">
                      <span>✓</span>
                      <span>Free Cancellation</span>
                    </span>
                  )}
                  {(experience.completion_time || experience.duration) && (
                    <span className="flex items-center gap-1">
                      <span>⏱️</span>
                      <span>{experience.duration || experience.completion_time}</span>
                    </span>
                  )}
                </div>
                
                {/* Price */}
                {experience.type === "viator" && experience.price && (
                  <div className="text-sm font-semibold text-slate-900 mb-2">
                    {experience.price}
                  </div>
                )}
                
                {/* Action Buttons - aligned at bottom */}
                <div className="flex items-center gap-2 mt-auto">
                  {experience.type === "viator" ? (
                    <>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (onAddToItinerary) {
                            onAddToItinerary(experience, location);
                          }
                        }}
                        className="inline-flex items-center justify-center rounded-full px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                      >
                        Add to itinerary
                      </button>
                      <span className="inline-flex items-center justify-center rounded-full px-3 py-1.5 text-xs font-medium text-white bg-gradient-to-r from-emerald-500 to-teal-600">
                        Book now
                      </span>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (onAddToItinerary) {
                          onAddToItinerary(experience, location);
                        }
                      }}
                      className="inline-flex items-center justify-center rounded-full px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                    >
                      Add to itinerary
                    </button>
                  )}
                </div>
              </div>
          </a>
          ))}
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200">
            <button
              onClick={handlePreviousPage}
              disabled={currentPage === 1}
              className={[
                "flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors",
                currentPage === 1
                  ? "text-slate-400 cursor-not-allowed bg-slate-100"
                  : "text-slate-700 bg-slate-100 hover:bg-slate-200"
              ].join(" ")}
            >
              <ChevronLeft className="w-3 h-3" />
              Previous
            </button>
            
            <div className="text-xs text-slate-600">
              Page {currentPage} of {totalPages} ({sortedExperiences.length} total)
            </div>
            
            <button
              onClick={handleNextPage}
              disabled={currentPage === totalPages}
              className={[
                "flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors",
                currentPage === totalPages
                  ? "text-slate-400 cursor-not-allowed bg-slate-100"
                  : "text-slate-700 bg-slate-100 hover:bg-slate-200"
              ].join(" ")}
            >
              Next
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
