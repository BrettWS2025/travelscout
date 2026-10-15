import { findNearestPlace, isInsideNewZealand } from "@/lib/places";

export const runtime = "nodejs";

/**
 * GET /api/places/nearest?lat=&lng=&radiusKm=
 * Nearest nz_places_final place (with region) for geolocation defaulting.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const lat = Number(url.searchParams.get("lat"));
    const lng = Number(url.searchParams.get("lng"));
    const radiusKm = Number(url.searchParams.get("radiusKm") || "50");

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return Response.json(
        { error: "lat and lng query params are required numbers." },
        { status: 400 }
      );
    }

    if (!isInsideNewZealand(lat, lng)) {
      return Response.json({
        place: null,
        outsideNz: true,
      });
    }

    const radius =
      Number.isFinite(radiusKm) && radiusKm > 0 ? Math.min(radiusKm, 200) : 50;

    let place = await findNearestPlace(lat, lng, Math.min(radius, 15));
    if (!place) {
      place = await findNearestPlace(lat, lng, radius);
    }

    return Response.json({
      place,
      outsideNz: false,
    });
  } catch (err) {
    console.error("[api/places/nearest]", err);
    return Response.json(
      { error: "Failed to resolve nearest place." },
      { status: 500 }
    );
  }
}
