import { NextResponse } from "next/server";
import { enforceBffRateLimit } from "@/lib/bff-rate-limit";

export const dynamic = "force-dynamic";

type TextSearchPlace = {
  id: string;
  name: string;
  address?: string;
  rating?: number | null;
  userRatingCount?: number | null;
  lat?: number;
  lng?: number;
  googleMapsUri?: string;
  imageUrl?: string;
  photoName?: string;
};

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function extractFirstUsablePhotoUrl(photo: unknown): string | undefined {
  const p = photo as Record<string, unknown> | undefined;
  if (!p) return undefined;
  const candidates = [p.mediaUri, p.photoUri, p.uri, p.url, p.downloadUri].filter(
    (v): v is string => typeof v === "string" && v.length > 0
  );
  return candidates[0];
}

/**
 * Resolve a free-text place query (name + address) to a single place with photo/rating when possible.
 * Used to enrich manual hotel / venue entries.
 */
export async function GET(req: Request) {
  try {
    const limited = await enforceBffRateLimit(req, "googlePlaces");
    if (limited) return limited;

    const { searchParams } = new URL(req.url);
    const textQuery = (searchParams.get("textQuery") || "").trim();
    if (!textQuery) {
      return NextResponse.json(
        { success: false, error: "Missing textQuery", message: "Provide a non-empty textQuery." },
        { status: 400 }
      );
    }

    const latRaw = searchParams.get("lat");
    const lngRaw = searchParams.get("lng");
    const lat = latRaw ? parseFloat(latRaw) : NaN;
    const lng = lngRaw ? parseFloat(lngRaw) : NaN;
    const hasBias = Number.isFinite(lat) && Number.isFinite(lng);

    const radiusMetersRaw = parseInt(searchParams.get("radiusMeters") || "60000", 10);
    const radiusMeters = Math.max(1000, Math.min(Number.isFinite(radiusMetersRaw) ? radiusMetersRaw : 60000, 60000));
    /** Google Places (New) circle radius is capped at 50km; we post-filter to the requested km (up to 60). */
    const requestedRadiusKm = Math.min(radiusMeters / 1000, 60);
    const apiCircleRadius = Math.min(radiusMeters, 50000);

    const preferLodgingRaw = (searchParams.get("preferLodging") || "").trim().toLowerCase();
    const preferLodging = preferLodgingRaw === "1" || preferLodgingRaw === "true";

    const apiKey =
      process.env.GOOGLE_PLACES_API_KEY ||
      process.env.GOOGLE_PLACES_API ||
      process.env.GOOGLE_PLACES_APIKEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error: "GOOGLE_PLACES_API key not configured",
          message: "Set GOOGLE_PLACES_API_KEY in your environment.",
        },
        { status: 500 }
      );
    }

    const endpoint = "https://places.googleapis.com/v1/places:searchText";

    const requestBody: Record<string, unknown> = {
      textQuery,
      maxResultCount: preferLodging ? 10 : 8,
      languageCode: "en",
    };

    if (preferLodging) {
      requestBody.includedType = "lodging";
    }

    // Text Search (New) does NOT support locationRestriction.circle (only rectangle for restriction).
    // Nearby Search supports circle; for Text Search we use locationBias.circle and enforce radius
    // in code below. See: https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places/searchText
    if (hasBias) {
      requestBody.locationBias = {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: apiCircleRadius,
        },
      };
    }

    const fieldMask =
      "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.location,places.photos,places.googleMapsUri,places.types";

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": fieldMask,
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return NextResponse.json(
        {
          success: false,
          error: "Google Places error",
          message: text || response.statusText,
        },
        { status: 502 }
      );
    }

    const data = (await response.json()) as { places?: unknown[] };
    const rawPlaces = Array.isArray(data.places) ? data.places : [];
    if (rawPlaces.length === 0) {
      return NextResponse.json({ success: true, place: null as TextSearchPlace | null });
    }

    type Parsed = TextSearchPlace & { _km?: number };
    const parsed: Parsed[] = rawPlaces
      .map((raw) => {
        const p = raw as Record<string, unknown>;
        const placeId =
          (typeof p.id === "string" && p.id) ||
          (typeof p.name === "string" && p.name) ||
          "";
        const name =
          (p.displayName as { text?: string } | undefined)?.text ||
          (typeof p.displayName === "string" ? p.displayName : "") ||
          "";
        const rating = typeof p.rating === "number" ? p.rating : null;
        const userRatingCount = typeof p.userRatingCount === "number" ? p.userRatingCount : null;
        const address =
          (typeof p.formattedAddress === "string" && p.formattedAddress) ||
          (typeof p.shortFormattedAddress === "string" && p.shortFormattedAddress) ||
          undefined;
        const loc = p.location as { latitude?: number; longitude?: number; lat?: number; lng?: number } | undefined;
        const locationLat = loc?.latitude ?? loc?.lat;
        const locationLng = loc?.longitude ?? loc?.lng;
        const googleMapsUri = typeof p.googleMapsUri === "string" ? p.googleMapsUri : undefined;
        const photos = p.photos as unknown[] | undefined;
        const firstPhoto = Array.isArray(photos) && photos.length > 0 ? (photos[0] as Record<string, unknown>) : undefined;
        const photoName =
          typeof firstPhoto?.name === "string"
            ? firstPhoto.name
            : typeof firstPhoto?.photoName === "string"
              ? (firstPhoto.photoName as string)
              : undefined;
        const imageUrl = firstPhoto ? extractFirstUsablePhotoUrl(firstPhoto) : undefined;

        const place: Parsed = {
          id: placeId || name || textQuery,
          name: name || textQuery,
          address,
          rating,
          userRatingCount,
          lat: typeof locationLat === "number" ? locationLat : undefined,
          lng: typeof locationLng === "number" ? locationLng : undefined,
          googleMapsUri,
          imageUrl,
          photoName,
        };

        if (!place.imageUrl && place.photoName) {
          place.imageUrl = `/api/google-places-photo?photoName=${encodeURIComponent(place.photoName)}&maxHeightPx=400`;
        }

        if (
          hasBias &&
          typeof place.lat === "number" &&
          typeof place.lng === "number" &&
          Number.isFinite(place.lat) &&
          Number.isFinite(place.lng)
        ) {
          place._km = haversineKm(lat, lng, place.lat, place.lng);
        }
        return place;
      })
      .filter((place) => place.name && place.name.trim().length > 0);

    let ranked = parsed;
    if (hasBias && requestedRadiusKm > 0) {
      ranked = parsed
        .filter(
          (p) =>
            typeof p._km === "number" &&
            p._km <= requestedRadiusKm + 0.5 &&
            typeof p.lat === "number" &&
            typeof p.lng === "number"
        )
        .sort((a, b) => (a._km ?? 0) - (b._km ?? 0));
    }

    if (ranked.length === 0) {
      return NextResponse.json({ success: true, place: null as TextSearchPlace | null });
    }

    const best = ranked[0];
    const { _km: _ignoredKm, ...place } = best;
    void _ignoredKm;
    return NextResponse.json({ success: true, place: place as TextSearchPlace });
  } catch (error) {
    console.error("[google-places-text-search]", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: "Internal server error", message },
      { status: 500 }
    );
  }
}
