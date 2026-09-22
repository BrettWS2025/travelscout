"use client";

import { useState, useEffect } from "react";
import { findPlacesNearby } from "@/lib/places";
import type { Place } from "@/lib/nzCities";

/**
 * Hook to detect user's location and find the nearest place in New Zealand
 * Uses browser geolocation API (requires user permission)
 */
export function useGeolocation() {
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [nearestPlace, setNearestPlace] = useState<Place | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOutsideNZ, setIsOutsideNZ] = useState(false);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation({ lat: latitude, lng: longitude });

        // Check if location is in New Zealand (rough bounds)
        // NZ bounds: lat -47 to -34, lng 166 to 179
        const isInNZ = latitude >= -47 && latitude <= -34 && longitude >= 166 && longitude <= 179;

        if (!isInNZ) {
          setIsOutsideNZ(true);
          setError("Location is outside New Zealand");
          setIsLoading(false);
          return;
        }

        // Find nearest place using optimized nearby search
        // Start with a small radius (10km) for faster results, expand if needed
        try {
          let nearbyPlaces = await findPlacesNearby(latitude, longitude, 10);
          
          // If no places found within 10km, expand to 50km
          if (nearbyPlaces.length === 0) {
            nearbyPlaces = await findPlacesNearby(latitude, longitude, 50);
          }
          
          if (nearbyPlaces.length > 0) {
            // Already sorted by distance, pick the closest
            const nearest = nearbyPlaces[0];
            setNearestPlace(nearest);
          } else {
            setError("No nearby places found");
          }
        } catch (err) {
          setError("Could not find nearby places");
        } finally {
          setIsLoading(false);
        }
      },
      (err) => {
        let errorMessage = "Could not detect your location";
        if (err.code === 1) {
          errorMessage = "Location permission denied";
        } else if (err.code === 2) {
          errorMessage = "Location unavailable";
        } else if (err.code === 3) {
          errorMessage = "Location request timeout";
        }
        
        setError(errorMessage);
        setIsLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000, // 5 minutes
      }
    );
  }, []);

  return {
    userLocation,
    nearestPlace,
    isLoading,
    error,
    isOutsideNZ,
  };
}

/**
 * Haversine distance calculation in kilometers
 */
function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
