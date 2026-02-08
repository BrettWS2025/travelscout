"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
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

type ThingsToDoListProps = {
  location: string;
};

const ITEMS_PER_PAGE = 10;

export default function ThingsToDoList({ location }: ThingsToDoListProps) {
  const [experiences, setExperiences] = useState<WalkingExperience[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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
              setExperiences(routeResults);
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
                setExperiences(results);
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
                setExperiences(results);
              }
            }
          } else {
            // Fallback: try to find districts by name only
            const fromDistrict = await getPlaceDistrictByName(fromCity);
            const toDistrict = await getPlaceDistrictByName(toCity);
            
            const districts = [fromDistrict, toDistrict].filter((d): d is string => d !== null);
            
            if (districts.length > 0) {
              const results = await getWalkingExperiencesByDistricts(districts, 500);
              setExperiences(results);
            } else {
              setExperiences([]);
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
            // Query by district (fastest)
            const results = await getWalkingExperiencesByDistrict(districtName, 500);
            setExperiences(results);
          } else {
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
              setExperiences(results);
            } else {
              console.log("[ThingsToDoList] Itinerary - no place coordinates found:", { location, cityName, places });
              setExperiences([]);
            }
          }
        }
      } catch (err) {
        console.error("Error fetching walking experiences:", err);
        setError("Failed to load walking experiences");
        setExperiences([]);
      } finally {
        setLoading(false);
      }
    }

    fetchExperiences();
    setCurrentPage(1); // Reset to first page when location changes
  }, [location]);

  // Sort experiences alphabetically by track name
  const sortedExperiences = useMemo(() => {
    return [...experiences].sort((a, b) => 
      a.track_name.localeCompare(b.track_name)
    );
  }, [experiences]);

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
          No walking tracks found for this location.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div 
        ref={scrollContainerRef}
        className="max-h-[calc(3*120px+2*12px+24px)] overflow-y-auto pr-2"
      >
        <div className="space-y-3">
          {currentPageExperiences.map((experience) => (
          <a
            key={experience.id}
            href={experience.url_to_webpage}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-xl bg-slate-50 border border-slate-200 p-3 hover:bg-slate-100 transition-colors"
          >
            <div className="flex items-start gap-3">
              {/* Thumbnail */}
              {experience.url_to_thumbnail ? (
                <img
                  src={experience.url_to_thumbnail}
                  alt={experience.track_name}
                  className="w-16 h-16 rounded-lg object-cover flex-shrink-0 border border-slate-200"
                  onError={(e) => {
                    // Hide image on error
                    e.currentTarget.style.display = "none";
                  }}
                />
              ) : (
                <div className="w-16 h-16 rounded-lg bg-slate-300 border border-slate-400 flex-shrink-0 flex items-center justify-center">
                  <span className="text-xs text-slate-600">🏔️</span>
                </div>
              )}
              
              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h4 className="text-sm font-semibold text-slate-900 line-clamp-1">
                    {experience.track_name}
                  </h4>
                  {experience.difficulty && (
                    <span className="text-[10px] text-slate-600 bg-slate-200 px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">
                      {experience.difficulty}
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
                  {experience.kid_friendly && (
                    <span>👨‍👩‍👧 Kid-friendly</span>
                  )}
                  {experience.distance_km && (
                    <span>📍 {experience.distance_km.toFixed(1)} km away</span>
                  )}
                  {experience.district_name && (
                    <span>📍 {experience.district_name}</span>
                  )}
                </div>
              </div>
            </div>
          </a>
          ))}
        </div>
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
  );
}
