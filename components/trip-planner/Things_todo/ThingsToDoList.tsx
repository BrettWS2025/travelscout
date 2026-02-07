"use client";

import { useEffect, useState } from "react";
import {
  getWalkingExperiencesByDistrict,
  getWalkingExperiencesNearPoint,
  getWalkingExperiencesByDistricts,
  type WalkingExperience,
} from "@/lib/walkingExperiences";
import { searchPlacesByName, getPlaceDistrictByName } from "@/lib/places";
import { parseDisplayName } from "@/lib/trip-planner/utils";

type ThingsToDoListProps = {
  location: string;
};

export default function ThingsToDoList({ location }: ThingsToDoListProps) {
  const [experiences, setExperiences] = useState<WalkingExperience[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchExperiences() {
      setLoading(true);
      setError(null);

      try {
        // Check if location is a road sector (contains " to ")
        const isRoadSector = location.includes(" to ");
        
        if (isRoadSector) {
          // Road sector: try to get experiences from both endpoints
          const [fromCity, toCity] = location.split(" to ").map(s => s.trim());
          
          // Try to find districts for both cities
          const fromDistrict = await getPlaceDistrictByName(fromCity);
          const toDistrict = await getPlaceDistrictByName(toCity);
          
          const districts = [fromDistrict, toDistrict].filter((d): d is string => d !== null);
          
          if (districts.length > 0) {
            // Query by districts
            const results = await getWalkingExperiencesByDistricts(districts, 20);
            setExperiences(results);
          } else {
            // Fallback: try to get coordinates and query by radius
            const fromPlace = await searchPlacesByName(fromCity, 1);
            const toPlace = await searchPlacesByName(toCity, 1);
            
            if (fromPlace.length > 0 && fromPlace[0].lat && fromPlace[0].lng) {
              // Query near the starting point
              const results = await getWalkingExperiencesNearPoint(
                fromPlace[0].lat,
                fromPlace[0].lng,
                30.0, // 30km radius
                20
              );
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
            const results = await getWalkingExperiencesByDistrict(districtName, 20);
            setExperiences(results);
          } else {
            // Fallback: try to get coordinates and query by radius
            const places = await searchPlacesByName(cityName || location, 1);
            
            if (places.length > 0 && places[0].lat && places[0].lng) {
              const results = await getWalkingExperiencesNearPoint(
                places[0].lat,
                places[0].lng,
                20.0, // 20km radius
                20
              );
              setExperiences(results);
            } else {
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
  }, [location]);

  if (loading) {
    return (
      <div className="max-h-[calc(3*120px+2*12px+24px)] overflow-y-auto pr-2">
        <div className="text-xs text-slate-500 text-center py-4">Loading walking tracks...</div>
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

  if (experiences.length === 0) {
    return (
      <div className="max-h-[calc(3*120px+2*12px+24px)] overflow-y-auto pr-2">
        <div className="text-xs text-slate-500 text-center py-4">
          No walking tracks found for this location.
        </div>
      </div>
    );
  }

  return (
    <div className="max-h-[calc(3*120px+2*12px+24px)] overflow-y-auto pr-2">
      <div className="space-y-3">
        {experiences.map((experience) => (
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
  );
}
