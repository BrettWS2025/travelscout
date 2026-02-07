// lib/supabase/trips.ts
// Helper functions for trips database operations

import { createServerClient } from "./server";
import type { TripWithDetails, Trip, TripDay, Activity } from "@/lib/domain";

/**
 * Database schema types (snake_case to match Supabase)
 */
type DbTrip = {
  id: string;
  user_id: string;
  name: string;
  start_date: string;
  end_date: string;
  start_city_id: string;
  end_city_id: string;
  notes?: string | null;
  created_at: string;
  updated_at: string;
};

type DbTripDay = {
  id: string;
  trip_id: string;
  order: number;
  date: string;
  location_id: string;
  location_name: string;
  created_at: string;
  updated_at: string;
};

type DbActivity = {
  id: string;
  trip_id: string;
  day_id: string;
  kind: string;
  provider: string;
  title: string;
  description?: string | null;
  place_name?: string | null;
  place_id?: string | null;
  start_date_time?: string | null;
  end_date_time?: string | null;
  provider_ref?: string | null;
  confirmation_code?: string | null;
  booking_url?: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Convert domain Trip to database format
 */
function tripToDb(trip: Trip): Omit<DbTrip, "id" | "created_at" | "updated_at"> {
  return {
    user_id: trip.userId,
    name: trip.name,
    start_date: trip.startDate,
    end_date: trip.endDate,
    start_city_id: trip.startCityId,
    end_city_id: trip.endCityId,
    notes: trip.notes || null,
  };
}

/**
 * Convert database Trip to domain format
 */
function tripFromDb(db: DbTrip): Trip {
  return {
    id: db.id,
    userId: db.user_id,
    name: db.name,
    startDate: db.start_date,
    endDate: db.end_date,
    startCityId: db.start_city_id,
    endCityId: db.end_city_id,
    notes: db.notes || undefined,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

/**
 * Convert domain TripDay to database format
 */
function tripDayToDb(
  day: TripDay
): Omit<DbTripDay, "id" | "created_at" | "updated_at"> {
  return {
    trip_id: day.tripId,
    order: day.order, // Maps to "order" column (quoted in SQL)
    date: day.date,
    location_id: day.locationId,
    location_name: day.locationName,
  };
}

/**
 * Convert database TripDay to domain format
 */
function tripDayFromDb(db: DbTripDay): TripDay {
  return {
    id: db.id,
    tripId: db.trip_id,
    order: db.order, // Maps from "order" column
    date: db.date,
    locationId: db.location_id,
    locationName: db.location_name,
  };
}

/**
 * Convert domain Activity to database format
 */
function activityToDb(
  activity: Activity
): Omit<DbActivity, "id" | "created_at" | "updated_at"> {
  return {
    trip_id: activity.tripId,
    day_id: activity.dayId,
    kind: activity.kind,
    provider: activity.provider,
    title: activity.title,
    description: activity.description || null,
    place_name: activity.placeName || null,
    place_id: activity.placeId || null,
    start_date_time: activity.startDateTime || null,
    end_date_time: activity.endDateTime || null,
    provider_ref: activity.providerRef || null,
    confirmation_code: activity.confirmationCode || null,
    booking_url: activity.bookingUrl || null,
  };
}

/**
 * Convert database Activity to domain format
 */
function activityFromDb(db: DbActivity): Activity {
  return {
    id: db.id,
    tripId: db.trip_id,
    dayId: db.day_id,
    kind: db.kind as Activity["kind"],
    provider: db.provider as Activity["provider"],
    title: db.title,
    description: db.description || undefined,
    placeName: db.place_name || undefined,
    placeId: db.place_id || undefined,
    startDateTime: db.start_date_time || undefined,
    endDateTime: db.end_date_time || undefined,
    providerRef: db.provider_ref || undefined,
    confirmationCode: db.confirmation_code || undefined,
    bookingUrl: db.booking_url || undefined,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

/**
 * Get all trips for a user
 * @param userId - UUID of the user (must be a valid auth.users.id)
 */
export async function getTripsForUser(userId: string): Promise<TripWithDetails[]> {
  const supabase = createServerClient();

  // Validate userId is a UUID (database constraint)
  if (!userId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    throw new Error(`Invalid user ID format. Expected UUID, got: ${userId}`);
  }

  // Fetch trips
  const { data: trips, error: tripsError } = await supabase
    .from("trips")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (tripsError) {
    throw new Error(`Failed to fetch trips: ${tripsError.message}`);
  }

  if (!trips || trips.length === 0) {
    return [];
  }

  const tripIds = trips.map((t) => t.id);

  // Fetch trip days
  const { data: days, error: daysError } = await supabase
    .from("trip_days")
    .select("*")
    .in("trip_id", tripIds)
    .order("trip_id, order", { ascending: true });

  if (daysError) {
    throw new Error(`Failed to fetch trip days: ${daysError.message}`);
  }

  // Fetch activities
  const { data: activities, error: activitiesError } = await supabase
    .from("activities")
    .select("*")
    .in("trip_id", tripIds);

  if (activitiesError) {
    throw new Error(`Failed to fetch activities: ${activitiesError.message}`);
  }

  // Group days and activities by trip_id
  const daysByTripId = new Map<string, TripDay[]>();
  const activitiesByTripId = new Map<string, Activity[]>();

  (days || []).forEach((day) => {
    const tripDays = daysByTripId.get(day.trip_id) || [];
    tripDays.push(tripDayFromDb(day as DbTripDay));
    daysByTripId.set(day.trip_id, tripDays);
  });

  (activities || []).forEach((activity) => {
    const tripActivities = activitiesByTripId.get(activity.trip_id) || [];
    tripActivities.push(activityFromDb(activity as DbActivity));
    activitiesByTripId.set(activity.trip_id, tripActivities);
  });

  // Combine into TripWithDetails
  return trips.map((trip) => ({
    trip: tripFromDb(trip as DbTrip),
    days: daysByTripId.get(trip.id) || [],
    activities: activitiesByTripId.get(trip.id) || [],
  }));
}

/**
 * Save a trip (create or update)
 * @param userId - UUID of the user (must be a valid auth.users.id)
 */
export async function saveTrip(
  userId: string,
  tripData: TripWithDetails
): Promise<TripWithDetails> {
  const supabase = createServerClient();

  // Validate userId is a UUID (database constraint)
  if (!userId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    throw new Error(`Invalid user ID format. Expected UUID, got: ${userId}`);
  }

  const tripDb = tripToDb(tripData.trip);
  const now = new Date().toISOString();

  // Upsert trip
  const { data: savedTrip, error: tripError } = await supabase
    .from("trips")
    .upsert(
      {
        id: tripData.trip.id,
        ...tripDb,
        updated_at: now,
        ...(tripData.trip.id ? {} : { created_at: now }),
      },
      {
        onConflict: "id",
      }
    )
    .select()
    .single();

  if (tripError) {
    throw new Error(`Failed to save trip: ${tripError.message}`);
  }

  const tripId = savedTrip.id;

  // Delete existing days and activities for this trip
  await supabase.from("trip_days").delete().eq("trip_id", tripId);
  await supabase.from("activities").delete().eq("trip_id", tripId);

  // Insert new days
  if (tripData.days && tripData.days.length > 0) {
    const daysToInsert = tripData.days.map((day) => ({
      id: day.id,
      ...tripDayToDb({ ...day, tripId }),
      created_at: now,
      updated_at: now,
    }));

    const { error: daysError } = await supabase
      .from("trip_days")
      .insert(daysToInsert);

    if (daysError) {
      throw new Error(`Failed to save trip days: ${daysError.message}`);
    }
  }

  // Insert new activities
  if (tripData.activities && tripData.activities.length > 0) {
    const activitiesToInsert = tripData.activities.map((activity) => ({
      id: activity.id,
      ...activityToDb({ ...activity, tripId }),
      created_at: now,
      updated_at: now,
    }));

    const { error: activitiesError } = await supabase
      .from("activities")
      .insert(activitiesToInsert);

    if (activitiesError) {
      throw new Error(`Failed to save activities: ${activitiesError.message}`);
    }
  }

  // Fetch the complete saved trip
  const saved = await getTripsForUser(userId);
  const found = saved.find((t) => t.trip.id === tripId);

  if (!found) {
    throw new Error("Failed to retrieve saved trip");
  }

  return found;
}
