// app/api/trips/route.ts
//
// API for trips using Supabase for persistence.
// Uses domain types from lib/domain.ts and persists to Supabase.

import { NextResponse } from "next/server";
import type { TripWithDetails, TripId } from "@/lib/domain";
import { getServerUser } from "@/lib/supabase/server";
import { getTripsForUser, saveTrip } from "@/lib/supabase/trips";

export const runtime = "nodejs"; // ensure we're on Node, not edge

// --- Route handlers ---------------------------------------------------------

/**
 * GET /api/trips
 *
 * Returns all trips for the authenticated user.
 * For anonymous users, returns empty array (they can build itineraries client-side).
 * Only authenticated users can retrieve saved trips.
 */
export async function GET(req: Request) {
  try {
    // Try to get auth token from Authorization header
    const authHeader = req.headers.get("authorization");
    const user = await getServerUser(authHeader || undefined);

    // Allow anonymous users - return empty array
    // They can build itineraries client-side without API calls
    if (!user) {
      return NextResponse.json({ trips: [] });
    }

    const trips = await getTripsForUser(user.id);
    return NextResponse.json({ trips });
  } catch (err) {
    console.error("Error in GET /api/trips:", err);
    const errorMessage =
      err instanceof Error ? err.message : "Failed to fetch trips.";
    return NextResponse.json(
      { error: "Failed to fetch trips.", message: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * POST /api/trips
 *
 * Creates or updates a trip for the authenticated user.
 * Requires authentication - returns 401 if not authenticated.
 *
 * Request body should include a TripWithDetails object.
 * The trip.userId will be set to the authenticated user's ID.
 */
export async function POST(req: Request) {
  try {
    // Try to get auth token from Authorization header
    const authHeader = req.headers.get("authorization");
    const user = await getServerUser(authHeader || undefined);

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required. Please log in to save trips." },
        { status: 401 }
      );
    }

    const userId = user.id;

    const body = await req.json();

    // Validate request body
    if (!body || typeof body !== "object" || !body.trip) {
      return NextResponse.json(
        { error: "Request body must include a 'trip' object." },
        { status: 400 }
      );
    }

    const incoming = body as TripWithDetails;

    // Ensure the trip has an id; generate one if not provided
    const tripId: TripId =
      incoming.trip.id ||
      (crypto.randomUUID?.() ?? `trip_${Math.random().toString(36).slice(2)}`);

    const now = new Date().toISOString();

    // Normalize the trip data
    const normalised: TripWithDetails = {
      ...incoming,
      trip: {
        ...incoming.trip,
        id: tripId,
        userId: userId, // Use authenticated user's ID
        createdAt: incoming.trip.createdAt || now,
        updatedAt: now,
      },
      days: (incoming.days ?? []).map((d) => ({
        ...d,
        tripId: tripId,
      })),
      activities: (incoming.activities ?? []).map((a) => ({
        ...a,
        tripId: tripId,
      })),
    };

    // Save to Supabase
    const saved = await saveTrip(userId, normalised);

    return NextResponse.json({ trip: saved }, { status: 201 });
  } catch (err) {
    console.error("Error in POST /api/trips:", err);
    return NextResponse.json(
      {
        error: "Failed to save trip.",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
