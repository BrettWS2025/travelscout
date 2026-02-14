"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { ChevronLeft, ChevronRight, List, MapPin } from "lucide-react";
import {
  getWalkingExperiencesByDistrict,
  getWalkingExperiencesNearPoint,
  getWalkingExperiencesByDistricts,
  getWalkingExperiencesNearRoute,
  getDistrictsAlongRoute,
  createStraightLineRoute,
  routeToWKT,
  type WalkingExperience,
} from "@/lib/walkingExperiences";
import { searchPlacesByName, getPlaceDistrictByName } from "@/lib/places";
import { parseDisplayName } from "@/lib/trip-planner/utils";
import {
  transformWalkingExperience,
  transformViatorProduct,
  fetchViatorProductsForLocation,
  fetchViatorProductsForRoute,
  fetchAllViatorProductsProgressive,
  type ExperienceItem,
} from "@/lib/viator-helpers";
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

const ITEMS_PER_PAGE = 10;

type ViatorTag = {
  tag_id: number;
  tag_name: string;
  description?: string;
  category?: string;
  group_name?: string;
  metadata?: {
    parentTagIds?: number[];
    allNamesByLocale?: {
      en?: string;
      [key: string]: string | undefined;
    };
    [key: string]: any;
  };
};

export default function ThingsToDoList({ location, onAddToItinerary }: ThingsToDoListProps) {
  const [walkingExperiences, setWalkingExperiences] = useState<WalkingExperience[]>([]);
  const [viatorProducts, setViatorProducts] = useState<ExperienceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [viatorPage, setViatorPage] = useState(1);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // Tag filtering state
  const [tags, setTags] = useState<ViatorTag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [tagsLoading, setTagsLoading] = useState(false);

  useEffect(() => {
    async function fetchExperiences() {
      setLoading(true);
      setError(null);

      try {
        // Check if location is a road sector (contains " to ")
        const isRoadSector = location.includes(" to ");
        
        if (isRoadSector) {
          // Road sector: get experiences along the entire route
          const [fromCity, toCity] = location.split(" to ").map(s => s.trim());
          
          console.log("[ThingsToDoList] Road sector:", { fromCity, toCity });
          
          // Get coordinates for both cities
          const fromPlace = await searchPlacesByName(fromCity, 1);
          const toPlace = await searchPlacesByName(toCity, 1);
          
          console.log("[ThingsToDoList] Places found:", { 
            fromPlace: fromPlace[0] ? { name: fromPlace[0].name, lat: fromPlace[0].lat, lng: fromPlace[0].lng } : null,
            toPlace: toPlace[0] ? { name: toPlace[0].name, lat: toPlace[0].lat, lng: toPlace[0].lng } : null
          });
          
          if (fromPlace.length > 0 && toPlace.length > 0 && 
              fromPlace[0].lat && fromPlace[0].lng && 
              toPlace[0].lat && toPlace[0].lng) {
            
            // Create a route with intermediate waypoints (more waypoints for better coverage)
            const routeCoordinates = createStraightLineRoute(
              fromPlace[0].lat,
              fromPlace[0].lng,
              toPlace[0].lat,
              toPlace[0].lng,
              15 // More intermediate waypoints
            );
            
            // Convert to WKT
            const routeWkt = routeToWKT(routeCoordinates);
            console.log("[ThingsToDoList] Route WKT created, length:", routeCoordinates.length, "points");
            
            // Try using route buffer approach first (more reliable)
            const routeResults = await getWalkingExperiencesNearRoute(routeWkt, 30.0, 500); // 30km buffer, increased limit
            
            console.log("[ThingsToDoList] Route buffer results:", routeResults.length);
            
            if (routeResults.length > 0) {
              setWalkingExperiences(routeResults);
            } else {
              // Fallback: Get districts along the route
              const districts = await getDistrictsAlongRoute(routeWkt, 20);
              console.log("[ThingsToDoList] Districts found along route:", districts);
              
              // Also include districts from start and end cities
              const fromDistrict = await getPlaceDistrictByName(fromCity);
              const toDistrict = await getPlaceDistrictByName(toCity);
              console.log("[ThingsToDoList] City districts:", { fromDistrict, toDistrict });
              
              // Combine all districts and remove duplicates
              const allDistricts = Array.from(new Set([
                ...districts,
                ...(fromDistrict ? [fromDistrict] : []),
                ...(toDistrict ? [toDistrict] : []),
              ]));
              
              console.log("[ThingsToDoList] All districts:", allDistricts);
              
              if (allDistricts.length > 0) {
                // Query by all districts along the route
                const results = await getWalkingExperiencesByDistricts(allDistricts, 500);
                console.log("[ThingsToDoList] District query results:", results.length);
                setWalkingExperiences(results);
              } else {
                // Fallback: query by radius from midpoint
                const midLat = (fromPlace[0].lat + toPlace[0].lat) / 2;
                const midLng = (fromPlace[0].lng + toPlace[0].lng) / 2;
                const distance = Math.sqrt(
                  Math.pow((toPlace[0].lat - fromPlace[0].lat) * 111, 2) +
                  Math.pow((toPlace[0].lng - fromPlace[0].lng) * 111 * Math.cos(midLat * Math.PI / 180), 2)
                );
                
                console.log("[ThingsToDoList] Using midpoint fallback:", { midLat, midLng, distance });
                const results = await getWalkingExperiencesNearPoint(
                  midLat,
                  midLng,
                  Math.max(distance / 2, 50.0), // At least 50km radius
                  500
                );
                console.log("[ThingsToDoList] Midpoint query results:", results.length);
                setWalkingExperiences(results);
              }
            }
            
            // Fetch Viator products for the route with progressive loading
            try {
              // Show first page immediately
              const firstPage = await fetchViatorProductsForRoute(
                fromPlace[0].lat,
                fromPlace[0].lng,
                toPlace[0].lat,
                toPlace[0].lng,
                0,
                500,
                fromCity,
                toCity
              );
              
              console.log(`[ThingsToDoList] First page loaded: ${firstPage.products.length} products, ${firstPage.total} total available`);
              
              // Show first page immediately
              setViatorProducts(firstPage.products);
              
              // Load remaining products in background if needed
              if (firstPage.products.length < firstPage.total) {
                // Calculate midpoint for progressive loading
                const midLat = (fromPlace[0].lat + toPlace[0].lat) / 2;
                const midLng = (fromPlace[0].lng + toPlace[0].lng) / 2;
                const locationName = fromCity || toCity;
                
                fetchAllViatorProductsProgressive(
                  midLat,
                  midLng,
                  locationName,
                  firstPage.products,
                  firstPage.total
                ).then((result) => {
                  setViatorProducts(result.products);
                }).catch((error) => {
                  console.warn("Error loading remaining products:", error);
                });
              }
            } catch (viatorError) {
              console.warn("Failed to fetch Viator products for route:", viatorError);
              setViatorProducts([]);
            }
          } else {
            // Fallback: try to find districts by name only
            const fromDistrict = await getPlaceDistrictByName(fromCity);
            const toDistrict = await getPlaceDistrictByName(toCity);
            
            const districts = [fromDistrict, toDistrict].filter((d): d is string => d !== null);
            
            if (districts.length > 0) {
              const results = await getWalkingExperiencesByDistricts(districts, 500);
              setWalkingExperiences(results);
            } else {
              setWalkingExperiences([]);
            }
          }
        } else {
          // Itinerary sector: single location
          // Try to get district from location name
          const { cityName, district } = parseDisplayName(location);
          
          let districtName: string | null = district || null;
          
          // If no district in display name, try to look it up
          if (!districtName) {
            districtName = await getPlaceDistrictByName(cityName || location);
          }
          
          if (districtName) {
            // Query by district (fastest / preferred)
            const results = await getWalkingExperiencesByDistrict(districtName, 500);
            console.log("[ThingsToDoList] Itinerary district results:", {
              location,
              cityName,
              districtName,
              count: results.length,
            });

            if (results.length > 0) {
              setWalkingExperiences(results);
              
              // Fetch Viator products for this location
              const places = await searchPlacesByName(cityName || location, 1);
              if (places.length > 0 && places[0].lat && places[0].lng) {
                try {
                  console.log(`[ThingsToDoList] ========================================`);
                  console.log(`[ThingsToDoList] FETCHING VIATOR PRODUCTS`);
                  console.log(`[ThingsToDoList] Location: ${cityName || location}`);
                  console.log(`[ThingsToDoList] Coordinates: lat=${places[0].lat}, lng=${places[0].lng}`);
                  console.log(`[ThingsToDoList] Radius: 60km (NOTE: Viator API ignores radius - searches by destination only)`);
                  console.log(`[ThingsToDoList] ========================================`);
                  
                  // Use progressive loading: show first page immediately, then load rest in background
                  console.log(`[ThingsToDoList] Starting progressive load...`);
                  
                  // Show first page immediately
                  const firstPage = await fetchViatorProductsForLocation(
                    places[0].lat,
                    places[0].lng,
                    60.0,
                    0,
                    500,
                    cityName || location
                  );
                  
                  console.log(`[ThingsToDoList] First page loaded: ${firstPage.products.length} products, ${firstPage.total} total available`);
                  console.log(`[ThingsToDoList] Has more: ${firstPage.hasMore}`);
                  console.log(`[ThingsToDoList] Need more: ${firstPage.products.length < firstPage.total}`);
                  
                  // Show first page immediately to user
                  setViatorProducts(firstPage.products);
                  
                  // If there are more products, fetch them in the background using parallel batches
                  // Check if we have fewer products than total (don't rely on hasMore flag)
                  if (firstPage.products.length < firstPage.total) {
                    console.log(`[ThingsToDoList] Loading remaining products in background...`);
                    console.log(`[ThingsToDoList] Need to fetch ${firstPage.total - firstPage.products.length} more products`);
                    
                    // Fetch all remaining products progressively (in parallel batches)
                    // Pass the first page data so we don't refetch it
                    fetchAllViatorProductsProgressive(
                      places[0].lat,
                      places[0].lng,
                      cityName || location,
                      firstPage.products,
                      firstPage.total,
                      (current, total) => {
                        console.log(`[ThingsToDoList] Progress: ${current}/${total} products loaded`);
                      }
                    ).then((result) => {
                      console.log(`[ThingsToDoList] All products loaded: ${result.products.length}/${result.total}`);
                      setViatorProducts(result.products);
                    }).catch((error) => {
                      console.warn(`[ThingsToDoList] Error loading remaining products:`, error);
                      // Keep the first page results even if background loading fails
                    });
                  } else {
                    console.log(`[ThingsToDoList] All products already loaded (${firstPage.products.length}/${firstPage.total})`);
                  }
                } catch (viatorError) {
                  console.warn("Failed to fetch Viator products:", viatorError);
                  setViatorProducts([]);
                }
              }
              return;
            }

            // Some cities (e.g. Napier) can have a district name that doesn't
            // exactly match the DOC walking_experiences.district_name values.
            // If the district query returns no results, fall back to a
            // coordinate-based radius search around the city so we still
            // surface nearby tracks.
            console.log("[ThingsToDoList] Itinerary district query empty, falling back to radius search");
          }

          // Fallback: try to get coordinates and query by radius
          const places = await searchPlacesByName(cityName || location, 1);
          
          if (places.length > 0 && places[0].lat && places[0].lng) {
            console.log("[ThingsToDoList] Itinerary fallback - searching near point:", {
              location,
              cityName,
              place: { name: places[0].name, lat: places[0].lat, lng: places[0].lng },
              radius: 60.0
            });
            const results = await getWalkingExperiencesNearPoint(
              places[0].lat,
              places[0].lng,
              60.0, // 60km radius
              500
            );
            console.log("[ThingsToDoList] Itinerary fallback results:", results.length, results);
            setWalkingExperiences(results);
            
            // Fetch Viator products with progressive loading
            try {
              // Show first page immediately
              const firstPage = await fetchViatorProductsForLocation(
                places[0].lat,
                places[0].lng,
                60.0,
                0,
                500,
                cityName || location
              );
              
              console.log(`[ThingsToDoList] First page loaded: ${firstPage.products.length} products, ${firstPage.total} total available`);
              
              // Show first page immediately
              setViatorProducts(firstPage.products);
              
              // Load remaining products in background if needed
              if (firstPage.products.length < firstPage.total) {
                fetchAllViatorProductsProgressive(
                  places[0].lat,
                  places[0].lng,
                  cityName || location,
                  firstPage.products,
                  firstPage.total
                ).then((result) => {
                  setViatorProducts(result.products);
                }).catch((error) => {
                  console.warn("Error loading remaining products:", error);
                });
              }
            } catch (viatorError) {
              console.warn("Failed to fetch Viator products:", viatorError);
              setViatorProducts([]);
            }
          } else {
            console.log("[ThingsToDoList] Itinerary - no place coordinates found:", { location, cityName, places });
            setWalkingExperiences([]);
            setViatorProducts([]);
          }
        }
      } catch (err) {
        console.error("Error fetching experiences:", err);
        setError("Failed to load experiences");
        setWalkingExperiences([]);
        setViatorProducts([]);
      } finally {
        setLoading(false);
      }
    }

    fetchExperiences();
    setCurrentPage(1); // Reset to first page when location changes
    setViatorPage(1);
  }, [location]);

  // Fetch tags for filtering
  useEffect(() => {
    async function fetchTags() {
      setTagsLoading(true);
      try {
        const response = await fetch("/api/viator/tags");
        if (response.ok) {
          const data = await response.json();
          console.log(`[ThingsToDoList] Tags API response:`, { success: data.success, count: data.count, tagsLength: data.tags?.length });
          if (data.success && data.tags) {
            console.log(`[ThingsToDoList] Loaded ${data.tags.length} tags for filtering`);
            if (data.tags.length > 0) {
              console.log(`[ThingsToDoList] Sample tags:`, data.tags.slice(0, 3).map((t: any) => ({
                id: t.tag_id,
                name: t.tag_name,
                metadata: t.metadata
              })));
            }
            setTags(data.tags);
          } else {
            console.warn("[ThingsToDoList] Tags API returned unsuccessful response:", data);
          }
        } else {
          const errorData = await response.json().catch(() => ({}));
          console.error("[ThingsToDoList] Failed to fetch tags:", response.status, errorData);
        }
      } catch (err) {
        console.error("[ThingsToDoList] Error fetching tags:", err);
      } finally {
        setTagsLoading(false);
      }
    }
    fetchTags();
  }, []);

  // Transform walking experiences to ExperienceItem and combine with Viator products
  const allExperiences = useMemo(() => {
    const walking = walkingExperiences.map(transformWalkingExperience);
    return [...walking, ...viatorProducts];
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
    // First filter by selected tags (only applies to Viator products)
    let filtered = allExperiences;
    if (selectedTagIds.length > 0) {
      filtered = allExperiences.filter(exp => {
        // Walking experiences always pass (no tags)
        if (exp.type !== "viator") return true;
        // Viator products must have at least one matching tag
        if (!exp.tagIds || exp.tagIds.length === 0) return false;
        return exp.tagIds.some(tagId => selectedTagIds.includes(tagId));
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
  }, [allExperiences, selectedTagIds]);

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
      {/* Tag Filter - only show if we have tags and Viator products */}
      {tags.length > 0 && viatorProducts.length > 0 && (
        <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
          <div className="text-xs font-medium text-slate-700 mb-2">Filter by Tags:</div>
          <div className="flex flex-wrap gap-2">
            {tags.slice(0, 20).map((tag) => {
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
                    }
                    setCurrentPage(1); // Reset to first page when filter changes
                  }}
                  className={[
                    "px-2.5 py-1 text-xs font-medium rounded-full transition-colors border",
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
            {selectedTagIds.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSelectedTagIds([]);
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1 text-xs font-medium rounded-full bg-slate-200 text-slate-700 border border-slate-300 hover:bg-slate-300 transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>
          {tags.length > 20 && (
            <div className="text-xs text-slate-500 mt-2">
              Showing first 20 tags. {tags.length - 20} more available.
            </div>
          )}
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
          className="max-h-[calc(3*120px+2*12px+24px)] overflow-y-auto pr-2"
        >
        <div className="space-y-3">
          {currentPageExperiences.map((experience) => (
          <div
            key={experience.id}
            className="block rounded-xl bg-slate-50 border border-slate-200 p-3 hover:bg-slate-100 transition-colors"
          >
            <div className="flex items-start gap-3">
              {/* Thumbnail */}
              {experience.imageUrl ? (
                <img
                  src={experience.imageUrl}
                  alt={experience.title}
                  className="w-16 h-16 rounded-lg object-cover flex-shrink-0 border border-slate-200"
                  onError={(e) => {
                    // Hide image on error
                    e.currentTarget.style.display = "none";
                  }}
                />
              ) : (
                <div className="w-16 h-16 rounded-lg bg-slate-300 border border-slate-400 flex-shrink-0 flex items-center justify-center">
                  <span className="text-xs text-slate-600">{experience.type === "viator" ? "🎫" : "🏔️"}</span>
                </div>
              )}
              
              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h4 className="text-sm font-semibold text-slate-900 line-clamp-1">
                    <a
                      href={experience.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-indigo-600 transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {experience.title}
                    </a>
                  </h4>
                  {experience.difficulty && (
                    <span className="text-[10px] text-slate-600 bg-slate-200 px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">
                      {experience.difficulty}
                    </span>
                  )}
                  {experience.type === "viator" && experience.rating && (
                    <span className="text-[10px] text-slate-600 bg-slate-200 px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">
                      ⭐ {experience.rating.toFixed(1)}
                    </span>
                  )}
                </div>
                {experience.description && (
                  <p className="text-xs text-slate-700 line-clamp-2 mb-1">
                    {experience.description}
                  </p>
                )}
                <div className="flex items-center gap-2 flex-wrap text-[10px] text-slate-500">
                  {experience.completion_time && (
                    <span>⏱️ {experience.completion_time}</span>
                  )}
                  {experience.duration && (
                    <span>⏱️ {experience.duration}</span>
                  )}
                  {experience.kid_friendly && (
                    <span>👨‍👩‍👧 Kid-friendly</span>
                  )}
                  {experience.distance_km && (
                    <span>📍 {experience.distance_km.toFixed(1)} km away</span>
                  )}
                  {experience.district_name && (
                    <span>📍 {experience.district_name}</span>
                  )}
                  {experience.type === "viator" && experience.price && (
                    <span className="font-medium text-indigo-600">💰 {experience.price}</span>
                  )}
                  {experience.type === "viator" && experience.totalReviews && (
                    <span>({experience.totalReviews} reviews)</span>
                  )}
                  {/* Action Pills - Desktop: inline with details */}
                  <span className="hidden md:inline-flex items-center gap-2 ml-1">
                    {experience.type === "viator" ? (
                      <>
                        <a
                          href={experience.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors border border-indigo-600 whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Book now
                        </a>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onAddToItinerary) {
                              onAddToItinerary(experience, location);
                            }
                          }}
                          className="inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors border border-slate-200 whitespace-nowrap"
                        >
                          Add to itinerary
                        </button>
                      </>
                    ) : (
                      <>
                        <a
                          href={experience.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors border border-slate-200 whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          More Detail
                        </a>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onAddToItinerary) {
                              onAddToItinerary(experience, location);
                            }
                          }}
                          className="inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors whitespace-nowrap"
                        >
                          Add to itinerary
                        </button>
                      </>
                    )}
                  </span>
                </div>
              </div>
            </div>
            
            {/* Action Pills - Mobile: separate section below */}
            <div className="flex items-center gap-2 flex-wrap md:hidden mt-3">
              {experience.type === "viator" ? (
                <>
                  <a
                    href={experience.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center rounded-full px-2.5 py-1 text-[10px] font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors border border-indigo-600"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Book now
                  </a>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onAddToItinerary) {
                        onAddToItinerary(experience, location);
                      }
                    }}
                    className="inline-flex items-center justify-center rounded-full px-2.5 py-1 text-[10px] font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors border border-slate-200"
                  >
                    Add to itinerary
                  </button>
                </>
              ) : (
                <>
                  <a
                    href={experience.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center rounded-full px-2.5 py-1 text-[10px] font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors border border-slate-200"
                    onClick={(e) => e.stopPropagation()}
                  >
                    More Detail
                  </a>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onAddToItinerary) {
                        onAddToItinerary(experience, location);
                      }
                    }}
                    className="inline-flex items-center justify-center rounded-full px-2.5 py-1 text-[10px] font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                  >
                    Add to itinerary
                  </button>
                </>
              )}
            </div>
          </div>
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
