import { NextResponse } from "next/server";
import crypto from "crypto";
import { getRedisClient } from "@/lib/redis/client";

export const dynamic = "force-dynamic";

type NearbyGooglePlace = {
  id: string;
  name: string;
  address?: string;
  rating?: number | null;
  lat?: number;
  lng?: number;
  googleMapsUri?: string;
  imageUrl?: string; // If we can derive a usable URL directly from search response.
  photoName?: string; // Resource name used with our photo proxy route.
};

type NearbyPlacesResponse = {
  success: boolean;
  places: NearbyGooglePlace[];
  total: number;
  requested: number;
};

function haversineDistanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371; // km
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);

  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const aa = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
  return R * c;
}

function extractFirstUsablePhotoUrl(photo: any): string | undefined {
  // Google response shapes vary. Prefer any mediaUri-like field if present.
  // If the photo object only includes a resource name, we'll fall back to photoName proxying.
  const candidates = [
    photo?.mediaUri,
    photo?.photoUri,
    photo?.uri,
    photo?.url,
    photo?.downloadUri,
  ].filter((v: unknown) => typeof v === "string" && v.length > 0);
  return candidates[0] as string | undefined;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const latRaw = searchParams.get("lat");
    const lngRaw = searchParams.get("lng");
    if (!latRaw || !lngRaw) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing lat/lng",
          message: "Provide `lat` and `lng` query params for nearby search.",
        },
        { status: 400 }
      );
    }

    const lat = parseFloat(latRaw);
    const lng = parseFloat(lngRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json(
        { success: false, error: "Invalid lat/lng", message: "lat and lng must be valid numbers." },
        { status: 400 }
      );
    }

    // Cost-control knobs.
    const radiusMetersRaw = parseInt(searchParams.get("radiusMeters") || "5000", 10); // 5km is usually enough for top 10 in a city center.
    const radiusMeters = Math.max(100, Math.min(radiusMetersRaw, 50000));
    const maxPlaces = Math.min(parseInt(searchParams.get("maxPlaces") || "7", 10), 7); // capped to 7 to control API usage/cost.

    // Default to restaurants because you have a dedicated "Dinner at ..." card in the UI.
    // You can change this later (e.g., tourist_attraction) without changing the integration shape.
    const includedType = (searchParams.get("includedType") || "restaurant").trim();

    const apiKey =
      process.env.GOOGLE_PLACES_API_KEY ||
      process.env.GOOGLE_PLACES_API ||
      process.env.GOOGLE_PLACES_APIKEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error: "GOOGLE_PLACES_API key not configured",
          message: "Set GOOGLE_PLACES_API_KEY (or GOOGLE_PLACES_API) in your environment.",
        },
        { status: 500 }
      );
    }

    // Cache to avoid repeated billed requests for the same city center.
    const cacheKey = `google-places-nearby:${crypto
      .createHash("sha256")
      .update(JSON.stringify({ lat: +lat.toFixed(5), lng: +lng.toFixed(5), radiusMeters, maxPlaces, includedType }))
      .digest("hex")}`;

    const redis = getRedisClient();
    const CACHE_TTL_SECONDS = 6 * 60 * 60; // 6 hours
    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          return NextResponse.json(JSON.parse(cached) as NearbyPlacesResponse);
        }
      } catch (cacheError) {
        console.warn("[google-places-nearby] Redis cache read error:", cacheError);
      }
    }

    // Places API (New) Nearby Search.
    // We use a single request and rely on rank-by-distance; we still re-sort locally to guarantee correct ordering.
    const endpoint = "https://places.googleapis.com/v1/places:searchNearby";

    const requestBody: any = {
      includedTypes: [includedType],
      maxResultCount: maxPlaces,
      rankPreference: "DISTANCE",
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          // Places API (New) expects a numeric radius here, not a typed object.
          radius: radiusMeters,
        },
      },
      languageCode: "en",
    };

    // Prefer field masks to reduce payload / billing exposure.
    // If Google rejects the mask, we'll retry without it (fail open).
    const fieldMask =
      "places.id,places.displayName,places.formattedAddress,places.rating,places.location,places.photos,places.googleMapsUri";

    const doFetch = async (useFieldMask: boolean) => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
      };
      if (useFieldMask) headers["X-Goog-FieldMask"] = fieldMask;

      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Google Places error ${response.status}: ${text || response.statusText}`);
      }
      return response.json();
    };

    let googleData: any;
    try {
      googleData = await doFetch(true);
    } catch (err) {
      // Retry without field mask so we still return results even if our mask is slightly off.
      console.warn("[google-places-nearby] FieldMask retry after error:", err);
      googleData = await doFetch(false);
    }

    const rawPlaces: any[] = Array.isArray(googleData?.places) ? googleData.places : [];

    const transformed: Array<NearbyGooglePlace & { _distanceKm: number }> = rawPlaces
      .map((p: any) => {
        const placeId: string =
          p?.id?.toString?.() ||
          p?.name?.toString?.() ||
          p?.placeId?.toString?.() ||
          "";

        const name: string = p?.displayName?.text || p?.displayName || p?.name || "";

        const rating: number | null | undefined =
          typeof p?.rating === "number" ? p.rating : p?.rating ?? null;

        const address: string | undefined =
          p?.formattedAddress || p?.shortFormattedAddress || p?.vicinity || undefined;

        const locationLat: number | undefined = p?.location?.latitude ?? p?.location?.lat;
        const locationLng: number | undefined = p?.location?.longitude ?? p?.location?.lng;

        const googleMapsUri: string | undefined = p?.googleMapsUri;

        // photos may be: [{ name, widthPx, heightPx, ... (sometimes includes mediaUri fields) }]
        const firstPhoto = Array.isArray(p?.photos) && p.photos.length > 0 ? p.photos[0] : undefined;
        const photoName: string | undefined = firstPhoto?.name?.toString?.() || firstPhoto?.photoName?.toString?.();
        const imageUrl: string | undefined = firstPhoto ? extractFirstUsablePhotoUrl(firstPhoto) : undefined;

        if (typeof locationLat !== "number" || typeof locationLng !== "number" || !Number.isFinite(locationLat) || !Number.isFinite(locationLng)) {
          // If we can't compute distance, keep it but push it to the end deterministically.
          return {
            id: placeId || name,
            name,
            address,
            rating,
            lat: locationLat,
            lng: locationLng,
            googleMapsUri,
            imageUrl,
            photoName,
            _distanceKm: Number.POSITIVE_INFINITY,
          };
        }

        return {
          id: placeId || name,
          name,
          address,
          rating,
          lat: locationLat,
          lng: locationLng,
          googleMapsUri,
          imageUrl,
          photoName,
          _distanceKm: haversineDistanceKm(lat, lng, locationLat, locationLng),
        };
      })
      .filter((p) => p.name && p.name.trim().length > 0);

    transformed.sort((a, b) => a._distanceKm - b._distanceKm);

    const places = transformed.slice(0, maxPlaces).map((p) => ({
      id: p.id,
      name: p.name,
      address: p.address,
      rating: p.rating,
      lat: p.lat,
      lng: p.lng,
      googleMapsUri: p.googleMapsUri,
      imageUrl: p.imageUrl,
      photoName: p.photoName,
    }));

    // If we don't have an imageUrl, front-end can use our proxy to fetch the first photo on demand.
    const responseData: NearbyPlacesResponse = {
      success: true,
      places: places.map((p) => ({
        ...p,
        // Only provide a photoName; the client will call our proxy.
        // (If imageUrl already exists from Google response, we keep it.)
        imageUrl: p.imageUrl,
      })),
      total: places.length,
      requested: maxPlaces,
    };

    if (redis) {
      try {
        await redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(responseData));
      } catch (cacheError) {
        console.warn("[google-places-nearby] Redis cache write error:", cacheError);
      }
    }

    return NextResponse.json(responseData);
  } catch (error) {
    console.error("[google-places-nearby] error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Actionable response for the most common setup issue.
    if (
      errorMessage.includes("API_KEY_HTTP_REFERRER_BLOCKED") ||
      errorMessage.includes("Requests from referer <empty> are blocked")
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Google API key restriction mismatch",
          message:
            "Your Google Places key is restricted to HTTP referrers (browser). This endpoint runs server-side, so use a server key (IP-restricted or unrestricted) with Places API (New) enabled.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}

