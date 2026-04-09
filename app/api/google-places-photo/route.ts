import { NextResponse } from "next/server";
import crypto from "crypto";
import { getRedisClient } from "@/lib/redis/client";

export const dynamic = "force-dynamic";

const DEFAULT_MAX_HEIGHT_PX = 400;
const MAX_MAX_HEIGHT_PX = 800;

async function readResponseAsBuffer(res: Response): Promise<{ buffer: Buffer; contentType: string }> {
  const contentType = res.headers.get("content-type") || "image/jpeg";
  const ab = await res.arrayBuffer();
  return { buffer: Buffer.from(ab), contentType };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const photoName = searchParams.get("photoName") || searchParams.get("name");
    if (!photoName) {
      return NextResponse.json(
        { success: false, error: "Missing photoName", message: "Provide `photoName` query param." },
        { status: 400 }
      );
    }

    const maxHeightPxRaw = searchParams.get("maxHeightPx");
    const maxHeightPx =
      maxHeightPxRaw && Number.isFinite(parseInt(maxHeightPxRaw, 10))
        ? Math.min(parseInt(maxHeightPxRaw, 10), MAX_MAX_HEIGHT_PX)
        : DEFAULT_MAX_HEIGHT_PX;

    const apiKey =
      process.env.GOOGLE_PLACES_API_KEY ||
      process.env.GOOGLE_PLACES_API ||
      process.env.GOOGLE_PLACES_APIKEY;

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "GOOGLE_PLACES_API key not configured", message: "Set GOOGLE_PLACES_API_KEY in your environment." },
        { status: 500 }
      );
    }

    // photoName is expected to be a full resource name like:
    // "places/{placeId}/photos/{photoId}"
    const endpoint = `https://places.googleapis.com/v1/${photoName}/media`;

    const cacheKey = `google-places-photo:${crypto
      .createHash("sha256")
      .update(JSON.stringify({ photoName, maxHeightPx }))
      .digest("hex")}`;

    const redis = getRedisClient();
    const CACHE_TTL_SECONDS = 24 * 60 * 60; // 24 hours

    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached) as { b64: string; contentType: string };
          const body = Buffer.from(parsed.b64, "base64");
          return new NextResponse(body, {
            headers: {
              "Content-Type": parsed.contentType,
              "Cache-Control": "public, max-age=86400, s-maxage=86400",
            },
          });
        }
      } catch (cacheError) {
        console.warn("[google-places-photo] Redis cache read error:", cacheError);
      }
    }

    const response = await fetch(endpoint + `?maxHeightPx=${maxHeightPx}`, {
      method: "GET",
      headers: {
        "X-Goog-Api-Key": apiKey,
      },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return NextResponse.json(
        {
          success: false,
          error: "Google Places photo fetch failed",
          message: `Google Places error ${response.status}: ${text || response.statusText}`,
        },
        { status: response.status }
      );
    }

    const { buffer, contentType } = await readResponseAsBuffer(response);

    if (redis && buffer.length <= 600_000) {
      // Avoid storing overly large images in Redis.
      try {
        await redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify({ b64: buffer.toString("base64"), contentType }));
      } catch (cacheError) {
        console.warn("[google-places-photo] Redis cache write error:", cacheError);
      }
    }

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        // Browser/CDN caching to reduce repeated photo fetches (and billing) for the same images.
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
      },
    });
  } catch (error) {
    console.error("[google-places-photo] error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

