// components/TripMap.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Map, { Marker, Source, Layer, Popup, NavigationControl } from "react-map-gl/mapbox";
import type { MapRef } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import type { FeatureCollection, LineString } from "geojson";

export type TripMapPoint = {
  lat: number;
  lng: number;
  name?: string;
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

export default function TripMap({ points }: { points: TripMapPoint[] }) {
  const mapRef = useRef<MapRef>(null);
  const [routeGeometry, setRouteGeometry] = useState<[number, number][] | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<TripMapPoint | null>(null);
  const [popupLocation, setPopupLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Fetch route geometry when points change
  useEffect(() => {
    if (points.length >= 2) {
      fetchRouteGeometry(points).then(setRouteGeometry);
    } else {
      setRouteGeometry(null);
    }
  }, [points]);

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
        setPopupLocation(null);
      }}
    >
      {/* Navigation controls (zoom in/out) */}
      <NavigationControl position="top-right" />
      
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

      {/* Popup */}
      {selectedPoint && popupLocation && (
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
    </Map>
  );
}
