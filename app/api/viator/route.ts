import { NextResponse } from "next/server";
import { createViatorClient, type ViatorSearchParams } from "@/lib/viator";
import { getRedisClient } from "@/lib/redis/client";
import crypto from "crypto";

export const dynamic = "force-dynamic";

// Cache TTL: 1 hour (3600 seconds) - Viator product data changes but not too frequently
const CACHE_TTL_SECONDS = 3600;

/**
 * Viator Products API Route
 * 
 * Query parameters:
 * - lat: latitude (optional, for location-based search)
 * - lng: longitude (optional, for location-based search)
 * - radius: search radius in kilometers (default: 20, max: 50)
 * - destinationId: Viator destination ID (optional, alternative to lat/lng)
 * - q: search query string (optional)
 * - start: pagination offset (default: 0)
 * - count: number of results to return (default: 20, max: 500)
 * - sortBy: sort order - "POPULARITY", "PRICE", "RATING", "DURATION" (default: "POPULARITY")
 * - sortOrder: "ASC" or "DESC" (default: "DESC")
 * - currencyCode: currency code for pricing (default: "NZD")
 * - minPrice: minimum price filter (optional)
 * - maxPrice: maximum price filter (optional)
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    // Get API key from environment
    const apiKey = process.env.VIATOR_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          error: "Viator API key not configured. Please set VIATOR_API_KEY in your environment.",
        },
        { status: 500 }
      );
    }

    // Parse query parameters
    const lat = searchParams.get("lat");
    const lng = searchParams.get("lng");
    const radius = parseFloat(searchParams.get("radius") || "20");
    const destinationId = searchParams.get("destinationId");
    const searchQuery = searchParams.get("q");
    const start = parseInt(searchParams.get("start") || "0", 10);
    const count = Math.min(parseInt(searchParams.get("count") || "20", 10), 500);
    const sortBy = searchParams.get("sortBy") || "POPULARITY";
    const sortOrder = (searchParams.get("sortOrder") || "DESC") as "ASC" | "DESC";
    const currencyCode = searchParams.get("currencyCode") || "NZD";
    const minPrice = searchParams.get("minPrice");
    const maxPrice = searchParams.get("maxPrice");

    // Validate that we have either lat/lng, destinationId, or searchQuery
    if (!lat && !lng && !destinationId && !searchQuery) {
      return NextResponse.json(
        {
          error: "Location coordinates (lat, lng), destinationId, or search query (q) is required",
          message: "Please provide either latitude/longitude, a destination ID, or a search query",
        },
        { status: 400 }
      );
    }

    // Build search parameters
    const searchParams_obj: ViatorSearchParams = {
      start,
      count,
      sortBy: sortBy as any,
      sortOrder,
      currencyCode,
    };

    // Add location-based search
    if (lat && lng) {
      searchParams_obj.latitude = parseFloat(lat);
      searchParams_obj.longitude = parseFloat(lng);
      searchParams_obj.radius = Math.min(radius, 50); // API typically limits radius
    } else if (destinationId) {
      searchParams_obj.destinationId = parseInt(destinationId, 10);
    }

    // Add text search
    if (searchQuery) {
      searchParams_obj.searchQuery = searchQuery;
    }

    // Add price filters
    if (minPrice) {
      searchParams_obj.minPrice = parseFloat(minPrice);
    }
    if (maxPrice) {
      searchParams_obj.maxPrice = parseFloat(maxPrice);
    }

    // Generate cache key from query parameters
    const cacheKey = `viator:${crypto
      .createHash("sha256")
      .update(JSON.stringify(searchParams_obj))
      .digest("hex")}`;

    // Try to get cached response
    const redis = getRedisClient();
    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          const cachedData = JSON.parse(cached);
          return NextResponse.json(cachedData);
        }
      } catch (cacheError) {
        // Log but don't fail - continue to API call
        console.warn("Redis cache read error:", cacheError);
      }
    }

    // Create Viator client and make request
    const client = createViatorClient();
    const result = await client.searchProducts(searchParams_obj);

    const responseData = {
      success: true,
      count: result.products.length,
      total: result.totalCount,
      hasMore: result.hasMore,
      start,
      requestedCount: count,
      products: result.products,
    };

    // Cache the response
    if (redis) {
      try {
        await redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(responseData));
      } catch (cacheError) {
        // Log but don't fail - response is still valid
        console.warn("Redis cache write error:", cacheError);
      }
    }

    return NextResponse.json(responseData);
  } catch (error) {
    console.error("Error in Viator API route:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
