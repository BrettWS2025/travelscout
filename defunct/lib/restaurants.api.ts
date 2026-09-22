import { supabase } from "@/lib/supabase/client";

export type RestaurantSelectionAction = "interested" | "check_it_out";

export type SaveRestaurantSelectionInput = {
  placeId: string;
  name: string;
  location?: string;
  city?: string;
  rating?: number | null;
  userRatingCount?: number | null;
  googleMapsUri?: string;
  websiteUri?: string;
  latitude?: number | null;
  longitude?: number | null;
  selectedAction: RestaurantSelectionAction;
  selectedAt?: string;
  tripDayDate?: string;
  tripLocation?: string;
  metadata?: Record<string, unknown>;
};

export async function saveRestaurantSelectionToCache(
  input: SaveRestaurantSelectionInput
): Promise<{ success: boolean; id?: number; error?: string }> {
  try {
    const payload = {
      place_id: input.placeId,
      name: input.name,
      location: input.location || null,
      city: input.city || null,
      rating: input.rating ?? null,
      user_rating_count: input.userRatingCount ?? null,
      google_maps_uri: input.googleMapsUri || null,
      website_uri: input.websiteUri || null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      selected_action: input.selectedAction,
      selected_at: input.selectedAt || new Date().toISOString(),
      trip_day_date: input.tripDayDate || null,
      trip_location: input.tripLocation || null,
      metadata: input.metadata || {},
    };

    const { data, error } = await supabase
      .from("cached_restaurants")
      .upsert(payload, { onConflict: "place_id" })
      .select("id")
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, id: data?.id };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Failed to save restaurant selection";
    return { success: false, error: errorMessage };
  }
}
