import { NextResponse } from "next/server";
import { searchTicketmasterEvents } from "@/lib/ticketmaster";
import { enforceBffRateLimit } from "@/lib/bff-rate-limit";

export const dynamic = "force-dynamic";

/**
 * Ticketmaster Events API Route
 *
 * This is primarily for debugging and provider-specific inspection.
 * The main frontend should continue to use /api/events, which aggregates
 * Eventfinda and Ticketmaster results.
 */
export async function GET(req: Request) {
  try {
    const limited = await enforceBffRateLimit(req, "ticketmaster");
    if (limited) return limited;

    const { searchParams } = new URL(req.url);

    const latStr = searchParams.get("lat");
    const lngStr = searchParams.get("lng");
    const radiusStr = searchParams.get("radius");
    const startDate = searchParams.get("start_date") || undefined;
    const endDate = searchParams.get("end_date") || undefined;
    const keyword = searchParams.get("q");

    if (!latStr || !lngStr) {
      return NextResponse.json(
        {
          error: "Location coordinates (lat, lng) are required",
          message:
            "Please provide latitude and longitude coordinates to search for events",
        },
        { status: 400 }
      );
    }

    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);
    const radiusKm = radiusStr ? parseFloat(radiusStr) : 30;

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return NextResponse.json(
        {
          error: "Invalid coordinates",
          message: "lat and lng must be valid numbers",
        },
        { status: 400 }
      );
    }

    const { events, total, raw } = await searchTicketmasterEvents({
      lat,
      lng,
      radiusKm,
      startDate,
      endDate,
      keyword,
    });

    return NextResponse.json({
      success: true,
      count: events.length,
      total,
      events: events.map((event: any) => ({
        ...event,
        source: "ticketmaster" as const,
      })),
      raw,
    });
  } catch (error) {
    console.error("Error in Ticketmaster events API route:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch events from Ticketmaster API",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

