"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MapRef } from "react-map-gl/mapbox";
import type { NearbyPlace } from "@/lib/hooks/useNearbyPlaces";
import { saveHotelSelectionEvent } from "@/lib/hotels.api";

const Map = dynamic(() => import("react-map-gl/mapbox").then((mod) => mod.Map), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[320px] flex items-center justify-center bg-slate-100">
      <div className="text-xs text-slate-500">Loading map...</div>
    </div>
  ),
});

const Marker = dynamic(() => import("react-map-gl/mapbox").then((mod) => mod.Marker), { ssr: false });

const Popup = dynamic(() => import("react-map-gl/mapbox").then((mod) => mod.Popup), { ssr: false });

const NavigationControl = dynamic(
  () => import("react-map-gl/mapbox").then((mod) => mod.NavigationControl),
  { ssr: false }
);

export type NearbyHotelsMapProps = {
  places: NearbyPlace[];
  centerLat: number;
  centerLng: number;
  locationLabel?: string;
  /** Pin character(s) shown on the map for each place. */
  markerEmoji?: string;
  /** Used in empty-state copy, e.g. "hotels" or "restaurants". */
  placeTypePlural?: string;
  /**
   * Search origin (e.g. manual hotel). Shown as a distinct pin from `markerEmoji` place markers
   * so the anchor stays visible on the restaurants map.
   */
  searchOriginPin?: {
    lat: number;
    lng: number;
    label?: string;
  };
};

