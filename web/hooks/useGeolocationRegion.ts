"use client";

import { useEffect, useState } from "react";
import type { NearbyPlace } from "@/lib/places";

type GeolocationRegionState = {
  region: string | null;
  place: NearbyPlace | null;
  isLoading: boolean;
  error: string | null;
  isOutsideNZ: boolean;
  permissionDenied: boolean;
};

/**
 * Detect the user's location and resolve the nz_places_final region for
 * defaulting home / find-deals search.
 */
export function useGeolocationRegion(
  enabled = true
): GeolocationRegionState {
  const [state, setState] = useState<GeolocationRegionState>({
    region: null,
    place: null,
    isLoading: enabled,
    error: null,
    isOutsideNZ: false,
    permissionDenied: false,
  });

  useEffect(() => {
    if (!enabled) {
      setState((prev) => ({ ...prev, isLoading: false }));
      return;
    }

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState({
        region: null,
        place: null,
        isLoading: false,
        error: "Geolocation is not supported by your browser",
        isOutsideNZ: false,
        permissionDenied: false,
      });
      return;
    }

    let cancelled = false;

    setState((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
      permissionDenied: false,
    }));

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const res = await fetch(
            `/api/places/nearest?lat=${encodeURIComponent(String(latitude))}&lng=${encodeURIComponent(String(longitude))}`
          );
          if (!res.ok) {
            throw new Error("Could not resolve your region");
          }
          const data = (await res.json()) as {
            place: NearbyPlace | null;
            outsideNz?: boolean;
          };

          if (cancelled) return;

          if (data.outsideNz) {
            setState({
              region: null,
              place: null,
              isLoading: false,
              error: "Location is outside New Zealand",
              isOutsideNZ: true,
              permissionDenied: false,
            });
            return;
          }

          const place = data.place;
          setState({
            region: place?.region ?? null,
            place: place ?? null,
            isLoading: false,
            error: place?.region ? null : "No nearby region found",
            isOutsideNZ: false,
            permissionDenied: false,
          });
        } catch (err) {
          if (cancelled) return;
          setState({
            region: null,
            place: null,
            isLoading: false,
            error:
              err instanceof Error
                ? err.message
                : "Could not resolve your region",
            isOutsideNZ: false,
            permissionDenied: false,
          });
        }
      },
      (err) => {
        if (cancelled) return;
        const permissionDenied = err.code === 1;
        let errorMessage = "Could not detect your location";
        if (err.code === 1) errorMessage = "Location permission denied";
        else if (err.code === 2) errorMessage = "Location unavailable";
        else if (err.code === 3) errorMessage = "Location request timeout";

        setState({
          region: null,
          place: null,
          isLoading: false,
          error: errorMessage,
          isOutsideNZ: false,
          permissionDenied,
        });
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000,
      }
    );

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return state;
}
