"use client";

import { useQuery } from "@tanstack/react-query";

export type LiteApiHotel = {
  id: string;
  name: string;
  address?: string;
  city?: string;
  countryCode?: string;
  latitude?: number;
  longitude?: number;
  rating?: number | null;
  imageUrl?: string;
  minRate: number;
  maxRate: number;
  currency: string;
  offerId: string;
  bookingUrl: string;
};

type UseLiteApiHotelsResult = {
  hotels: LiteApiHotel[];
  loading: boolean;
  error: string | null;
};

async function fetchLiteApiHotels(params: {
  lat: number;
  lng: number;
  checkin: string;
  checkout: string;
  nights: number;
  limit: number;
  radiusKm: number;
  currency: string;
  guestNationality: string;
}): Promise<LiteApiHotel[]> {
  const sp = new URLSearchParams();
  sp.set("lat", String(params.lat));
  sp.set("lng", String(params.lng));
  sp.set("checkin", params.checkin);
  sp.set("checkout", params.checkout);
  sp.set("nights", String(params.nights));
  sp.set("limit", String(params.limit));
  sp.set("radiusKm", String(params.radiusKm));
  sp.set("currency", params.currency);
  sp.set("guestNationality", params.guestNationality);

  const res = await fetch(`/api/liteapi-hotels?${sp.toString()}`);
  if (!res.ok) {
    try {
      const errData = await res.json();
      throw new Error(errData?.message || errData?.error || `Failed to fetch hotels: ${res.status}`);
    } catch {
      const text = await res.text().catch(() => "");
      throw new Error(`Failed to fetch hotels: ${res.status} ${text || res.statusText}`);
    }
  }

  const data = await res.json();
  if (!data?.success) {
    throw new Error(data?.message || data?.error || "Failed to fetch hotels");
  }

  return Array.isArray(data.hotels) ? data.hotels : [];
}

export function useLiteApiHotels(params: {
  lat?: number;
  lng?: number;
  checkin?: string;
  checkout?: string;
  nights?: number;
  limit?: number;
  radiusKm?: number;
  currency?: string;
  guestNationality?: string;
}): UseLiteApiHotelsResult {
  const query = useQuery({
    queryKey: [
      "liteApiHotels",
      params.lat,
      params.lng,
      params.checkin,
      params.checkout,
      params.nights ?? 1,
      params.limit ?? 8,
      params.radiusKm ?? 12,
      params.currency ?? "NZD",
      params.guestNationality ?? "NZ",
    ],
    queryFn: () =>
      fetchLiteApiHotels({
        lat: params.lat as number,
        lng: params.lng as number,
        checkin: params.checkin as string,
        checkout: params.checkout as string,
        nights: params.nights ?? 1,
        limit: params.limit ?? 8,
        radiusKm: params.radiusKm ?? 12,
        currency: params.currency ?? "NZD",
        guestNationality: params.guestNationality ?? "NZ",
      }),
    enabled:
      params.lat !== undefined &&
      params.lng !== undefined &&
      typeof params.checkin === "string" &&
      params.checkin.length > 0 &&
      typeof params.checkout === "string" &&
      params.checkout.length > 0,
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });

  return {
    hotels: query.data ?? [],
    loading: query.isLoading,
    error: query.error ? (query.error instanceof Error ? query.error.message : "Failed to fetch hotels") : null,
  };
}

