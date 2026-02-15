// components/TripMap.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Map, { Marker, Source, Layer, Popup, NavigationControl } from "react-map-gl/mapbox";
import type { MapRef } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import type { FeatureCollection, LineString, Point } from "geojson";

export type TripMapPoint = {
  lat: number;
  lng: number;
  name?: string;
};

type Toilet = {
  lat: number;
  lng: number;
  name?: string;
  id: number;
  address?: {
    street?: string;
    housenumber?: string;
    city?: string;
    postcode?: string;
    country?: string;
  };
  wheelchair?: string; // "yes", "no", "limited"
  fee?: string; // "yes", "no"
  access?: string; // "public", "private", "customers", etc.
  openingHours?: string;
  operator?: string;
  description?: string;
};

// Helper function to decode polyline from OSRM
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
async function fetchRouteGeometry(points: TripMapPoint[]): Promise<[number, number][] | null> {
  if (points.length < 2) return null;

  try {
    const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");
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

// Calculate bounding box from route geometry
function getBoundingBox(routeGeometry: [number, number][]): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  if (routeGeometry.length === 0) {
    return { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 };
  }

  const lats = routeGeometry.map(([lng, lat]) => lat);
  const lngs = routeGeometry.map(([lng, lat]) => lng);

  return {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLng: Math.min(...lngs),
    maxLng: Math.max(...lngs),
  };
}

// Calculate distance between two points in kilometers (Haversine formula)
function distanceInKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Find the minimum distance from a point to the route
function minDistanceToRoute(lat: number, lng: number, routeGeometry: [number, number][]): number {
  let minDist = Infinity;
  for (let i = 0; i < routeGeometry.length - 1; i++) {
    const [lng1, lat1] = routeGeometry[i];
    const [lng2, lat2] = routeGeometry[i + 1];
    
    // Calculate distance to line segment
    const dist = distanceToLineSegment(lat, lng, lat1, lng1, lat2, lng2);
    minDist = Math.min(minDist, dist);
  }
  return minDist;
}

// Calculate distance from a point to a line segment
function distanceToLineSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const A = px - x1;
  const B = py - y1;
  const C = x2 - x1;
  const D = y2 - y1;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;
  if (lenSq !== 0) param = dot / lenSq;

  let xx: number, yy: number;

  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }

  const dx = px - xx;
  const dy = py - yy;
  return distanceInKm(py, px, yy, xx);
}

