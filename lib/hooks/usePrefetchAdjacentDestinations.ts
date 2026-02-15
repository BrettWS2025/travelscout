"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { fetchThingsToDo } from "./useThingsToDo";

/**
 * Hook to prefetch things to do for adjacent destinations
 * This improves UX by loading data before the user navigates to adjacent destinations
 */
export function usePrefetchAdjacentDestinations(
  currentLocation: string,
  routeStops: string[],
  currentStopIndex?: number
) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!currentLocation || routeStops.length === 0) return;

    // Find adjacent destinations
    const adjacentLocations: string[] = [];

    if (currentStopIndex !== undefined) {
      // Prefetch previous destination
      if (currentStopIndex > 0) {
        const prevStop = routeStops[currentStopIndex - 1];
        if (prevStop) {
          adjacentLocations.push(prevStop);
        }
      }

      // Prefetch next destination
      if (currentStopIndex < routeStops.length - 1) {
        const nextStop = routeStops[currentStopIndex + 1];
        if (nextStop) {
          adjacentLocations.push(nextStop);
        }
      }
    } else {
      // If we don't have a stop index, try to find adjacent locations by matching
      const currentIndex = routeStops.findIndex((stop) => stop === currentLocation);
      if (currentIndex >= 0) {
        if (currentIndex > 0) {
          adjacentLocations.push(routeStops[currentIndex - 1]);
        }
        if (currentIndex < routeStops.length - 1) {
          adjacentLocations.push(routeStops[currentIndex + 1]);
        }
      }
    }

    // Prefetch each adjacent location
    adjacentLocations.forEach((location) => {
      if (location && location !== currentLocation) {
        queryClient.prefetchQuery({
          queryKey: ["thingsToDo", location],
          queryFn: () => fetchThingsToDo(location),
        });
      }
    });
  }, [currentLocation, routeStops, currentStopIndex, queryClient]);
}
