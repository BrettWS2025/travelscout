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
 * Helper function to get the next day in YYYY-MM-DD format
 */
function getNextDay(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  date.setDate(date.getDate() + 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Helper function to get the previous day in YYYY-MM-DD format
 */
function getPreviousDay(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  date.setDate(date.getDate() - 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Helper function to extract the local date from an ISO datetime string
 * Handles timezone-aware dates correctly
 */
function extractLocalDate(isoString: string): string {
  // Parse the datetime string - it may include timezone info
  const date = new Date(isoString);
  
  // Extract year, month, day in local timezone (not UTC)
  // This ensures events are matched to the correct local date
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Helper function to check if an event occurs on a specific date
 * Events are considered to occur on the target date if:
 * - The event starts on that date (in local timezone), OR
 * - The event is ongoing (starts before target date and ends on/after target date)
 */
function eventOccursOnDate(event: Event, targetDate: string): boolean {
  if (!event.datetime_start) return false;
  
  // Extract the local date from the event start time
  const eventStartDate = extractLocalDate(event.datetime_start);
  
  // Check if event starts on the target date
  if (eventStartDate === targetDate) {
    return true;
  }
  
  // Check if event is ongoing (spans across the target date)
  if (event.datetime_end) {
    const eventEndDate = extractLocalDate(event.datetime_end);
    const targetDateObj = new Date(targetDate + "T00:00:00");
    const eventStart = new Date(event.datetime_start);
    const eventEnd = new Date(event.datetime_end);
    
    // Event is ongoing if it starts before or on target date and ends on or after target date
    // We check both date strings and datetime objects for accuracy
    if (eventStartDate <= targetDate && eventEndDate >= targetDate) {
      return true;
    }
    
    // Also check if the event spans the target date using datetime comparison
    // (handles cases where date strings might differ due to timezone but event actually occurs on that day)
    if (eventStart <= targetDateObj && eventEnd >= targetDateObj) {
      return true;
    }
  }
  
  return false;
}

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

    // Create AbortController to cancel in-flight requests when dependencies change
    const abortController = new AbortController();
    let isCancelled = false;

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
    
    // Add date filtering - query for events that occur on the target date
    // Strategy: Query a range that includes:
    // 1. Events starting on the target date
    // 2. Events that span midnight (start on target date, end next day)
    // 3. Events that are ongoing (start before target date, still active on target date)
    // 
    // The Eventfinda API's end_date is exclusive (events ending before this date)
    // So to include events ending on Feb 6, we need end_date=Feb 7
    // To include events starting on Feb 5, we use start_date=Feb 5
    // To include ongoing events, we query from the day before
    const dayBefore = getPreviousDay(date);
    const dayAfterNext = getNextDay(getNextDay(date)); // Two days after to include events ending on the next day
    params.append("start_date", dayBefore); // Include events that started the day before (ongoing events)
    params.append("end_date", dayAfterNext); // Include events ending on the target date or next day (end_date is exclusive)
    
    params.append("rows", "100"); // Maximum events per day (API supports up to 100)
    params.append("order", "date");

    fetch(`/api/events?${params.toString()}`, {
      signal: abortController.signal,
    })
      .then(async (res) => {
        if (isCancelled) return;
        
        if (!res.ok) {
          throw new Error(`Failed to fetch events: ${res.statusText}`);
        }
        const data = await res.json();
        
        if (isCancelled) return;
        
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

        // Filter events to only include those that actually occur on the target date
        // This handles timezone issues and events that span multiple days
        const filteredEvents = transformedEvents.filter((event) => {
          const matches = eventOccursOnDate(event, date);
          if (!matches && (event.name?.toLowerCase().includes('hotspot') || event.name?.toLowerCase().includes('toby'))) {
            // Debug logging for specific events we're looking for
            console.log(`[useEvents] Event "${event.name}" filtered out:`, {
              datetime_start: event.datetime_start,
              datetime_end: event.datetime_end,
              targetDate: date,
              startDate: extractLocalDate(event.datetime_start),
              endDate: event.datetime_end ? extractLocalDate(event.datetime_end) : 'none'
            });
          }
          return matches;
        });

        if (!isCancelled) {
          console.log(`[useEvents] Fetched ${transformedEvents.length} events, filtered to ${filteredEvents.length} for date ${date}`);
          if (transformedEvents.length > 0 && filteredEvents.length === 0) {
            console.warn(`[useEvents] All events were filtered out! Sample event:`, {
              name: transformedEvents[0].name,
              datetime_start: transformedEvents[0].datetime_start,
              datetime_end: transformedEvents[0].datetime_end
            });
          }
          setEvents(filteredEvents);
          setLoading(false);
        }
      })
      .catch((err) => {
        // Don't set error if request was aborted (expected behavior)
        if (err.name === 'AbortError' || isCancelled) {
          return;
        }
        console.error("Error fetching events:", err);
        if (!isCancelled) {
          setError(err.message || "Failed to fetch events");
          setEvents([]);
          setLoading(false);
        }
      });

    // Cleanup: abort request if dependencies change or component unmounts
    return () => {
      isCancelled = true;
      abortController.abort();
    };
  }, [date, locationName, lat, lng]);

  return { events, loading, error };
}
