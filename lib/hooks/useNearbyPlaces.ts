"use client";

import { useQuery } from "@tanstack/react-query";

export type NearbyPlace = {
  id: string;
  name: string;
  address?: string;
  city?: string;
  rating?: number | null;
  userRatingCount?: number | null;
  lat?: number;
  lng?: number;
  googleMapsUri?: string;
  imageUrl?: string;
  photoName?: string;
  bookingUrl?: string;
  priceLabel?: string;
  provider?: "liteapi" | "google_places";
  productId?: string;
  averageNightlyRate?: number;
  currencyCode?: string;
  searchCheckin?: string;
  searchCheckout?: string;
};

type UseNearbyPlacesResult = {
  places: NearbyPlace[];
  loading: boolean;
  error: string | null;
};

function toPhotoProxyUrl(photoName: string, maxHeightPx: number) {
  return `/api/google-places-photo?photoName=${encodeURIComponent(photoName)}&maxHeightPx=${encodeURIComponent(
    String(maxHeightPx)
  )}`;
}

async function fetchNearbyPlaces(params: {
  lat: number;
  lng: number;
  radiusMeters: number;
  maxPlaces: number;
  includedType: string;
  sortBy: "distance" | "rating";
}): Promise<NearbyPlace[]> {
  const sp = new URLSearchParams();
  sp.set("lat", params.lat.toString());
  sp.set("lng", params.lng.toString());
  sp.set("radiusMeters", params.radiusMeters.toString());
  sp.set("maxPlaces", params.maxPlaces.toString());
  sp.set("includedType", params.includedType);
  sp.set("sortBy", params.sortBy);

  const res = await fetch(`/api/google-places-nearby?${sp.toString()}`);
  if (!res.ok) {
    try {
      const errData = await res.json();
      throw new Error(errData?.message || errData?.error || `Failed to fetch nearby places: ${res.status}`);
    } catch {
      const text = await res.text().catch(() => "");
      throw new Error(`Failed to fetch nearby places: ${res.status} ${text || res.statusText}`);
    }
  }

  const data = await res.json();
  if (!data?.success) {
    throw new Error(data?.message || data?.error || "Failed to fetch nearby places");
  }

  const rawPlaces: NearbyPlace[] = Array.isArray(data.places) ? data.places : [];

  // Normalize imageUrl: prefer any usable URL from Google response, otherwise use our photo proxy.
  return rawPlaces.map((p) => {
    if (p.imageUrl) return p;
    if (p.photoName) {
      return {
        ...p,
        imageUrl: toPhotoProxyUrl(p.photoName, 400),
      };
    }
    return p;
  });
}

export function useNearbyPlaces(params: {
  lat?: number;
  lng?: number;
  radiusMeters?: number;
  maxPlaces?: number;
  includedType?: string;
  sortBy?: "distance" | "rating";
}): UseNearbyPlacesResult {
  const radiusMeters = params.radiusMeters ?? 5000;
  const maxPlaces = params.maxPlaces ?? 7;
  const includedType = params.includedType ?? "restaurant";
  const sortBy = params.sortBy ?? "distance";

  const { data, isLoading, error } = useQuery({
    queryKey: ["googlePlacesNearby", params.lat, params.lng, radiusMeters, maxPlaces, includedType, sortBy],
    queryFn: () => {
      if (params.lat === undefined || params.lng === undefined) return Promise.resolve([]);
      return fetchNearbyPlaces({
        lat: params.lat,
        lng: params.lng,
        radiusMeters,
        maxPlaces,
        includedType,
        sortBy,
      });
    },
    enabled: params.lat !== undefined && params.lng !== undefined,
  });

  return {
    places: data ?? [],
    loading: isLoading,
    error: error ? (error instanceof Error ? error.message : "Failed to fetch nearby places") : null,
  };
}

