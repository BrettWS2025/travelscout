"use client";

import { useEffect, useState } from "react";
import { Bed, ChevronLeft } from "lucide-react";
import { getCityById, NZ_CITIES, searchPlacesByName, type NzCity } from "@/lib/nzCities";
import { useNearbyPlaces, type NearbyPlace } from "@/lib/hooks/useNearbyPlaces";
import { useLiteApiHotels } from "@/lib/hooks/useLiteApiHotels";
import NearbyHotelsMap from "@/components/trip-planner/NearbyHotelsMap";

type Props = {
  cityId: string;
  cityName: string;
  checkin?: string;
  checkout?: string;
  onBack: () => void;
};

/**
 * Full-width panel: map of nearby hotels for the selected trip stop.
 * Uses the same `useNearbyPlaces` query params as the day carousel so React Query serves cache (no extra Places calls).
 */
export default function NearbyHotelsMapPanel({ cityId, cityName, checkin, checkout, onBack }: Props) {
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

  const { hotels, loading, error } = useLiteApiHotels({
    lat: coords?.lat,
    lng: coords?.lng,
    checkin,
    checkout,
    limit: 30,
    radiusKm: 20,
    currency: "NZD",
    guestNationality: "NZ",
  });
  const {
    places: googleFallbackHotels,
    loading: googleFallbackLoading,
    error: googleFallbackError,
  } = useNearbyPlaces({
    lat: coords?.lat,
    lng: coords?.lng,
    radiusMeters: 20000,
    maxPlaces: 30,
    includedType: "lodging",
    sortBy: "rating",
  });

  const liteApiPlaces: NearbyPlace[] = hotels
    .filter((h) => typeof h.latitude === "number" && typeof h.longitude === "number")
    .map((h) => {
      const rateLabel =
        h.maxRate > h.minRate
          ? `From ${h.currency} ${h.minRate.toFixed(0)} - ${h.maxRate.toFixed(0)}`
          : `From ${h.currency} ${h.minRate.toFixed(0)}`;
      return {
        id: h.id,
        name: h.name,
        address: [h.address, h.city].filter(Boolean).join(" • ") || undefined,
        city: h.city,
        rating: h.rating ?? undefined,
        lat: h.latitude,
        lng: h.longitude,
        priceLabel: rateLabel,
        bookingUrl: h.bookingUrl,
        provider: "liteapi",
        productId: h.offerId,
        averageNightlyRate: h.minRate,
        currencyCode: h.currency,
        searchCheckin: checkin,
        searchCheckout: checkout,
        googleMapsUri: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${h.latitude},${h.longitude}`)}`,
      };
    });
  const googleFallbackPlaces: NearbyPlace[] = googleFallbackHotels.map((place) => ({
    ...place,
    city: cityName,
    provider: "google_places",
    searchCheckin: checkin,
    searchCheckout: checkout,
  }));
  const shouldUseGoogleFallback = !loading && !error && liteApiPlaces.length === 0;
  const places = shouldUseGoogleFallback ? googleFallbackPlaces : liteApiPlaces;

  const canLoad = coords !== undefined && !!checkin && !!checkout;
  const mapLoading = !canLoad || loading || (shouldUseGoogleFallback && googleFallbackLoading);
  const mapError = error || (shouldUseGoogleFallback ? googleFallbackError : null);

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
          {mapLoading ? (
            <div className="text-xs text-slate-600 text-center py-12">Loading hotels…</div>
          ) : mapError ? (
            <div className="text-xs text-slate-500 text-center py-12">{mapError}</div>
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
