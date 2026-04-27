import { supabase } from "@/lib/supabase/client";

export type HotelSelectionProvider = "liteapi" | "google_places";
export type HotelSelectionAction = "add_to_itinerary" | "book_now";

export type SaveHotelSelectionInput = {
  provider: HotelSelectionProvider;
  actionType: HotelSelectionAction;
  hotelName: string;
  address?: string;
  city?: string;
  rating?: number | null;
  averageNightlyRate?: number | null;
  currencyCode?: string;
  searchCheckin?: string;
  searchCheckout?: string;
  searchNights?: number | null;
  productId?: string;
  hotelId?: string;
  bookingUrl?: string;
  googleMapsUri?: string;
  latitude?: number | null;
  longitude?: number | null;
  tripDayDate?: string;
  tripLocation?: string;
  metadata?: Record<string, unknown>;
};

export async function saveHotelSelectionEvent(
  input: SaveHotelSelectionInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from("hotel_selection_events").insert({
      provider: input.provider,
      action_type: input.actionType,
      hotel_name: input.hotelName,
      address: input.address || null,
      city: input.city || null,
      rating: input.rating ?? null,
      average_nightly_rate: input.averageNightlyRate ?? null,
      currency_code: input.currencyCode || null,
      search_checkin: input.searchCheckin || null,
      search_checkout: input.searchCheckout || null,
      search_nights: input.searchNights ?? null,
      product_id: input.productId || null,
      hotel_id: input.hotelId || null,
      booking_url: input.bookingUrl || null,
      google_maps_uri: input.googleMapsUri || null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      trip_day_date: input.tripDayDate || null,
      trip_location: input.tripLocation || null,
      metadata: input.metadata || {},
    });

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Failed to save hotel selection event";
    return { success: false, error: errorMessage };
  }
}
