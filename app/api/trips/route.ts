// app/api/trips/route.ts
//
// Temporary in-memory API for trips.
// This gives us a real HTTP contract (GET/POST /api/trips)
// using the domain types from lib/domain.ts,
// but does NOT persist anything yet.
//
// Later, we'll replace the in-memory store with Supabase.

import { NextResponse } from "next/server";
import type { TripWithDetails, TripId, UserId } from "@/lib/domain";

export const runtime = "nodejs"; // ensure we're on Node, not edge

// --- Temporary "database" in memory ----------------------------------------

// Map<userId, TripWithDetails[]>
const tripsStore = new Map<UserId, TripWithDetails[]>();

// For now, we just hard-code a single demo user.
// Once auth is wired up (Supabase Auth or similar), we'll derive this
// from the session / JWT instead.
const DEMO_USER_ID: UserId = "demo-user";

// --- Helpers ----------------------------------------------------------------

function getTripsForUser(userId: UserId): TripWithDetails[] {
  return tripsStore.get(userId) ?? [];
}

function saveTripForUser(userId: UserId, trip: TripWithDetails): TripWithDetails {
  const existing = tripsStore.get(userId) ?? [];

  // If a trip with the same id exists, replace it; otherwise append.
  const idx = existing.findIndex((t) => t.trip.id === trip.trip.id);
  let next: TripWithDetails[];
  if (idx === -1) {
    next = [...existing, trip];
  } else {
    next = [...existing];
    next[idx] = trip;
  }

  tripsStore.set(userId, next);
  return trip;
}

// --- Route handlers ---------------------------------------------------------

/**
 * GET /api/trips
 *
 * For now:
 *  - returns all trips for the DEMO_USER_ID in memory.
 */
export async function GET() {
  const trips = getTripsForUser(DEMO_USER_ID);
  return NextResponse.json({ trips });
}

/**
 * POST /api/trips
 *
 * For now:
 *  - expects a TripWithDetails in the request body
 *  - overwrites trip.userId with DEMO_USER_ID
 *  - stores it in memory
 *
 * Later:
 *  - we'll validate input more strictly
 *  - use Supabase inserts/updates instead of the in-memory map
 *  - derive userId from auth
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Very light validation for now
    if (!body || typeof body !== "object" || !body.trip) {
      return NextResponse.json(
        { error: "Request body must include a 'trip' object." },
        { status: 400 }
      );
    }

    const incoming = body as TripWithDetails;

    // Ensure the trip has an id; in future this will come from the client-side
    // helper createTripDraft() or directly from Supabase.
    const tripId: TripId =
      incoming.trip.id ||
      (crypto.randomUUID?.() ?? `trip_${Math.random().toString(36).slice(2)}`);

    const now = new Date().toISOString();

    const normalised: TripWithDetails = {
      ...incoming,
      trip: {
        ...incoming.trip,
        id: tripId,
        userId: DEMO_USER_ID,
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

    const saved = saveTripForUser(DEMO_USER_ID, normalised);

    return NextResponse.json({ trip: saved }, { status: 201 });
  } catch (err) {
    console.error("Error in POST /api/trips:", err);
    return NextResponse.json(
      { error: "Failed to save trip." },
      { status: 500 }
    );
  }
}
