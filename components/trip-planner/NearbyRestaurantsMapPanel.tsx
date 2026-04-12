"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, Utensils } from "lucide-react";
import { getCityById, NZ_CITIES, searchPlacesByName, type NzCity } from "@/lib/nzCities";
import { useNearbyPlaces } from "@/lib/hooks/useNearbyPlaces";
import NearbyHotelsMap from "@/components/trip-planner/NearbyHotelsMap";

type Props = {
  cityId: string;
  cityName: string;
  onBack: () => void;
  /** When set (e.g. manual hotel resolved in Places), restaurant search matches the day carousel anchored here. */
  anchorLat?: number;
  anchorLng?: number;
  /** Manual hotel present but not resolved — do not fall back to city center for restaurants. */
  suppressNearbySearch?: boolean;
  /** Display name for the hotel pin on the map (when anchored to a resolved hotel). */
  anchorLabel?: string;
};

/**
 * Full-width panel: map of nearby restaurants for the selected trip stop.
 * Uses the same `useNearbyPlaces` query params as the day carousel so React Query serves cache (no extra Places calls).
 */
export default function NearbyRestaurantsMapPanel({
  cityId,
  cityName,
  onBack,
  anchorLat,
  anchorLng,
  anchorLabel,
  suppressNearbySearch,
}: Props) {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | undefined>(undefined);

  useEffect(() => {
    if (suppressNearbySearch) {
      setCoords(undefined);
      return;
    }
    if (
      typeof anchorLat === "number" &&
      typeof anchorLng === "number" &&
      Number.isFinite(anchorLat) &&
      Number.isFinite(anchorLng)
    ) {
      setCoords({ lat: anchorLat, lng: anchorLng });
      return;
    }
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
  }, [cityId, cityName, anchorLat, anchorLng, suppressNearbySearch]);

  const { places, loading, error } = useNearbyPlaces({
    lat: coords?.lat,
    lng: coords?.lng,
    radiusMeters: 5000,
    maxPlaces: 20,
    includedType: "restaurant",
    sortBy: "rating",
  });

  const anchoredToHotel =
    typeof anchorLat === "number" &&
    typeof anchorLng === "number" &&
    Number.isFinite(anchorLat) &&
    Number.isFinite(anchorLng);
  const mapLocationLabel = anchoredToHotel ? "your hotel" : cityName;
  const canLoad = coords !== undefined && !suppressNearbySearch;

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
            <Utensils className="w-4 h-4 text-indigo-600 shrink-0" aria-hidden />
            <h4 className="text-sm font-semibold text-slate-900">Places to eat — map</h4>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            {suppressNearbySearch ? (
              <>
                Choose your hotel from Google search on the day view first. Nearby restaurants are anchored to the
                hotel once it resolves to a place—we don’t use the city center for this section until then.
              </>
            ) : (
              <>
                Up to 20 restaurants within 5 km of {mapLocationLabel}, sorted by rating (same search as the day view
                carousel).
              </>
            )}
          </p>
          {suppressNearbySearch ? (
            <div className="text-xs text-slate-500 text-center py-12">No map until the hotel is resolved.</div>
          ) : !canLoad || loading ? (
            <div className="text-xs text-slate-600 text-center py-12">Loading restaurants…</div>
          ) : error ? (
            <div className="text-xs text-slate-500 text-center py-12">{error}</div>
          ) : coords ? (
            <NearbyHotelsMap
              places={places}
              centerLat={coords.lat}
              centerLng={coords.lng}
              locationLabel={mapLocationLabel}
              markerEmoji="🍽️"
              placeTypePlural="restaurants"
              searchOriginPin={
                anchoredToHotel
                  ? { lat: coords.lat, lng: coords.lng, label: anchorLabel }
                  : undefined
              }
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
