// lib/walkingExperiences.ts
// Service layer for querying walking experiences from Supabase

import { supabase } from "@/lib/supabase/client";

export type WalkingExperience = {
  id: string;
  track_name: string;
  description: string | null;
  difficulty: string | null;
  completion_time: string | null;
  completion_min: number | null;
  completion_max: number | null;
  is_range: boolean;
  kid_friendly: boolean;
  has_alerts: string | null;
  url_to_thumbnail: string | null;
  url_to_webpage: string;
  latitude: number | null;
  longitude: number | null;
  shape_length: number | null;
  district_name: string | null;
  district_osm_id: string | null;
  distance_km?: number; // Only present when querying by distance
};

/**
 * Get walking experiences by district name
 * Uses the get_walking_experiences_by_district database function
 */
export async function getWalkingExperiencesByDistrict(
  districtName: string,
  limit: number = 50
): Promise<WalkingExperience[]> {
  const { data, error } = await supabase.rpc("get_walking_experiences_by_district", {
    district_name_param: districtName,
    result_limit: limit,
  });

  if (error) {
    console.error("Error fetching walking experiences by district:", error);
    return [];
  }

  return (data || []).map((item: any) => ({
    id: item.id,
    track_name: item.track_name,
    description: item.description,
    difficulty: item.difficulty,
    completion_time: item.completion_time,
    completion_min: item.completion_min,
    completion_max: item.completion_max,
    is_range: item.is_range,
    kid_friendly: item.kid_friendly,
    has_alerts: item.has_alerts,
    url_to_thumbnail: item.url_to_thumbnail,
    url_to_webpage: item.url_to_webpage,
    latitude: item.latitude,
    longitude: item.longitude,
    shape_length: item.shape_length,
    district_name: item.district_name,
    district_osm_id: item.district_osm_id,
  }));
}

/**
 * Get walking experiences within radius of a point
 * Uses the get_walking_experiences_near_point database function
 */
export async function getWalkingExperiencesNearPoint(
  centerLat: number,
  centerLng: number,
  radiusKm: number = 20.0,
  limit: number = 50
): Promise<WalkingExperience[]> {
  console.log("[getWalkingExperiencesNearPoint] Calling function with:", {
    centerLat,
    centerLng,
    radiusKm,
    limit
  });
  
  const { data, error } = await supabase.rpc("get_walking_experiences_near_point", {
    center_lat: centerLat,
    center_lng: centerLng,
    radius_km: radiusKm,
    result_limit: limit,
  });

  if (error) {
    console.error("Error fetching walking experiences near point:", error);
    return [];
  }
  
  console.log("[getWalkingExperiencesNearPoint] Results:", data?.length || 0, "experiences found");

  return (data || []).map((item: any) => ({
    id: item.id,
    track_name: item.track_name,
    description: item.description,
    difficulty: item.difficulty,
    completion_time: item.completion_time,
    completion_min: item.completion_min,
    completion_max: item.completion_max,
    is_range: item.is_range,
    kid_friendly: item.kid_friendly,
    has_alerts: item.has_alerts,
    url_to_thumbnail: item.url_to_thumbnail,
    url_to_webpage: item.url_to_webpage,
    latitude: item.latitude,
    longitude: item.longitude,
    shape_length: item.shape_length,
    district_name: item.district_name,
    district_osm_id: item.district_osm_id,
    distance_km: item.distance_km,
  }));
}

/**
 * Get walking experiences near a route (for road sectors)
 * Uses the get_walking_experiences_near_route database function
 * 
 * @param routeGeometryWkt - PostGIS LINESTRING geometry as WKT string (e.g., "LINESTRING(lng lat, lng lat, ...)")
 * @param bufferKm - Buffer distance in kilometers (default 20km)
 * @param limit - Maximum number of results (default 50)
 */
