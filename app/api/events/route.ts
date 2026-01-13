import { NextResponse } from "next/server";
import { getRedisClient } from "@/lib/redis/client";
import crypto from "crypto";

export const dynamic = "force-dynamic";

// Cache TTL: 1 hour (3600 seconds) - events data changes frequently but not too often
const CACHE_TTL_SECONDS = 3600;

interface EventfindaEvent {
  id: number;
  url: string;
  url_slug: string;
  name: string;
  description?: string;
  datetime_start: string;
  datetime_end?: string;
  location?: {
    id: number;
    name: string;
    url_slug: string;
    address?: string;
    latitude?: number;
    longitude?: number;
  };
  images?: {
    "@attributes"?: {
      count: number;
    };
    images: Array<{
      id: number;
      original_url: string;
      url?: string; // Some formats may use 'url' instead
      width?: number;
      height?: number;
      is_primary?: boolean;
      transforms?: Array<{
        transformation_id: number;
        url: string;
        width: number;
        height: number;
      }>;
    }>;
  } | Array<{
    id: number;
    original_url: string;
    url?: string;
    width?: number;
    height?: number;
    is_primary?: boolean;
    transforms?: Array<{
      transformation_id: number;
      url: string;
      width: number;
      height: number;
    }>;
  }>;
  category?: {
    id: number;
    name: string;
    url_slug: string;
  };
}

interface EventfindaResponse {
  events: EventfindaEvent[];
  meta?: {
    total: number;
    offset: number;
    rows: number;
  };
}

/**
 * Eventfinda Events API Route
 * 
 * Query parameters:
 * - lat: latitude (required when using location-based search)
 * - lng: longitude (required when using location-based search)
 * - radius: search radius in kilometers (default: 30)
 * - rows: number of results to return (default: 20, max: 100)
 * - offset: pagination offset (default: 0)
 * - order: sort order - "date" or "popularity" (default: "date")
 * - q: search query string (optional)
 * - category: filter by category ID (optional)
 * - location: filter by location ID (optional)
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    // Get credentials from environment
    const username = process.env.EVENTFINDA_USERNAME;
    const password = process.env.EVENTFINDA_PASSWORD;

    if (!username || !password) {
      return NextResponse.json(
        { error: "Eventfinda credentials not configured. Please set EVENTFINDA_USERNAME and EVENTFINDA_PASSWORD in your environment." },
        { status: 500 }
      );
    }

    // Parse query parameters
    const lat = searchParams.get("lat");
    const lng = searchParams.get("lng");
    const radius = parseFloat(searchParams.get("radius") || "30");
    const rows = Math.min(parseInt(searchParams.get("rows") || "20", 10), 100);
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const order = searchParams.get("order") || "date";
    const q = searchParams.get("q");
    const category = searchParams.get("category");
    const location = searchParams.get("location");

    // Build API URL
    const apiUrl = new URL("https://api.eventfinda.co.nz/v2/events.json");
    
    // Add point parameter if lat/lng provided
    if (lat && lng) {
      apiUrl.searchParams.append("point", `${lat},${lng}`);
      apiUrl.searchParams.append("radius", radius.toString());
    }

    // Add other parameters
    apiUrl.searchParams.append("rows", rows.toString());
    apiUrl.searchParams.append("offset", offset.toString());
    
    if (order && (order === "date" || order === "popularity")) {
      apiUrl.searchParams.append("order", order);
    }
    
    if (q) {
      apiUrl.searchParams.append("q", q);
    }
    
    if (category) {
      apiUrl.searchParams.append("category", category);
    }
    
    if (location) {
      apiUrl.searchParams.append("location", location);
    }

    // Explicitly request images field
    // Format: fields=event:(id,name,url,url_slug,images:(id,url,width,height))
    apiUrl.searchParams.append("fields", "event:(id,name,url,url_slug,description,datetime_start,datetime_end,images,location:(id,name,url_slug,address,latitude,longitude),category:(id,name,url_slug))");

    // Generate cache key from query parameters
    const cacheKey = `eventfinda:${crypto
      .createHash("sha256")
      .update(apiUrl.toString())
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

    // Make request to Eventfinda API
    const auth = Buffer.from(`${username}:${password}`).toString("base64");
    const response = await fetch(apiUrl.toString(), {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Eventfinda API error:", response.status, errorText);
      return NextResponse.json(
        { 
          error: "Failed to fetch events from Eventfinda API",
          status: response.status,
          details: errorText
        },
        { status: response.status }
      );
    }

    const data: EventfindaResponse = await response.json();

    const responseData = {
      success: true,
      count: data.events?.length || 0,
      total: data.meta?.total || data.events?.length || 0,
      offset: offset,
      rows: rows,
      events: data.events || [],
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
    console.error("Error in events API route:", error);
    return NextResponse.json(
      { 
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
