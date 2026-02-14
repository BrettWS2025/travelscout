"use client";

import { useEffect, useRef, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { ExperienceItem } from "@/lib/viator-helpers";
import type { MapRef } from "react-map-gl/mapbox";
import type { FeatureCollection, LineString } from "geojson";
import { searchPlacesByName } from "@/lib/places";
import { parseDisplayName } from "@/lib/trip-planner/utils";
import "mapbox-gl/dist/mapbox-gl.css";

// Dynamically import Map to avoid SSR issues and improve initial load
const Map = dynamic(() => import("react-map-gl/mapbox").then((mod) => mod.Map), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-slate-100 rounded-lg">
      <div className="text-xs text-slate-500">Loading map...</div>
    </div>
  ),
});

const Marker = dynamic(() => import("react-map-gl/mapbox").then((mod) => mod.Marker), {
  ssr: false,
});

const Popup = dynamic(() => import("react-map-gl/mapbox").then((mod) => mod.Popup), {
  ssr: false,
});

const NavigationControl = dynamic(
  () => import("react-map-gl/mapbox").then((mod) => mod.NavigationControl),
  { ssr: false }
);

const Source = dynamic(() => import("react-map-gl/mapbox").then((mod) => mod.Source), {
  ssr: false,
});

const Layer = dynamic(() => import("react-map-gl/mapbox").then((mod) => mod.Layer), {
  ssr: false,
});

type ThingsToDoMapProps = {
  experiences: ExperienceItem[];
  onAddToItinerary?: (experience: ExperienceItem, location: string) => void;
  location: string;
};

// Decode polyline from OSRM
function decodePolyline(encoded: string): [number, number][] {
  const poly: [number, number][] = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    poly.push([lng / 1e5, lat / 1e5]);
  }

  return poly;
}

