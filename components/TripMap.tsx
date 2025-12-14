// components/TripMap.tsx
"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-routing-machine/dist/leaflet-routing-machine.css";
import L, { LatLngExpression } from "leaflet";
import "leaflet-routing-machine";

export type TripMapPoint = {
  lat: number;
  lng: number;
  name?: string;
};

function RoutingLayer({ points }: { points: TripMapPoint[] }) {
  const map = useMap();

  useEffect(() => {
    if (!map || points.length < 2) return;

    const waypoints: LatLngExpression[] = points.map((p) => [
      p.lat,
      p.lng,
    ]);

    // leaflet-routing-machine attaches `Routing` onto the Leaflet namespace at runtime.
    // TypeScript doesn't know about it, so we cast `L` to `any` here.
    const routingControl = (L as any).Routing.control({
      waypoints,
      routeWhileDragging: false,
      addWaypoints: false,
      draggableWaypoints: false,
      show: false, // hide the default directions panel
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
      // Hide markers for now so we don't need to ship custom icon assets
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
      <RoutingLayer points={points} />
    </MapContainer>
  );
}
