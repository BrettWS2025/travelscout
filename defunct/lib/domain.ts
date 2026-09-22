// lib/domain.ts
//
// Core domain types for TravelScout.
// These are "backend-style" shapes that we can later persist in Supabase
// and reuse from web, mobile apps, and APIs.

import type { NzCity } from "@/lib/nzCities";
import type { TripPlan } from "@/lib/itinerary";

/** Generic ID aliases so intent is clear in the codebase. */
export type UserId = string;
export type TripId = string;
export type TripDayId = string;
export type ActivityId = string;

/**
 * A Trip is the high-level object a user can save/manage.
 * It represents "this whole journey", not the per-day breakdown.
 */
export type Trip = {
  id: TripId;
  userId: UserId;

  /** User-facing label, e.g. "South Island Roadie" */
  name: string;

  /** When this trip record was first created (ISO datetime). */
  createdAt: string;

  /** When it was last updated (ISO datetime). */
  updatedAt: string;

  /** Overall date range for the trip (inclusive). */
  startDate: string; // ISO YYYY-MM-DD
  endDate: string;   // ISO YYYY-MM-DD

  /** Start / end "anchor" locations – usually NZ_CITIES ids. */
  startCityId: string; // e.g. "chc"
  endCityId: string;   // e.g. "zqn"

  /**
   * Optional free-form notes about the trip as a whole.
   * (High level ideas, packing lists, etc.)
   */
  notes?: string;
};

/**
 * A TripDay is a single calendar day within a Trip.
 * The UI's "Day 3 – Thu 28 Mar – Tekapo" would map to one TripDay.
 */
export type TripDay = {
  id: TripDayId;
  tripId: TripId;

  /** 1-based order within the trip (Day 1, 2, 3, …). */
  order: number;

  /** Exact calendar date for this day. */
  date: string; // ISO YYYY-MM-DD

  /**
   * Identifier for the main location that day.
   * In the future this can reference:
   *  - an NZ city (NZ_CITIES id),
   *  - or a scenic stop (NZ_STOPS id),
   *  - or something custom.
   */
  locationId: string;

  /** Denormalised display name for the location (e.g. "Lake Tekapo"). */
  locationName: string;
};

/**
 * Types of activities that can appear on a day.
 * This covers both "free notes" and structured bookings.
 */
export type ActivityKind =
  | "note"           // free-form notes about the day
  | "accommodation"  // where I'm staying (campground, hotel, etc.)
  | "attraction"     // tours, activities, attractions
  | "event"          // concerts, festivals, sports, etc.
  | "transport";     // flights, ferries, buses, rental pickups/returns

/**
 * Where a structured activity came from (for affiliate / API integrations).
 */
export type ActivityProvider =
  | "manual"         // user-entered only
  | "everythingnz"   // Everything New Zealand agent portal
  | "eventbookings"  // EventBookings API
  | "other";         // placeholder for future providers

/**
 * An Activity is "a thing happening" on a given trip day.
 * In future this is what you'll associate with confirmations, tickets, etc.
 */
export type Activity = {
  id: ActivityId;
  tripId: TripId;
  dayId: TripDayId;

  kind: ActivityKind;
  provider: ActivityProvider;

  /** Short title, e.g. "Stargazing Tour" or "Christchurch TOP 10 Holiday Park". */
  title: string;

  /** Optional longer description/notes. */
  description?: string;

  /**
   * Display location for the activity. This may be more specific than the TripDay
   * location (e.g. exact attraction name, suburb, venue).
   */
  placeName?: string;

  /**
   * For structured bookings we may want a machine-readable place identifier
   * that ties back to NZ_CITIES or NZ_STOPS or a supplier ID.
   */
  placeId?: string;

  /**
   * Scheduled time window for the activity (if applicable).
   * For all-day things we can just use the TripDay's date.
   */
  startDateTime?: string; // ISO datetime
  endDateTime?: string;   // ISO datetime

  /** Optional booking/confirmation metadata. */
  providerRef?: string;       // supplier's product id or booking id
  confirmationCode?: string;  // user-facing confirmation code or reference
  bookingUrl?: string;        // deep link / affiliate link to manage booking

  /** Timestamps for auditing. */
  createdAt: string;
  updatedAt: string;
};

/**
 * A small helper shape we can use on the frontend for
 * holding a Trip together with its days & activities.
 *
 * This is *not* a DB schema, just a convenient bundle type.
 */
export type TripWithDetails = {
  trip: Trip;
  days: TripDay[];
  activities: Activity[];
};

/**
 * Utility: generate a new Trip draft from the UI form fields.
 *
 * This doesn't persist anything; it's just a convenient way to have
 * a consistent shape before we later wire up Supabase inserts.
 */
export function createTripDraft(opts: {
  userId: UserId;
  name?: string;
  startDate: string;
  endDate: string;
  startCity: NzCity;
  endCity: NzCity;
}): Trip {
  const now = new Date().toISOString();
  const id = crypto.randomUUID?.() ?? `trip_${Math.random().toString(36).slice(2)}`;

  return {
    id,
    userId: opts.userId,
    name:
      opts.name ||
      `${opts.startCity.name} → ${opts.endCity.name} (${opts.startDate} to ${opts.endDate})`,
    createdAt: now,
    updatedAt: now,
    startDate: opts.startDate,
    endDate: opts.endDate,
    startCityId: opts.startCity.id,
    endCityId: opts.endCity.id,
  };
}

/**
 * Utility: build TripDay records from a TripPlan.
 *
 * This is the bridge between your existing in-memory itinerary logic
 * (TripPlan) and the future persisted domain model (Trip + TripDays).
 *
 * For now we just map each TripDay in the plan to a TripDay with an ID.
 * Later, when we persist, we can reuse this logic but the IDs will
 * likely come from the database instead of randomUUID().
 */
export function buildTripDaysFromPlan(tripId: TripId, plan: TripPlan): TripDay[] {
  return plan.days.map((d) => {
    const id =
      crypto.randomUUID?.() ?? `day_${tripId}_${d.dayNumber}_${Math.random().toString(36).slice(2)}`;

    return {
      id,
      tripId,
      order: d.dayNumber,
      date: d.date,
      locationId: d.location,   // for now we use the display name as the id
      locationName: d.location, // later we can normalise to NZ_CITIES/NZ_STOPS ids
    };
  });
}

