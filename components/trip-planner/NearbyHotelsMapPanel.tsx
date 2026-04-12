"use client";

import { useEffect, useState } from "react";
import { Bed, ChevronLeft } from "lucide-react";
import { getCityById, NZ_CITIES, searchPlacesByName, type NzCity } from "@/lib/nzCities";
import { useNearbyPlaces } from "@/lib/hooks/useNearbyPlaces";
import NearbyHotelsMap from "@/components/trip-planner/NearbyHotelsMap";

type Props = {
  cityId: string;
  cityName: string;
  onBack: () => void;
};

/**
 * Full-width panel: map of nearby hotels for the selected trip stop.
 * Uses the same `useNearbyPlaces` query params as the day carousel so React Query serves cache (no extra Places calls).
 */
export default function NearbyHotelsMapPanel({ cityId, cityName, onBack }: Props) {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | undefined>(undefined);

  useEffect(() => {
    if (!cityId) {
      setCoords(undefined);
      return;
    }
    const c = getCityById(cityId);
    if (c) {
      setCoords({ lat: c.lat, lng: c.lng });
      return;
    }
    const place = NZ_CITIES.find((p: NzCity) => p.name.toLowerCase() === cityName.toLowerCase());
    if (place) {
      setCoords({ lat: place.lat, lng: place.lng });
      return;
    }
    searchPlacesByName(cityName, 1)
      .then((results) => {
        if (results.length > 0) setCoords({ lat: results[0].lat, lng: results[0].lng });
        else setCoords(undefined);
      })
      .catch(() => setCoords(undefined));
  }, [cityId, cityName]);

  const { places, loading, error } = useNearbyPlaces({
    lat: coords?.lat,
    lng: coords?.lng,
    radiusMeters: 8000,
    maxPlaces: 20,
    includedType: "lodging",
    sortBy: "rating",
  });

  const canLoad = coords !== undefined;

  return (
    <div className="flex-1 min-w-0">
      <div className="space-y-6">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to day view
        </button>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-1">
            <Bed className="w-4 h-4 text-indigo-600 shrink-0" aria-hidden />
            <h4 className="text-sm font-semibold text-slate-900">Where to stay — map</h4>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Up to 20 hotels within 8 km of {cityName}, sorted by rating (same search as the day view carousel).
          </p>
          {!canLoad || loading ? (
            <div className="text-xs text-slate-600 text-center py-12">Loading hotels…</div>
          ) : error ? (
            <div className="text-xs text-slate-500 text-center py-12">{error}</div>
          ) : coords ? (
            <NearbyHotelsMap
              places={places}
              centerLat={coords.lat}
              centerLng={coords.lng}
              locationLabel={cityName}
              markerEmoji="🏨"
              placeTypePlural="hotels"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
