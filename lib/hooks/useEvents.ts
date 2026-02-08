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
  datetime_summary?: string;
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
 * Helper function to check if an event should be excluded based on irrelevant keywords
 * Filters out events like business networking, weekly catchball, etc.
 */
function shouldExcludeEvent(event: { name?: string; description?: string }): boolean {
  if (!event.name && !event.description) return false;
  
  const name = (event.name || "").toLowerCase();
  const description = (event.description || "").toLowerCase();
  
  // List of exclusion patterns - events matching these will be filtered out
  const exclusionPatterns = [
    // Business networking events
    "business networking",
    "networking event",
    "networking breakfast",
    "networking lunch",
    "networking evening",
    "professional networking",
    "business mixer",
    
    // Weekly recurring sports/activities
    "weekly catchball",
    "catchball",
    "weekly basketball",
    "weekly football",
    "weekly soccer",
    "weekly training",
    
    // Other irrelevant recurring events
    "weekly meetup",
    "weekly gathering",
    "weekly session",
    "weekly class",
    "weekly workshop",
    // Note: "class" and "course" removed - too broad, would filter legitimate events
    // If needed, use more specific patterns like "fitness class", "yoga class", etc.
    "seniors",
    
    // Add more patterns as needed
  ];
  
  // Check if any exclusion pattern matches
  for (const pattern of exclusionPatterns) {
    if (name.includes(pattern) || description.includes(pattern)) {
      // Log which pattern matched for debugging
      if (name.includes(pattern)) {
        console.log(`[useEvents] Exclusion pattern "${pattern}" matched in name: "${event.name}"`);
      } else if (description.includes(pattern)) {
        console.log(`[useEvents] Exclusion pattern "${pattern}" matched in description for event: "${event.name}"`);
      }
      return true;
    }
  }
  return false;
}

