"use client";

import { useQuery } from "@tanstack/react-query";

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
    "volleyball",
    "course",
    "Class",
    
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
 * Fetch events for a specific date and location
 */
async function fetchEvents(
  date: string,
  lat: number,
  lng: number
): Promise<Event[]> {
  // Build query parameters
  const params = new URLSearchParams();
  params.append("lat", lat.toString());
  params.append("lng", lng.toString());
  params.append("radius", "30"); // 30km radius
  
  // Add date filtering - query for events that occur on the target date
  const nextDay = getNextDay(date);
  params.append("start_date", date);
  params.append("end_date", nextDay);
  params.append("rows", "20");
  params.append("order", "date");

  // Paginate through all results
  const allEvents: Event[] = [];
  let offset = 0;
  const rowsPerPage = 20;
  let hasMore = true;

  while (hasMore) {
    const paginatedParams = new URLSearchParams(params);
    paginatedParams.set("offset", offset.toString());
    
    const res = await fetch(`/api/events?${paginatedParams.toString()}`);
    
    if (!res.ok) {
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

  // Transform Eventfinda events to our Event type
  const transformedEvents: Event[] = allEvents.map((event: any) => {
    // Extract image URL
    let imageUrl: string | undefined;
    
    if (event.images) {
      if (Array.isArray(event.images)) {
        const primaryImage = event.images.find((img: any) => img.is_primary) || event.images[0];
        if (primaryImage) {
          imageUrl = primaryImage.original_url || primaryImage.url;
        }
      } else if (event.images.images && Array.isArray(event.images.images)) {
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
      
      if (Array.isArray(event.sessions)) {
        sessions = event.sessions;
      } else if (event.sessions.sessions && Array.isArray(event.sessions.sessions)) {
        sessions = event.sessions.sessions;
      }

      const matchingSession = sessions.find((session: any) => {
        if (!session.datetime_start || session.is_cancelled) return false;
        const sessionDate = extractLocalDate(session.datetime_start);
        return sessionDate === date;
      });

      if (matchingSession) {
        datetime_summary = matchingSession.datetime_summary || datetime_summary;
        sessionDatetimeStart = matchingSession.datetime_start;
        sessionDatetimeEnd = matchingSession.datetime_end;
        foundMatchingSession = true;
      } else {
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
  const filteredEvents = transformedEvents.filter((event: any) => {
    if (shouldExcludeEvent(event)) {
      return false;
    }
    
    if (event._hasSessions && !event._foundMatchingSession) {
      return false;
    }

    if (!event.datetime_start) {
      return false;
    }

    if (event._hasSessions && event._foundMatchingSession) {
      return true;
    }

    const eventStartDate = extractLocalDate(event.datetime_start);
    const eventStartsOnTargetDate = eventStartDate === date;

    if (eventStartsOnTargetDate) {
      return true;
    }

    if (event.datetime_end) {
      const eventEndDate = extractLocalDate(event.datetime_end);
      const eventStart = new Date(event.datetime_start);
      const eventEnd = new Date(event.datetime_end);
      const durationHours = (eventEnd.getTime() - eventStart.getTime()) / (1000 * 60 * 60);
      const targetDateObj = new Date(date + "T00:00:00");
      const spansTargetDate = eventStart <= targetDateObj && eventEnd >= targetDateObj;
      
      if (spansTargetDate && durationHours >= 24) {
        return true;
      }
    }

    return false;
  }).map((event: any) => {
    const { _hasSessions, _foundMatchingSession, ...cleanEvent } = event;
    return cleanEvent;
  });

  return filteredEvents;
}

/**
 * Hook to fetch events for a specific date and location
 */
export function useEvents(date: string, locationName: string, lat?: number, lng?: number): UseEventsResult {
  const { data: events = [], isLoading: loading, error } = useQuery({
    queryKey: ["events", date, locationName, lat, lng],
    queryFn: () => {
      if (!date || !locationName || lat === undefined || lng === undefined) {
        return Promise.resolve([]);
      }
      return fetchEvents(date, lat, lng);
    },
    enabled: !!date && !!locationName && lat !== undefined && lng !== undefined,
  });

  return {
    events,
    loading,
    error: error ? (error instanceof Error ? error.message : "Failed to fetch events") : null,
  };
}
