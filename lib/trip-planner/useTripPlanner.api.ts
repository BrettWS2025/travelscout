import { getPlaceById, searchPlacesByName, type Place } from "@/lib/nzCities";
import { getCityById } from "@/lib/nzCities";
import { supabase } from "@/lib/supabase/client";
import type { TripInput, TripPlan } from "@/lib/itinerary";

export async function fetchPlaceCoordinates(
  placeId: string,
  placeName?: string
): Promise<Place | null> {
  // Try cache first
  let place = getCityById(placeId);
  
  // If not in cache, fetch from database
  if (!place) {
    place = await getPlaceById(placeId);
    
    // If still not found and we have a name, try searching
    if (!place && placeName) {
      const searchResults = await searchPlacesByName(placeName, 5);
      const exactMatch = searchResults.find(
        (p) => p.id === placeId || p.name.toLowerCase() === placeName.toLowerCase()
      );
      if (exactMatch) {
        place = exactMatch;
      }
    }
  }
  
  return place || null;
}

export async function saveItineraryToSupabase(
  userId: string,
  title: string,
  tripInput: TripInput,
  extendedTripPlan: any,
  itineraryId?: string
): Promise<{ success: boolean; error?: string }> {
  const itineraryData = {
    title: title || `Trip from ${tripInput.startCity.name} to ${tripInput.endCity.name}`,
    trip_input: tripInput,
    trip_plan: extendedTripPlan,
  };

  let error;
  
  if (itineraryId) {
    // Update existing itinerary
    const { error: updateError } = await supabase
      .from("itineraries")
      .update(itineraryData)
      .eq("id", itineraryId)
      .eq("user_id", userId);
    error = updateError;
  } else {
    // Insert new itinerary
    const { error: insertError } = await supabase
      .from("itineraries")
      .insert({
        user_id: userId,
        ...itineraryData,
      });
    error = insertError;
  }

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}
