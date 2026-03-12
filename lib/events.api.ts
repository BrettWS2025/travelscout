import { supabase } from "@/lib/supabase/client";
import type { Event } from "@/lib/hooks/useEvents";

/**
 * Save an event to the cached_events table
 * Uses INSERT ... ON CONFLICT to prevent duplicates
 * Returns the cached event ID
 */
export async function saveEventToCache(
  event: Event
): Promise<{ success: boolean; cachedEventId?: number; error?: string }> {
  try {
    // First, check if event already exists
    const { data: existing, error: checkError } = await supabase
      .from("cached_events")
      .select("id")
      .eq("eventfinda_id", event.id)
      .single();

    if (checkError && checkError.code !== "PGRST116") {
      // PGRST116 is "not found" which is fine
      console.error("Error checking for existing event:", checkError);
    }

    if (existing) {
      // Event already exists, return its ID
      return { success: true, cachedEventId: existing.id };
    }

    // Insert new event
    const { data, error } = await supabase
      .from("cached_events")
      .insert({
        eventfinda_id: event.id,
        name: event.name,
        url: event.url,
        description: event.description || null,
        image_url: event.imageUrl || null,
        datetime_start: event.datetime_start ? new Date(event.datetime_start).toISOString() : null,
        datetime_end: event.datetime_end ? new Date(event.datetime_end).toISOString() : null,
        datetime_summary: event.datetime_summary || null,
      })
      .select("id")
      .single();

    if (error) {
      // Check if it's a duplicate key error (race condition)
      if (error.code === "23505") {
        // Unique constraint violation - event was inserted by another user
        // Fetch the existing event
        const { data: existingEvent } = await supabase
          .from("cached_events")
          .select("id")
          .eq("eventfinda_id", event.id)
          .single();

        if (existingEvent) {
          return { success: true, cachedEventId: existingEvent.id };
        }
      }

      return { success: false, error: error.message };
    }

    return { success: true, cachedEventId: data?.id };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Failed to save event";
    return { success: false, error: errorMessage };
  }
}

/**
 * Get a cached event by Eventfinda ID
 */
export async function getCachedEvent(
  eventfindaId: number
): Promise<{ success: boolean; event?: any; error?: string }> {
  try {
    const { data, error } = await supabase
      .from("cached_events")
      .select("*")
      .eq("eventfinda_id", eventfindaId)
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, event: data };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Failed to get event";
    return { success: false, error: errorMessage };
  }
}