/**
 * Helper function to check if an event occurs on a specific date
 * Events are considered to occur on the target date if:
 * - The event starts on that date (in local timezone), OR
 * - The event is ongoing (starts before target date and ends on/after target date)
 * 
 * For recurring events with wide date ranges, we only match if the event starts on the target date
 * to avoid showing them on every date in their range.
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
    
    // Calculate the span of the event in days
    const daysSpan = Math.ceil((eventEnd.getTime() - eventStart.getTime()) / (1000 * 60 * 60 * 24));
    
    // For events with a very wide date range (more than 7 days), only match if they start on the target date
    // This prevents recurring events from showing on every date in their range
    // Recurring events should have sessions to indicate specific dates
    if (daysSpan > 7) {
      // Wide date range - only match if event starts on target date
      return eventStartDate === targetDate;
    }
    
    // For shorter events, check if they span the target date
    // Event is ongoing if it starts before or on target date and ends on or after target date
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
      setError(null);
      return;
    }

    // Don't fetch if we don't have coordinates yet (they're being loaded asynchronously)
    if (lat === undefined || lng === undefined) {
      setEvents([]);
      setLoading(true); // Still loading coordinates
      setError(null);
      return;
    }

    // Create AbortController to cancel in-flight requests when dependencies change
    const abortController = new AbortController();
    let isCancelled = false;

    setLoading(true);
    setError(null);

    // Build query parameters
    const params = new URLSearchParams();
    
    // Use lat/lng - we know they're defined at this point
    params.append("lat", lat.toString());
    params.append("lng", lng.toString());
    params.append("radius", "30"); // 30km radius
    
    // Add date filtering - query for events that occur on the target date
    // Strategy: Query a range that includes:
    // 1. Events starting on the target date
    // 2. Events that span midnight (start on target date, end next day)
    // 
    // The Eventfinda API's end_date is exclusive (events ending before this date)
    // So to include events ending on the target date, we need end_date=target date + 1 day
    // To include events starting on the target date, we use start_date=target date
    const nextDay = getNextDay(date); // One day after the target date
    params.append("start_date", date); // Include events starting on the target date
    params.append("end_date", nextDay); // Include events ending on the target date (end_date is exclusive)
    
    params.append("rows", "20"); // Eventfinda API max is 20 per request
    params.append("order", "date");

    // Paginate through all results
    const fetchAllEvents = async (): Promise<Event[]> => {
      const allEvents: Event[] = [];
      let offset = 0;
      const rowsPerPage = 20;
      let hasMore = true;

      while (hasMore && !isCancelled) {
        const paginatedParams = new URLSearchParams(params);
        paginatedParams.set("offset", offset.toString());
        
        const res = await fetch(`/api/events?${paginatedParams.toString()}`, {
          signal: abortController.signal,
        });
        
        if (!res.ok) {
          // Try to get more detailed error information
          let errorMessage = `Failed to fetch events: ${res.statusText}`;
          try {
            const errorData = await res.json();
            if (errorData.error) {
              errorMessage = errorData.error;
              if (errorData.details) {
                errorMessage += ` - ${errorData.details}`;
              }
            } else if (errorData.message) {
              errorMessage = errorData.message;
            }
          } catch {
            // If JSON parsing fails, use the status text
          }
          throw new Error(errorMessage);
        }
        
        const data = await res.json();
        
        if (data.error) {
          throw new Error(`Failed to fetch events: ${data.error}${data.details ? ` - ${data.details}` : ''}`);
        }

        const events = data.events || [];
        allEvents.push(...events);
        
        // Check if there are more results
        const total = data.total || 0;
        const fetched = offset + events.length;
        hasMore = fetched < total && events.length === rowsPerPage;
        offset += rowsPerPage;
      }

      return allEvents;
    };

    fetchAllEvents()
      .then((allEvents) => {
        if (isCancelled) return;

        // Transform Eventfinda events to our Event type
        const transformedEvents: Event[] = allEvents.map((event: any) => {
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

          // Extract sessions and find the one matching the target date
          let datetime_summary: string | undefined = event.datetime_summary;
          let sessionDatetimeStart = event.datetime_start;
          let sessionDatetimeEnd = event.datetime_end;
          let hasSessions = false;
          let foundMatchingSession = false;

          if (event.sessions) {
            hasSessions = true;
            let sessions: any[] = [];
            
            // Handle different session formats
            if (Array.isArray(event.sessions)) {
              sessions = event.sessions;
            } else if (event.sessions.sessions && Array.isArray(event.sessions.sessions)) {
              sessions = event.sessions.sessions;
            }

            // Debug logging for events we're tracking
            if (event.name?.toLowerCase().includes('night market') || event.name?.toLowerCase().includes('welly')) {
              console.log(`[useEvents] Event "${event.name}" has sessions:`, {
                eventId: event.id,
                sessionsCount: sessions.length,
                sessionsStructure: event.sessions,
                targetDate: date
              });
            }

            // Find the session that matches the target date
            const matchingSession = sessions.find((session: any) => {
              if (!session.datetime_start || session.is_cancelled) return false;
              const sessionDate = extractLocalDate(session.datetime_start);
              return sessionDate === date;
            });

            if (matchingSession) {
              // Use the matching session's datetime_summary and times
              datetime_summary = matchingSession.datetime_summary || datetime_summary;
              sessionDatetimeStart = matchingSession.datetime_start;
              sessionDatetimeEnd = matchingSession.datetime_end;
              foundMatchingSession = true;
            } else {
              // Event has sessions but no matching session - set datetime to null to ensure exclusion
              // This prevents the parent event's date range from being used
              sessionDatetimeStart = null as any;
              sessionDatetimeEnd = null as any;
            }
          }

          return {
            id: event.id,
            name: event.name,
            url: event.url,
            description: event.description,
            imageUrl,
            datetime_start: sessionDatetimeStart,
            datetime_end: sessionDatetimeEnd,
            datetime_summary,
            _hasSessions: hasSessions,
            _foundMatchingSession: foundMatchingSession,
          };
        });

        // Filter events to only include those that actually occur on the target date
        // Stage 1: Keyword-based exclusion - filter out irrelevant events (business networking, weekly catchball, etc.)
        // Stage 2: Session-based exclusion - if event has sessions, only include if matching session found
        const filteredEvents = transformedEvents.filter((event: any) => {
          // First, check if event should be excluded based on keywords
          if (shouldExcludeEvent(event)) {
            console.log(`[useEvents] Event "${event.name}" filtered out: matches exclusion pattern`);
            return false;
          }
          
          // Critical: If event has sessions but no matching session was found, exclude it
          // This prevents recurring events from showing on dates they don't actually occur
          if (event._hasSessions && !event._foundMatchingSession) {
            if (event.name?.toLowerCase().includes('night market') || event.name?.toLowerCase().includes('welly')) {
              console.log(`[useEvents] Event "${event.name}" filtered out: has sessions but none match target date ${date}`, {
                eventId: event.id,
                targetDate: date,
                hasSessions: event._hasSessions,
                foundMatchingSession: event._foundMatchingSession,
                datetime_start: event.datetime_start,
                datetime_end: event.datetime_end
              });
            }
            return false;
          }

          // If datetime_start is null (because we have sessions but no match), exclude it
          if (!event.datetime_start) {
            if (event.name?.toLowerCase().includes('night market') || event.name?.toLowerCase().includes('welly')) {
              console.log(`[useEvents] Event "${event.name}" filtered out: datetime_start is null`);
            }
            return false;
          }

          // Include the event - we rely on session matching for events with sessions,
          // and for events without sessions, we trust the API's date filtering
          if (event.name?.toLowerCase().includes('night market') || event.name?.toLowerCase().includes('welly')) {
            console.log(`[useEvents] Event "${event.name}" INCLUDED for date ${date}:`, {
              datetime_start: event.datetime_start,
              datetime_end: event.datetime_end,
              datetime_summary: event.datetime_summary,
              hasSessions: event._hasSessions,
              foundMatchingSession: event._foundMatchingSession
            });
          }
          return true;
        }).map((event: any) => {
          // Remove internal flags before returning
          const { _hasSessions, _foundMatchingSession, ...cleanEvent } = event;
          return cleanEvent;
        });

        if (!isCancelled) {
          console.log(`[useEvents] Fetched ${transformedEvents.length} events (paginated), filtered to ${filteredEvents.length} for date ${date}`);
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
