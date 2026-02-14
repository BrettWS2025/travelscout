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

const ITEMS_PER_PAGE = 12;

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
  const tagsScrollRef = useRef<HTMLDivElement>(null);
  
  // Tag filtering state
  const [tags, setTags] = useState<ViatorTag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [canScrollTagsLeft, setCanScrollTagsLeft] = useState(false);
  const [canScrollTagsRight, setCanScrollTagsRight] = useState(true);
  // Map of child tag ID -> array of parent tag IDs
  const [childTagToParentsMap, setChildTagToParentsMap] = useState<Map<number, number[]>>(new Map());

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

  // Fetch tags for filtering and build child-to-parent mapping
  useEffect(() => {
    async function fetchTagsAndBuildMap() {
      setTagsLoading(true);
      try {
        // Collect all tag IDs from current products to filter tags
        const productTagIds = new Set<number>();
        viatorProducts.forEach(product => {
          if (product.tagIds && Array.isArray(product.tagIds)) {
            product.tagIds.forEach(tagId => {
              if (typeof tagId === 'number') {
                productTagIds.add(tagId);
              }
            });
          }
        });
        
        // Build API URL with product tag IDs if we have products
        let apiUrl = "/api/viator/tags";
        if (productTagIds.size > 0) {
          const tagIdsParam = Array.from(productTagIds).join(',');
          apiUrl += `?productTagIds=${encodeURIComponent(tagIdsParam)}`;
        }
        
        const response = await fetch(apiUrl);
        if (response.ok) {
          const data = await response.json();
          console.log(`[ThingsToDoList] Tags API response:`, { success: data.success, count: data.count, tagsLength: data.tags?.length });
          if (data.success && data.tags) {
            console.log(`[ThingsToDoList] Loaded ${data.tags.length} tags for filtering`);
            if (data.tags.length > 0) {
              console.log(`[ThingsToDoList] Sample tags:`, data.tags.slice(0, 3).map((t: any) => ({
                id: t.tag_id,
                name: t.tag_name,
                has_metadata: !!t.metadata,
                metadata_type: typeof t.metadata,
                metadata: t.metadata ? (typeof t.metadata === 'string' ? 'string' : Object.keys(t.metadata || {})) : null
              })));
            } else {
              console.warn(`[ThingsToDoList] API returned success but 0 tags. Check server terminal logs for [Viator Tags API] messages.`);
            }
            setTags(data.tags);
          } else {
            console.warn("[ThingsToDoList] Tags API returned unsuccessful response:", data);
          }
        } else {
          const errorData = await response.json().catch(() => ({}));
          console.error("[ThingsToDoList] Failed to fetch tags:", response.status, errorData);
        }

        // Now fetch all product tags to build child-to-parent mapping
        if (productTagIds.size > 0) {
          try {
            const childTagsResponse = await fetch(`/api/viator/tags?tagIds=${Array.from(productTagIds).join(',')}`);
            if (childTagsResponse.ok) {
              const childTagsData = await childTagsResponse.json();
              if (childTagsData.success && childTagsData.allTags) {
                const map = new Map<number, number[]>();
                childTagsData.allTags.forEach((tag: any) => {
                  let metadata = tag.metadata;
                  if (typeof metadata === 'string') {
                    try {
                      metadata = JSON.parse(metadata);
                    } catch (e) {
                      return;
                    }
                  }
                  const parentTagIds = metadata?.parentTagIds;
                  if (Array.isArray(parentTagIds) && parentTagIds.length > 0) {
                    const parentIds = parentTagIds.map((id: any) => typeof id === 'string' ? parseInt(id, 10) : Number(id)).filter((id: number) => !isNaN(id) && id > 0);
                    if (parentIds.length > 0) {
                      map.set(tag.tag_id, parentIds);
                    }
                  }
                });
                setChildTagToParentsMap(map);
                console.log(`[ThingsToDoList] Built child-to-parent map with ${map.size} entries`);
              }
            }
          } catch (err) {
            console.error("[ThingsToDoList] Error fetching child tag metadata:", err);
          }
        } else {
          setChildTagToParentsMap(new Map());
        }
      } catch (err) {
        console.error("[ThingsToDoList] Error fetching tags:", err);
      } finally {
        setTagsLoading(false);
      }
    }
    fetchTagsAndBuildMap();
  }, [viatorProducts]);

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
  }, [allExperiences, selectedTagIds, childTagToParentsMap]);

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
          <div className="flex items-center justify-end mb-2">
            {selectedTagIds.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSelectedTagIds([]);
                  setCurrentPage(1);
                }}
                className="px-2 py-0.5 text-xs font-medium rounded bg-slate-200 text-slate-700 border border-slate-300 hover:bg-slate-300 transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>
          
          {/* Horizontal scrollable tags with navigation arrows on sides */}
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
              aria-label="Scroll tags left"
            >
              <ChevronLeft className="w-4 h-4 text-slate-600" />
            </button>

            {/* Scrollable tags container */}
            <div
              ref={tagsScrollRef}
              className="flex gap-2 overflow-x-auto scrollbar-hide flex-1"
            >
              {tags.map((tag) => {
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
              aria-label="Scroll tags right"
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