// Fetch route geometry from OSRM
async function fetchRouteGeometry(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): Promise<[number, number][] | null> {
  try {
    const coords = `${fromLng},${fromLat};${toLng},${toLat}`;
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=polyline&steps=false`;

    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    const route = data.routes?.[0];
    if (!route?.geometry) return null;

    return decodePolyline(route.geometry);
  } catch (error) {
    console.error("Failed to fetch route geometry:", error);
    return null;
  }
}

export default function ThingsToDoMap({
  experiences,
  onAddToItinerary,
  location,
}: ThingsToDoMapProps) {
  const mapRef = useRef<MapRef>(null);
  const [selectedExperience, setSelectedExperience] = useState<ExperienceItem | null>(null);
  const [popupLocation, setPopupLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [anchorLocations, setAnchorLocations] = useState<Array<{ lat: number; lng: number; name: string }>>([]);
  const [routeGeometry, setRouteGeometry] = useState<[number, number][] | null>(null);
  const [loadingRoute, setLoadingRoute] = useState(false);

  // Fetch anchor location coordinates and route (if road sector)
  useEffect(() => {
    async function fetchAnchorLocations() {
      const isRoadSector = location.includes(" to ");
      
      if (isRoadSector) {
        // Road sector: get coordinates for both cities and fetch route
        const [fromCity, toCity] = location.split(" to ").map(s => s.trim());
        
        const [fromPlaces, toPlaces] = await Promise.all([
          searchPlacesByName(fromCity, 1),
          searchPlacesByName(toCity, 1),
        ]);
        
        const locations: Array<{ lat: number; lng: number; name: string }> = [];
        
        if (fromPlaces.length > 0 && fromPlaces[0].lat && fromPlaces[0].lng) {
          locations.push({
            lat: fromPlaces[0].lat,
            lng: fromPlaces[0].lng,
            name: fromCity,
          });
        }
        
        if (toPlaces.length > 0 && toPlaces[0].lat && toPlaces[0].lng) {
          locations.push({
            lat: toPlaces[0].lat,
            lng: toPlaces[0].lng,
            name: toCity,
          });
        }
        
        setAnchorLocations(locations);
        
        // Fetch route geometry if we have both locations
        if (locations.length === 2) {
          setLoadingRoute(true);
          const route = await fetchRouteGeometry(
            locations[0].lat,
            locations[0].lng,
            locations[1].lat,
            locations[1].lng
          );
          setRouteGeometry(route);
          setLoadingRoute(false);
        } else {
          setRouteGeometry(null);
        }
      } else {
        // Single location: get coordinates for the city
        const { cityName } = parseDisplayName(location);
        const places = await searchPlacesByName(cityName || location, 1);
        
        if (places.length > 0 && places[0].lat && places[0].lng) {
          setAnchorLocations([{
            lat: places[0].lat,
            lng: places[0].lng,
            name: cityName || location,
          }]);
        } else {
          setAnchorLocations([]);
        }
        setRouteGeometry(null);
      }
    }
    
    fetchAnchorLocations();
  }, [location]);

  // Filter experiences that have valid coordinates
  const experiencesWithCoords = useMemo(() => {
    return experiences.filter(
      (exp) => exp.latitude !== null && exp.longitude !== null && !isNaN(exp.latitude) && !isNaN(exp.longitude)
    );
  }, [experiences]);

  // Calculate bounds from all experiences and anchor locations
  const bounds = useMemo(() => {
    const allPoints: Array<{ lat: number; lng: number }> = [
      ...experiencesWithCoords.map((exp) => ({ lat: exp.latitude!, lng: exp.longitude! })),
      ...anchorLocations,
    ];
    
    if (allPoints.length === 0) return null;

    const lats = allPoints.map((p) => p.lat);
    const lngs = allPoints.map((p) => p.lng);

    return {
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats),
      minLng: Math.min(...lngs),
      maxLng: Math.max(...lngs),
    };
  }, [experiencesWithCoords, anchorLocations]);

  // Calculate bounds including route geometry
  const boundsWithRoute = useMemo(() => {
    if (!bounds) return null;
    
    if (routeGeometry && routeGeometry.length > 0) {
      // Include route geometry in bounds calculation
      const routeLats = routeGeometry.map(([lng, lat]) => lat);
      const routeLngs = routeGeometry.map(([lng, lat]) => lng);
      
      return {
        minLat: Math.min(bounds.minLat, ...routeLats),
        maxLat: Math.max(bounds.maxLat, ...routeLats),
        minLng: Math.min(bounds.minLng, ...routeLngs),
        maxLng: Math.max(bounds.maxLng, ...routeLngs),
      };
    }
    
    return bounds;
  }, [bounds, routeGeometry]);

  // Fit map to bounds when experiences, anchor locations, or route change
  useEffect(() => {
    if (!mapRef.current || !boundsWithRoute) return;

    const padding = 0.1; // 10% padding
    const latPadding = (boundsWithRoute.maxLat - boundsWithRoute.minLat) * padding;
    const lngPadding = (boundsWithRoute.maxLng - boundsWithRoute.minLng) * padding;

    mapRef.current.fitBounds(
      [
        [boundsWithRoute.minLng - lngPadding, boundsWithRoute.minLat - latPadding],
        [boundsWithRoute.maxLng + lngPadding, boundsWithRoute.maxLat + latPadding],
      ],
      {
        padding: { top: 20, bottom: 20, left: 20, right: 20 },
        duration: 500,
      }
    );
  }, [boundsWithRoute]);

  // Calculate center point for initial view
  const centerPoint = useMemo(() => {
    if (anchorLocations.length > 0) {
      // Use anchor location(s) as center
      if (anchorLocations.length === 1) {
        return { lat: anchorLocations[0].lat, lng: anchorLocations[0].lng };
      } else if (anchorLocations.length === 2) {
        return {
          lat: (anchorLocations[0].lat + anchorLocations[1].lat) / 2,
          lng: (anchorLocations[0].lng + anchorLocations[1].lng) / 2,
        };
      }
    }
    
    if (bounds) {
      return {
        lat: (bounds.minLat + bounds.maxLat) / 2,
        lng: (bounds.minLng + bounds.maxLng) / 2,
      };
    }

    if (experiencesWithCoords.length > 0) {
      return {
        lat: experiencesWithCoords[0].latitude!,
        lng: experiencesWithCoords[0].longitude!,
      };
    }

    // Default to New Zealand center
    return { lat: -41.2865, lng: 174.7762 };
  }, [anchorLocations, bounds, experiencesWithCoords]);

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

  if (!mapboxToken) {
    return (
      <div className="w-full h-[400px] flex items-center justify-center bg-slate-100 rounded-lg border border-slate-200">
        <div className="text-xs text-slate-500 text-center px-4">
          Map unavailable. Mapbox access token required.
        </div>
      </div>
    );
  }

  if (experiencesWithCoords.length === 0) {
    return (
      <div className="w-full h-[400px] flex items-center justify-center bg-slate-100 rounded-lg border border-slate-200">
        <div className="text-xs text-slate-500 text-center px-4">
          No experiences with location data available to display on map.
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-[400px] rounded-lg overflow-hidden border border-slate-200 relative">
      <Map
        ref={mapRef}
        mapboxAccessToken={mapboxToken}
        initialViewState={{
          longitude: centerPoint.lng,
          latitude: centerPoint.lat,
          zoom: 10,
        }}
        style={{ width: "100%", height: "100%" }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        scrollZoom={true}
        onClick={() => {
          setSelectedExperience(null);
          setPopupLocation(null);
        }}
      >
        <NavigationControl position="top-right" />

        {/* Route line for road sectors */}
        {routeGeometry && routeGeometry.length > 0 && (
          <Source
            id="route"
            type="geojson"
            data={{
              type: "FeatureCollection",
              features: [
                {
                  type: "Feature",
                  geometry: {
                    type: "LineString",
                    coordinates: routeGeometry,
                  },
                  properties: {},
                },
              ],
            } as FeatureCollection<LineString>}
          >
            <Layer
              id="route-line"
              type="line"
              paint={{
                "line-color": "#2563EB",
                "line-width": 4,
                "line-opacity": 0.7,
              }}
            />
          </Source>
        )}

        {/* Waypoint markers for anchor locations */}
        {anchorLocations.map((location, index) => {
          const isStart = index === 0;
          const isEnd = anchorLocations.length > 1 && index === anchorLocations.length - 1;
          
          return (
            <Marker
              key={`anchor-${location.name}-${index}`}
              longitude={location.lng}
              latitude={location.lat}
              anchor="center"
            >
              <div
                style={{
                  width: isStart || isEnd ? "32px" : "28px",
                  height: isStart || isEnd ? "32px" : "28px",
                  transform: "translate(-50%, -50%)",
                }}
              >
                <svg
                  width={isStart || isEnd ? "32" : "28"}
                  height={isStart || isEnd ? "32" : "28"}
                  viewBox="0 0 36 36"
                  xmlns="http://www.w3.org/2000/svg"
                  style={{
                    filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.4))",
                  }}
                >
                  {/* Outer ring */}
                  <circle cx="18" cy="18" r="16" fill="white" opacity="0.95" />
                  <circle cx="18" cy="18" r="16" fill="none" stroke="#0B1B2F" strokeWidth="2" />
                  {/* Colored inner circle - green for start, red for end, blue for waypoints */}
                  <circle
                    cx="18"
                    cy="18"
                    r="12"
                    fill={
                      isStart ? "#22FF88" : isEnd ? "#FF3333" : "#4F46E5"
                    }
                  />
                  <circle
                    cx="18"
                    cy="18"
                    r="10"
                    fill={
                      isStart ? "#44FF9A" : isEnd ? "#FF5555" : "#6366F1"
                    }
                  />
                  {/* Center dot */}
                  <circle cx="18" cy="18" r="5" fill="#0B1B2F" />
                  {/* Highlight */}
                  <circle cx="16" cy="16" r="2.5" fill="white" opacity="0.7" />
                </svg>
              </div>
            </Marker>
          );
        })}

        {/* Markers for each experience */}
        {experiencesWithCoords.map((experience) => (
          <Marker
            key={experience.id}
            longitude={experience.longitude!}
            latitude={experience.latitude!}
            anchor="center"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              setSelectedExperience(experience);
              setPopupLocation({
                lat: experience.latitude!,
                lng: experience.longitude!,
              });
            }}
          >
            <div
              className="cursor-pointer"
              style={{
                width: "24px",
                height: "24px",
                transform: "translate(-50%, -50%)",
              }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 32 32"
                xmlns="http://www.w3.org/2000/svg"
                style={{
                  filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.4))",
                }}
              >
                {/* Outer ring */}
                <circle cx="16" cy="16" r="14" fill="white" opacity="0.95" />
                <circle cx="16" cy="16" r="14" fill="none" stroke="#0B1B2F" strokeWidth="1.5" />
                {/* Inner circle */}
                <circle cx="16" cy="16" r="10" fill="#6366F1" />
                <circle cx="16" cy="16" r="8" fill="#4F46E5" />
                {/* Center dot */}
                <circle cx="16" cy="16" r="4" fill="white" />
              </svg>
            </div>
          </Marker>
        ))}

        {/* Popup for selected experience */}
        {selectedExperience && popupLocation && (
          <Popup
            longitude={popupLocation.lng}
            latitude={popupLocation.lat}
            anchor="bottom"
            onClose={() => {
              setSelectedExperience(null);
              setPopupLocation(null);
            }}
            closeButton={true}
            closeOnClick={false}
            maxWidth="300px"
          >
            <div
              className="text-sm space-y-2 p-1"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="font-semibold text-gray-900 text-sm">
                {selectedExperience.title}
              </div>

              {selectedExperience.description && (
                <p className="text-xs text-gray-700 line-clamp-2">
                  {selectedExperience.description}
                </p>
              )}

              <div className="flex items-center gap-2 flex-wrap text-[10px] text-slate-500">
                {selectedExperience.difficulty && (
                  <span className="text-[10px] text-slate-600 bg-slate-200 px-2 py-0.5 rounded-full">
                    {selectedExperience.difficulty}
                  </span>
                )}
                {selectedExperience.type === "viator" && selectedExperience.rating && (
                  <span className="text-[10px] text-slate-600 bg-slate-200 px-2 py-0.5 rounded-full">
                    ⭐ {selectedExperience.rating.toFixed(1)}
                  </span>
                )}
                {selectedExperience.completion_time && (
                  <span>⏱️ {selectedExperience.completion_time}</span>
                )}
                {selectedExperience.duration && (
                  <span>⏱️ {selectedExperience.duration}</span>
                )}
                {selectedExperience.kid_friendly && (
                  <span>👨‍👩‍👧 Kid-friendly</span>
                )}
                {selectedExperience.distance_km && (
                  <span>📍 {selectedExperience.distance_km.toFixed(1)} km away</span>
                )}
                {selectedExperience.type === "viator" && selectedExperience.price && (
                  <span className="font-medium text-indigo-600">💰 {selectedExperience.price}</span>
                )}
              </div>

              <div className="flex items-center gap-2 pt-1 border-t border-gray-200">
                {selectedExperience.type === "viator" ? (
                  <>
                    <a
                      href={selectedExperience.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center rounded-full px-2.5 py-1 text-[10px] font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors border border-indigo-600"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Book now
                    </a>
                    {onAddToItinerary && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddToItinerary(selectedExperience, location);
                        }}
                        className="inline-flex items-center justify-center rounded-full px-2.5 py-1 text-[10px] font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors border border-slate-200"
                      >
                        Add to itinerary
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <a
                      href={selectedExperience.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center rounded-full px-2.5 py-1 text-[10px] font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors border border-slate-200"
                      onClick={(e) => e.stopPropagation()}
                    >
                      More Detail
                    </a>
                    {onAddToItinerary && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddToItinerary(selectedExperience, location);
                        }}
                        className="inline-flex items-center justify-center rounded-full px-2.5 py-1 text-[10px] font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                      >
                        Add to itinerary
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </Popup>
        )}
      </Map>
    </div>
  );
}