// Fetch toilets from OSM Overpass API along the route
async function fetchToiletsAlongRoute(routeGeometry: [number, number][]): Promise<Toilet[]> {
  if (!routeGeometry || routeGeometry.length === 0) return [];

  try {
    const bbox = getBoundingBox(routeGeometry);
    // Add a buffer of about 5km to the bounding box
    const buffer = 0.045; // approximately 5km in degrees
    const minLat = bbox.minLat - buffer;
    const maxLat = bbox.maxLat + buffer;
    const minLng = bbox.minLng - buffer;
    const maxLng = bbox.maxLng + buffer;

    // Overpass API query for toilets
    const overpassQuery = `
      [out:json][timeout:25];
      (
        node["amenity"="toilets"](${minLat},${minLng},${maxLat},${maxLng});
        way["amenity"="toilets"](${minLat},${minLng},${maxLat},${maxLng});
        relation["amenity"="toilets"](${minLat},${minLng},${maxLat},${maxLng});
      );
      out center;
    `;

    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`;
    const res = await fetch(url);
    
    if (!res.ok) {
      console.error("Failed to fetch toilets from OSM:", res.status);
      return [];
    }

    const data = await res.json();
    const toilets: Toilet[] = [];

    // Process the results
    if (data.elements) {
      for (const element of data.elements) {
        let lat: number, lng: number;
        
        if (element.type === "node") {
          lat = element.lat;
          lng = element.lon;
        } else if (element.center) {
          lat = element.center.lat;
          lng = element.center.lon;
        } else {
          continue;
        }

        // Filter toilets that are within 5km of the route
        const dist = minDistanceToRoute(lat, lng, routeGeometry);
        if (dist <= 5) {
          const tags = element.tags || {};
          
          // Build address object
          const address: Toilet["address"] = {};
          if (tags["addr:street"]) address.street = tags["addr:street"];
          if (tags["addr:housenumber"]) address.housenumber = tags["addr:housenumber"];
          if (tags["addr:city"]) address.city = tags["addr:city"];
          if (tags["addr:postcode"]) address.postcode = tags["addr:postcode"];
          if (tags["addr:country"]) address.country = tags["addr:country"];
          
          // Only include address if at least one field exists
          const hasAddress = Object.keys(address).length > 0;
          
          toilets.push({
            lat,
            lng,
            name: tags.name || tags["name:en"] || undefined,
            id: element.id,
            address: hasAddress ? address : undefined,
            wheelchair: tags.wheelchair || undefined,
            fee: tags.fee || undefined,
            access: tags.access || undefined,
            openingHours: tags["opening_hours"] || undefined,
            operator: tags.operator || undefined,
            description: tags.description || undefined,
          });
        }
      }
    }

    return toilets;
  } catch (error) {
    console.error("Error fetching toilets from OSM:", error);
    return [];
  }
}

export default function TripMap({ points }: { points: TripMapPoint[] }) {
  const mapRef = useRef<MapRef>(null);
  const [selectedPoint, setSelectedPoint] = useState<TripMapPoint | null>(null);
  const [popupLocation, setPopupLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [showToilets, setShowToilets] = useState(false);
  const [selectedToilet, setSelectedToilet] = useState<Toilet | null>(null);

  // Fetch route geometry using React Query
  const { data: routeGeometry } = useQuery({
    queryKey: ["routeGeometry", points.map(p => `${p.lat},${p.lng}`).join(";")],
    queryFn: () => fetchRouteGeometry(points),
    enabled: points.length >= 2,
  });

  // Fetch toilets using React Query
  const { data: toilets = [], isLoading: toiletsLoading } = useQuery({
    queryKey: ["toilets", routeGeometry?.map(([lng, lat]) => `${lat},${lng}`).join(";")],
    queryFn: () => fetchToiletsAlongRoute(routeGeometry!),
    enabled: showToilets && !!routeGeometry && routeGeometry.length > 0,
  });

  // Clear selected toilet when toilets are hidden
  useEffect(() => {
    if (!showToilets) {
      setSelectedToilet(null);
    }
  }, [showToilets]);

  // Fit map bounds to all points
  useEffect(() => {
    if (!mapRef.current || points.length === 0) return;

    const bounds = points.reduce(
      (acc, point) => {
        return {
          minLng: Math.min(acc.minLng, point.lng),
          maxLng: Math.max(acc.maxLng, point.lng),
          minLat: Math.min(acc.minLat, point.lat),
          maxLat: Math.max(acc.maxLat, point.lat),
        };
      },
      {
        minLng: points[0].lng,
        maxLng: points[0].lng,
        minLat: points[0].lat,
        maxLat: points[0].lat,
      }
    );

    mapRef.current.fitBounds(
      [
        [bounds.minLng, bounds.minLat],
        [bounds.maxLng, bounds.maxLat],
      ],
      {
        padding: { top: 50, bottom: 50, left: 50, right: 50 },
        duration: 1000,
      }
    );
  }, [points]);

  if (!points || points.length === 0) return null;

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  if (!mapboxToken) {
    console.warn("Mapbox access token not found. Please set NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN in your .env.local file.");
    return (
      <div className="flex items-center justify-center h-full bg-gray-100 text-gray-600">
        <p className="text-sm">Mapbox access token required. See setup instructions.</p>
      </div>
    );
  }

  const first = points[0];

  // Create GeoJSON for the route line
  const routeGeoJSON: FeatureCollection<LineString> = routeGeometry
    ? {
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
      }
    : {
        type: "FeatureCollection",
        features: [],
      };

  return (
    <Map
      ref={mapRef}
      mapboxAccessToken={mapboxToken}
      initialViewState={{
        longitude: first.lng,
        latitude: first.lat,
        zoom: 6,
      }}
      style={{ width: "100%", height: "100%" }}
      mapStyle="mapbox://styles/mapbox/streets-v12"
      scrollZoom={true}
      onClick={() => {
        // Close popup when clicking anywhere on the map
        setSelectedPoint(null);
        setSelectedToilet(null);
        setPopupLocation(null);
      }}
    >
      {/* Navigation controls (zoom in/out) */}
      <NavigationControl position="top-right" />
      
      {/* Toilet toggle button */}
      <div className="absolute top-4 left-4 z-10">
        <button
          onClick={() => setShowToilets(!showToilets)}
          className={`
            px-4 py-2 rounded-lg shadow-lg font-medium text-sm
            transition-colors duration-200 flex items-center gap-2
            ${showToilets 
              ? "bg-blue-600 text-white hover:bg-blue-700" 
              : "bg-white text-gray-700 hover:bg-gray-50"
            }
          `}
          title={showToilets ? `Hide toilets (${toilets.length} found)` : "Show toilets along route"}
          disabled={toiletsLoading}
        >
          {toiletsLoading ? (
            <>
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Loading...</span>
            </>
          ) : (
            <>
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                width="16" 
                height="16" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <path d="M9 3v18"/>
                <path d="M15 3v18"/>
                <path d="M3 9h18"/>
                <path d="M3 15h18"/>
              </svg>
              <span>Toilets</span>
            </>
          )}
        </button>
      </div>
      
      {/* Route line */}
      {routeGeometry && routeGeometry.length > 0 && (
        <Source id="route" type="geojson" data={routeGeoJSON}>
          <Layer
            id="route-line"
            type="line"
            paint={{
              "line-color": "#2563EB",
              "line-width": 5,
              "line-opacity": 0.9,
            }}
          />
        </Source>
      )}

      {/* Markers */}
      {points.map((p, i) => {
        const isStart = i === 0;
        const isEnd = i === points.length - 1;
        const iconName = isStart ? "start" : isEnd ? "end" : "waypoint";

        return (
          <Marker
            key={`${p.lat}-${p.lng}-${i}`}
            longitude={p.lng}
            latitude={p.lat}
            anchor="center"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              setSelectedPoint(p);
              setSelectedToilet(null);
              setPopupLocation({ lat: p.lat, lng: p.lng });
            }}
          >
            {isStart || isEnd ? (
              <div
                className="cursor-pointer"
                style={{
                  width: "28px",
                  height: "28px",
                  transform: "translate(-50%, -50%)",
                }}
              >
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 36 36"
                  xmlns="http://www.w3.org/2000/svg"
                  style={{
                    filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.4))",
                  }}
                >
                  {/* Outer ring */}
                  <circle cx="18" cy="18" r="16" fill="white" opacity="0.95" />
                  <circle cx="18" cy="18" r="16" fill="none" stroke="#0B1B2F" strokeWidth="2" />
                  {/* Colored inner circle */}
                  <circle cx="18" cy="18" r="12" fill={isStart ? "#44FF9A" : "#FF5555"} />
                  <circle cx="18" cy="18" r="10" fill={isStart ? "#22FF88" : "#FF3333"} />
                  {/* Center dot */}
                  <circle cx="18" cy="18" r="5" fill="#0B1B2F" />
                  {/* Highlight */}
                  <circle cx="16" cy="16" r="2.5" fill="white" opacity="0.7" />
                </svg>
              </div>
            ) : (
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
                  <circle cx="16" cy="16" r="14" fill="white" opacity="0.9" />
                  <circle cx="16" cy="16" r="14" fill="none" stroke="#0B1B2F" strokeWidth="1.5" />
                  {/* Inner circle with gradient effect */}
                  <circle cx="16" cy="16" r="10" fill="#6EE7FF" />
                  <circle cx="16" cy="16" r="8" fill="#4DD4FF" />
                  {/* Center dot */}
                  <circle cx="16" cy="16" r="4" fill="#0B1B2F" />
                  {/* Highlight */}
                  <circle cx="14" cy="14" r="2" fill="white" opacity="0.6" />
                </svg>
              </div>
            )}
          </Marker>
        );
      })}

      {/* Toilet markers */}
      {showToilets && toilets.map((toilet) => (
        <Marker
          key={`toilet-${toilet.id}`}
          longitude={toilet.lng}
          latitude={toilet.lat}
          anchor="center"
          onClick={(e) => {
            e.originalEvent.stopPropagation();
            setSelectedToilet(toilet);
            setSelectedPoint(null);
            setPopupLocation({ lat: toilet.lat, lng: toilet.lng });
          }}
        >
          <div
            className="cursor-pointer"
            style={{
              width: "20px",
              height: "20px",
              transform: "translate(-50%, -50%)",
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              style={{
                filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.3))",
              }}
            >
              <circle cx="12" cy="12" r="10" fill="#8B5CF6" opacity="0.95" />
              <circle cx="12" cy="12" r="10" fill="none" stroke="white" strokeWidth="1.5" />
              {/* Toilet icon */}
              <rect x="8" y="6" width="8" height="10" rx="1" fill="white" />
              <rect x="9" y="7" width="6" height="6" fill="#8B5CF6" />
              <circle cx="12" cy="10" r="1.5" fill="white" />
              <path d="M10 13h4" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M9 17h6" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
        </Marker>
      ))}

      {/* Popup for trip points */}
      {selectedPoint && popupLocation && !selectedToilet && (
        <Popup
          longitude={popupLocation.lng}
          latitude={popupLocation.lat}
          anchor="bottom"
          onClose={() => {
            setSelectedPoint(null);
            setPopupLocation(null);
          }}
          closeButton={true}
          closeOnClick={false}
        >
          <div className="text-sm font-medium text-gray-900">{selectedPoint.name ?? "Stop"}</div>
        </Popup>
      )}

      {/* Popup for toilets */}
      {selectedToilet && popupLocation && (
        <Popup
          longitude={popupLocation.lng}
          latitude={popupLocation.lat}
          anchor="bottom"
          onClose={() => {
            setSelectedToilet(null);
            setPopupLocation(null);
          }}
          closeButton={true}
          closeOnClick={false}
          maxWidth="300px"
        >
          <div 
            className="text-sm space-y-2 p-0.5"
            onClick={(e) => {
              // Prevent closing when clicking inside the popup
              e.stopPropagation();
            }}
            style={{
              borderRadius: "12px",
            }}
          >
            <div className="font-semibold text-gray-900 text-sm">
              {selectedToilet.name ?? "Public Toilet"}
            </div>
            
            {/* Address */}
            {selectedToilet.address && (
              <div className="text-gray-700 bg-gray-50 rounded-lg p-2">
                <div className="font-medium text-xs text-gray-500 mb-1 uppercase tracking-wide">Address</div>
                <div className="text-xs leading-snug">
                  {[
                    selectedToilet.address.housenumber,
                    selectedToilet.address.street,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  {selectedToilet.address.street && <br />}
                  {[
                    selectedToilet.address.city,
                    selectedToilet.address.postcode,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  {selectedToilet.address.country && (
                    <>
                      <br />
                      {selectedToilet.address.country}
                    </>
                  )}
                </div>
              </div>
            )}
            
            {/* Details grid */}
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              {/* Wheelchair accessibility */}
              {selectedToilet.wheelchair && (
                <div className="bg-blue-50 rounded-md p-1.5">
                  <div className="text-gray-500 text-xs mb-0.5">Wheelchair</div>
                  <div className="font-medium text-gray-700 capitalize text-xs">
                    {selectedToilet.wheelchair === "yes" ? "✓ Accessible" : 
                     selectedToilet.wheelchair === "limited" ? "Limited" : 
                     "Not accessible"}
                  </div>
                </div>
              )}
              
              {/* Fee */}
              {selectedToilet.fee && (
                <div className="bg-green-50 rounded-md p-1.5">
                  <div className="text-gray-500 text-xs mb-0.5">Fee</div>
                  <div className="font-medium text-gray-700 capitalize text-xs">
                    {selectedToilet.fee === "yes" ? "Paid" : "Free"}
                  </div>
                </div>
              )}
              
              {/* Access */}
              {selectedToilet.access && (
                <div className="col-span-2 bg-purple-50 rounded-md p-1.5">
                  <div className="text-gray-500 text-xs mb-0.5">Access</div>
                  <div className="font-medium text-gray-700 capitalize text-xs">
                    {selectedToilet.access}
                  </div>
                </div>
              )}
              
              {/* Opening hours */}
              {selectedToilet.openingHours && (
                <div className="col-span-2 bg-amber-50 rounded-md p-1.5">
                  <div className="text-gray-500 text-xs mb-0.5">Opening Hours</div>
                  <div className="font-medium text-gray-700 text-xs">
                    {selectedToilet.openingHours}
                  </div>
                </div>
              )}
              
              {/* Operator */}
              {selectedToilet.operator && (
                <div className="col-span-2 bg-gray-50 rounded-md p-1.5">
                  <div className="text-gray-500 text-xs mb-0.5">Operator</div>
                  <div className="font-medium text-gray-700 text-xs">
                    {selectedToilet.operator}
                  </div>
                </div>
              )}
            </div>
            
            {/* Description */}
            {selectedToilet.description && (
              <div className="text-xs text-gray-600 italic pt-1.5 border-t border-gray-200 leading-snug">
                {selectedToilet.description}
              </div>
            )}
          </div>
        </Popup>
      )}
    </Map>
  );
}
