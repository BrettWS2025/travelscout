"use client";

import { useState, useEffect } from "react";

export type Event = {
  id: number;
  name: string;
  url: string;
  description?: string;
  imageUrl?: string;
  datetime_start: string;
  datetime_end?: string;
};

type UseEventsResult = {
  events: Event[];
  loading: boolean;
  error: string | null;
};

/**
 * Hook to fetch events for a specific date and location
 */
export function useEvents(date: string, locationName: string, lat?: number, lng?: number): UseEventsResult {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Don't fetch if we don't have required data
    if (!date || !locationName) {
      setEvents([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // Build query parameters
    const params = new URLSearchParams();
    
    // Use lat/lng if provided, otherwise we'll need to find location by name
    if (lat !== undefined && lng !== undefined) {
      params.append("lat", lat.toString());
      params.append("lng", lng.toString());
      params.append("radius", "30"); // 30km radius
    }
    
    // Add date filtering - same date for start and end to get events for that specific day
    params.append("start_date", date);
    params.append("end_date", date);
    
    params.append("rows", "20"); // Limit to 20 events per day
    params.append("order", "date");

    fetch(`/api/events?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Failed to fetch events: ${res.statusText}`);
        }
        const data = await res.json();
        
        if (data.error) {
          throw new Error(data.error);
        }

        // Transform Eventfinda events to our Event type
        const transformedEvents: Event[] = (data.events || []).map((event: any) => {
          // Extract image URL - handle different image formats
          let imageUrl: string | undefined;
          
          if (event.images) {
            if (Array.isArray(event.images)) {
              // If images is an array, find primary or first image
              const primaryImage = event.images.find((img: any) => img.is_primary) || event.images[0];
              if (primaryImage) {
                imageUrl = primaryImage.original_url || primaryImage.url;
              }
            } else if (event.images.images && Array.isArray(event.images.images)) {
              // If images has an images property
              const primaryImage = event.images.images.find((img: any) => img.is_primary) || event.images.images[0];
              if (primaryImage) {
                imageUrl = primaryImage.original_url || primaryImage.url;
              }
            }
          }

          return {
            id: event.id,
            name: event.name,
            url: event.url,
            description: event.description,
            imageUrl,
            datetime_start: event.datetime_start,
            datetime_end: event.datetime_end,
          };
        });

        setEvents(transformedEvents);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching events:", err);
        setError(err.message || "Failed to fetch events");
        setEvents([]);
        setLoading(false);
      });
  }, [date, locationName, lat, lng]);

  return { events, loading, error };
}