export async function getWalkingExperiencesNearRoute(
  routeGeometryWkt: string, // WKT format like "LINESTRING(lng lat, lng lat, ...)"
  bufferKm: number = 20.0,
  limit: number = 50
): Promise<WalkingExperience[]> {
  const { data, error } = await supabase.rpc("get_walking_experiences_near_route", {
    route_geometry_wkt: routeGeometryWkt,
    buffer_km: bufferKm,
    result_limit: limit,
  });

  if (error) {
    console.error("Error fetching walking experiences near route:", error);
    return [];
  }

  return (data || []).map((item: any) => ({
    id: item.id,
    track_name: item.track_name,
    description: item.description,
    difficulty: item.difficulty,
    completion_time: item.completion_time,
    completion_min: item.completion_min,
    completion_max: item.completion_max,
    is_range: item.is_range,
    kid_friendly: item.kid_friendly,
    has_alerts: item.has_alerts,
    url_to_thumbnail: item.url_to_thumbnail,
    url_to_webpage: item.url_to_webpage,
    latitude: item.latitude,
    longitude: item.longitude,
    shape_length: item.shape_length,
    district_name: item.district_name,
    district_osm_id: item.district_osm_id,
    distance_km: item.distance_km,
  }));
}

/**
 * Get walking experiences by multiple districts
 * Uses the get_walking_experiences_by_districts database function
 */
export async function getWalkingExperiencesByDistricts(
  districtNames: string[],
  limit: number = 50
): Promise<WalkingExperience[]> {
  const { data, error } = await supabase.rpc("get_walking_experiences_by_districts", {
    district_names: districtNames,
    result_limit: limit,
  });

  if (error) {
    console.error("Error fetching walking experiences by districts:", error);
    return [];
  }

  return (data || []).map((item: any) => ({
    id: item.id,
    track_name: item.track_name,
    description: item.description,
    difficulty: item.difficulty,
    completion_time: item.completion_time,
    completion_min: item.completion_min,
    completion_max: item.completion_max,
    is_range: item.is_range,
    kid_friendly: item.kid_friendly,
    has_alerts: item.has_alerts,
    url_to_thumbnail: item.url_to_thumbnail,
    url_to_webpage: item.url_to_webpage,
    latitude: item.latitude,
    longitude: item.longitude,
    shape_length: item.shape_length,
    district_name: item.district_name,
    district_osm_id: item.district_osm_id,
  }));
}

/**
 * Helper function to convert route coordinates to WKT LINESTRING format
 * @param coordinates - Array of [lng, lat] pairs
 */
export function routeToWKT(coordinates: [number, number][]): string {
  if (coordinates.length === 0) {
    return "LINESTRING EMPTY";
  }
  const points = coordinates.map(([lng, lat]) => `${lng} ${lat}`).join(", ");
  return `LINESTRING(${points})`;
}

/**
 * Get districts along a route by sampling points
 * Uses the get_districts_along_route database function
 */
export async function getDistrictsAlongRoute(
  routeWkt: string,
  samplePoints: number = 10
): Promise<string[]> {
  const { data, error } = await supabase.rpc("get_districts_along_route", {
    route_geometry_wkt: routeWkt,
    sample_points: samplePoints,
  });

  if (error) {
    console.error("Error fetching districts along route:", error);
    return [];
  }

  return (data || [])
    .map((item: any) => item.district_name)
    .filter((name: string | null): name is string => name !== null);
}

/**
 * Create a simple straight-line route between two points with intermediate waypoints
 * This is used when we don't have actual route geometry
 */
export function createStraightLineRoute(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
  waypoints: number = 5
): [number, number][] {
  const coordinates: [number, number][] = [[startLng, startLat]];
  
  // Add intermediate waypoints
  for (let i = 1; i < waypoints; i++) {
    const t = i / waypoints;
    const lat = startLat + (endLat - startLat) * t;
    const lng = startLng + (endLng - startLng) * t;
    coordinates.push([lng, lat]);
  }
  
  coordinates.push([endLng, endLat]);
  return coordinates;
}
