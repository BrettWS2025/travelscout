// components/TripMap.tsx
"use client";

import { useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-routing-machine/dist/leaflet-routing-machine.css";
import L, { LatLngExpression, Icon } from "leaflet";
import "leaflet-routing-machine";

export type TripMapPoint = {
  lat: number;
  lng: number;
  name?: string;
};

// --- Custom marker icons (using your SVGs in /public/markers) ---
const startIcon = new Icon({
  iconUrl: "/markers/start.svg",
  iconSize: [28, 28],
  iconAnchor: [14, 14], // center the icon
});

const waypointIcon = new Icon({
  iconUrl: "/markers/waypoint.svg",
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const endIcon = new Icon({
  iconUrl: "/markers/end.svg",
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

// --- Routing Layer (draws the road-following route) ---
function RoutingLayer({ points }: { points: TripMapPoint[] }) {
  const map = useMap();

  useEffect(() => {
    if (!map || points.length < 2) return;

    const waypoints: LatLngExpression[] = points.map((p) => [
      p.lat,
      p.lng,
    ]);

    const routingControl = (L as any).Routing.control({
      waypoints,
      routeWhileDragging: false,
      addWaypoints: false,
      draggableWaypoints: false,
      show: false, // hide directions panel
      fitSelectedRoutes: true,
      lineOptions: {
        addWaypoints: false,
        extendToWaypoints: true,
        missingRouteTolerance: 0,
        styles: [
          {
            color: "#6EE7FF",
            weight: 5,
            opacity: 0.9,
          },
        ],
      },
      // IMPORTANT: don't let routing-machine create its own default markers
      createMarker: () => null,
    }).addTo(map);

    return () => {
      map.removeControl(routingControl);
    };
  }, [map, points]);

  return null;
}

export default function TripMap({ points }: { points: TripMapPoint[] }) {
  if (!points || points.length === 0) return null;

  const first = points[0];

  return (
    <MapContainer
      center={[first.lat, first.lng]}
      zoom={6}
      scrollWheelZoom={false}
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* Road route */}
      <RoutingLayer points={points} />

      {/* Our own markers: start → waypoints → end */}
      {points.map((p, i) => {
        const icon =
          i === 0
            ? startIcon
            : i === points.length - 1
            ? endIcon
            : waypointIcon;

        return (
          <Marker
            key={`${p.lat}-${p.lng}-${i}`}
            position={[p.lat, p.lng]}
            icon={icon}
          >
            <Popup>{p.name ?? "Stop"}</Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