export default function NearbyHotelsMap({
  places,
  centerLat,
  centerLng,
  locationLabel,
  markerEmoji = "🏨",
  placeTypePlural = "hotels",
  searchOriginPin,
}: NearbyHotelsMapProps) {
  const mapRef = useRef<MapRef>(null);
  const [popupPlace, setPopupPlace] = useState<NearbyPlace | null>(null);
  const [popupOriginOpen, setPopupOriginOpen] = useState(false);

  const withCoords = useMemo(
    () =>
      places.filter(
        (p): p is NearbyPlace & { lat: number; lng: number } =>
          typeof p.lat === "number" &&
          typeof p.lng === "number" &&
          Number.isFinite(p.lat) &&
          Number.isFinite(p.lng)
      ),
    [places]
  );

  const bounds = useMemo(() => {
    const pts: { lat: number; lng: number }[] = [
      ...withCoords.map((p) => ({ lat: p.lat, lng: p.lng })),
      { lat: centerLat, lng: centerLng },
    ];
    if (searchOriginPin) {
      pts.push({ lat: searchOriginPin.lat, lng: searchOriginPin.lng });
    }
    const lats = pts.map((p) => p.lat);
    const lngs = pts.map((p) => p.lng);
    return {
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats),
      minLng: Math.min(...lngs),
      maxLng: Math.max(...lngs),
    };
  }, [withCoords, centerLat, centerLng, searchOriginPin]);

  useEffect(() => {
    if (!mapRef.current) return;
    const latSpan = Math.max(bounds.maxLat - bounds.minLat, 0.015);
    const lngSpan = Math.max(bounds.maxLng - bounds.minLng, 0.015);
    const latPad = latSpan * 0.12;
    const lngPad = lngSpan * 0.12;
    mapRef.current.fitBounds(
      [
        [bounds.minLng - lngPad, bounds.minLat - latPad],
        [bounds.maxLng + lngPad, bounds.maxLat + latPad],
      ],
      { padding: { top: 36, bottom: 36, left: 36, right: 36 }, duration: 400, maxZoom: 15 }
    );
  }, [bounds]);

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

  if (!mapboxToken) {
    return (
      <div className="w-full min-h-[320px] flex items-center justify-center bg-slate-100 rounded-xl border border-slate-200 px-4">
        <p className="text-xs text-slate-500 text-center">
          Map unavailable. Set <code className="text-slate-700">NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN</code> to show{" "}
          {placeTypePlural} on a map.
        </p>
      </div>
    );
  }

  if (withCoords.length === 0 && !searchOriginPin) {
    return (
      <div className="w-full min-h-[200px] flex items-center justify-center bg-slate-50 rounded-xl border border-slate-200 px-4">
        <p className="text-xs text-slate-500 text-center">
          No {placeTypePlural} with map coordinates{locationLabel ? ` near ${locationLabel}` : ""}.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full h-[min(55vh,420px)] min-h-[320px] rounded-xl overflow-hidden border border-slate-200 relative">
      <Map
        ref={mapRef}
        mapboxAccessToken={mapboxToken}
        initialViewState={{
          longitude: centerLng,
          latitude: centerLat,
          zoom: 12,
        }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        reuseMaps
      >
        <NavigationControl position="top-right" />
        {searchOriginPin &&
          Number.isFinite(searchOriginPin.lat) &&
          Number.isFinite(searchOriginPin.lng) && (
            <Marker
              longitude={searchOriginPin.lng}
              latitude={searchOriginPin.lat}
              anchor="bottom"
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                setPopupPlace(null);
                setPopupOriginOpen(true);
              }}
            >
              <div
                className="cursor-pointer flex flex-col items-center"
                role="button"
                tabIndex={0}
                aria-label={searchOriginPin.label || "Your hotel"}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter" || ev.key === " ") {
                    ev.preventDefault();
                    setPopupPlace(null);
                    setPopupOriginOpen(true);
                  }
                }}
              >
                <span
                  className="text-2xl drop-shadow-md ring-2 ring-amber-400/90 rounded-full bg-white/90 p-0.5"
                  aria-hidden
                >
                  🏨
                </span>
              </div>
            </Marker>
          )}
        {withCoords.map((place) => (
          <Marker
            key={place.id}
            longitude={place.lng}
            latitude={place.lat}
            anchor="bottom"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              setPopupOriginOpen(false);
              setPopupPlace(place);
            }}
          >
            <div className="cursor-pointer flex flex-col items-center">
              <span className="text-xl drop-shadow-md" aria-hidden>
                {markerEmoji}
              </span>
            </div>
          </Marker>
        ))}
        {popupOriginOpen && searchOriginPin && (
          <Popup
            longitude={searchOriginPin.lng}
            latitude={searchOriginPin.lat}
            anchor="top"
            onClose={() => setPopupOriginOpen(false)}
            closeOnClick={false}
            maxWidth="280px"
          >
            <div className="text-xs space-y-1 p-0.5">
              <div className="font-semibold text-slate-900 pr-6">{searchOriginPin.label || "Your hotel"}</div>
              <div className="text-slate-500">Search center for nearby restaurants</div>
            </div>
          </Popup>
        )}
        {popupPlace &&
          typeof popupPlace.lat === "number" &&
          typeof popupPlace.lng === "number" && (
            <Popup
              longitude={popupPlace.lng}
              latitude={popupPlace.lat}
              anchor="top"
              onClose={() => setPopupPlace(null)}
              closeOnClick={false}
              maxWidth="280px"
            >
              <div className="text-xs space-y-1 p-0.5">
                <div className="font-semibold text-slate-900 pr-6">{popupPlace.name}</div>
                {popupPlace.address && <div className="text-slate-600">{popupPlace.address}</div>}
                {typeof popupPlace.rating === "number" && (
                  <div className="text-slate-600">
                    ★ {popupPlace.rating.toFixed(1)}
                    {typeof popupPlace.userRatingCount === "number" && popupPlace.userRatingCount > 0
                      ? ` (${popupPlace.userRatingCount} reviews)`
                      : ""}
                  </div>
                )}
                {popupPlace.priceLabel && <div className="text-slate-600">{popupPlace.priceLabel}</div>}
                <div className="flex flex-wrap gap-2 pt-1">
                  {popupPlace.bookingUrl && (
                    <a
                      href={popupPlace.bookingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => {
                        void saveHotelSelectionEvent({
                          provider: popupPlace.provider || "google_places",
                          actionType: "book_now",
                          hotelName: popupPlace.name,
                          address: popupPlace.address,
                          city: popupPlace.city,
                          rating: popupPlace.rating ?? null,
                          averageNightlyRate: popupPlace.averageNightlyRate ?? null,
                          currencyCode: popupPlace.currencyCode,
                          searchCheckin: popupPlace.searchCheckin,
                          searchCheckout: popupPlace.searchCheckout,
                          productId: popupPlace.productId,
                          hotelId: popupPlace.id,
                          bookingUrl: popupPlace.bookingUrl,
                          googleMapsUri: popupPlace.googleMapsUri,
                          latitude: popupPlace.lat ?? null,
                          longitude: popupPlace.lng ?? null,
                          metadata: {
                            sourceSurface: "nearby_hotels_map_popup",
                          },
                        });
                      }}
                      className="text-emerald-600 font-medium hover:underline"
                    >
                      Book now
                    </a>
                  )}
                  {popupPlace.googleMapsUri && (
                    <a
                      href={popupPlace.googleMapsUri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 font-medium hover:underline"
                    >
                      Open in Maps
                    </a>
                  )}
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${popupPlace.lat},${popupPlace.lng}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 font-medium hover:underline"
                  >
                    Directions
                  </a>
                </div>
              </div>
            </Popup>
          )}
      </Map>
    </div>
  );
}
