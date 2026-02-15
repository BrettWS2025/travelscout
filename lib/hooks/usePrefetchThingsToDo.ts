"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { fetchThingsToDo } from "./useThingsToDo";

/**
 * Hook to prefetch "Things to do" data for all route stops
 * This ensures data is ready when users switch to the "Things to do" tab
 */
export function usePrefetchThingsToDo(routeStops: string[]) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (routeStops.length === 0) return;

    // Fetch for all stops immediately in the background
    // This ensures data starts loading as soon as the journey is created
    // Use fetchQuery to immediately start fetching (not just prefetch)
    const stopNames = routeStops.filter(Boolean);
    
    stopNames.forEach((stop) => {
      // Fetch immediately - this will trigger the API calls right away
      // Using fetchQuery instead of prefetchQuery to ensure it starts immediately
      queryClient.fetchQuery({
        queryKey: ["thingsToDo", stop],
        queryFn: () => fetchThingsToDo(stop),
        staleTime: 10 * 60 * 1000, // 10 minutes
      }).catch((err) => {
        // Silently handle errors - prefetching is best effort
        console.debug("Failed to prefetch things to do for", stop, err);
      });
    });
  }, [routeStops.join(","), queryClient]); // Use join to create stable dependency
}
