import { NextResponse } from "next/server";
import { createViatorClient, type ViatorSearchParams } from "@/lib/viator";
import { getRedisClient } from "@/lib/redis/client";
import crypto from "crypto";

export const dynamic = "force-dynamic";

// Cache TTL: 6 hours (21600 seconds) - Viator product data changes infrequently
// Longer TTL improves performance since we're prefetching when destinations are selected
const CACHE_TTL_SECONDS = 21600;

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
    console.log("[Viator API] Request received");
    const { searchParams } = new URL(req.url);
    console.log("[Viator API] Query params:", Object.fromEntries(searchParams.entries()));

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
    const locationName = searchParams.get("locationName"); // Location name for destination lookup
    const searchQuery = searchParams.get("q");
    const start = parseInt(searchParams.get("start") || "0", 10);
    const count = Math.min(parseInt(searchParams.get("count") || "20", 10), 500);
    const sortBy = searchParams.get("sortBy") || "POPULARITY";
    const sortOrder = (searchParams.get("sortOrder") || "DESC") as "ASC" | "DESC";
    const currencyCode = searchParams.get("currencyCode") || "NZD";
    const minPrice = searchParams.get("minPrice");
    const maxPrice = searchParams.get("maxPrice");

    // Validate that we have either lat/lng or destinationId (searchQuery alone is not enough)
    // Viator API requires destinationId for product search
    if (!lat && !lng && !destinationId) {
      return NextResponse.json(
        {
          error: "Location coordinates (lat, lng) or destinationId is required",
          message: "Please provide either latitude/longitude or a destination ID. Search query alone is not sufficient.",
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

    // Create Viator client early (needed for destination lookup)
    const client = createViatorClient();

    // Track destination ID lookup result
    let foundDestinationId: number | null = null;

    // Add location-based search
    if (destinationId) {
      const parsedId = parseInt(destinationId, 10);
      if (isNaN(parsedId) || parsedId <= 0) {
        return NextResponse.json(
          {
            error: "Invalid destinationId",
            message: "destinationId must be a positive integer",
          },
          { status: 400 }
        );
      }
      searchParams_obj.destinationId = parsedId;
      console.log(`[Viator API] Using provided destinationId: ${searchParams_obj.destinationId}`);
    } else if (lat && lng) {
      // Viator API requires destinationId, not coordinates directly
      // Try to fetch destinations and find the correct one
      const searchLat = parseFloat(lat);
      const searchLng = parseFloat(lng);
      const searchRadius = parseFloat(radius.toString());
      
      console.log(`[Viator API] ========================================`);
      console.log(`[Viator API] LOCATION-BASED SEARCH`);
      console.log(`[Viator API] Location: ${locationName || 'Unknown'}`);
      console.log(`[Viator API] Coordinates: lat=${searchLat}, lng=${searchLng}`);
      console.log(`[Viator API] Radius: ${searchRadius}km`);
      console.log(`[Viator API] ========================================`);
      
      if (locationName) {
        try {
          console.log(`[Viator API] Fetching destinations to find ID for: ${locationName}`);
          const destinationsResponse = await client.getDestinations();
          
          // Handle different response structures
          let destinations: any[] = [];
          if (Array.isArray(destinationsResponse)) {
            destinations = destinationsResponse;
          } else if (destinationsResponse && typeof destinationsResponse === 'object') {
            destinations = destinationsResponse.destinations || destinationsResponse.data?.destinations || [];
          }
          
          console.log(`[Viator API] Found ${destinations.length} total destinations in Viator database`);
          
          // Extract main location name from compound names like "Franz Josef / Waiau" -> "Franz Josef"
          // Also handle variations like "Franz Josef" -> try "Franz Josef Glacier"
          const locationParts = locationName.split('/').map(p => p.trim());
          const mainLocation = locationParts[0];
          
          // Generate search variations
          const searchVariations = [
            locationName.toLowerCase().trim(), // Full name: "franz josef / waiau"
            mainLocation.toLowerCase().trim(),  // Main part: "franz josef"
            ...locationParts.map(p => p.toLowerCase().trim()), // All parts
          ];
          
          // Add common variations for glacier locations
          if (mainLocation.toLowerCase().includes("josef") || mainLocation.toLowerCase().includes("fox")) {
            searchVariations.push(`${mainLocation.toLowerCase()} glacier`);
            searchVariations.push(`${mainLocation.toLowerCase()} & fox glacier`);
          }
          
          console.log(`[Viator API] Searching for destination with variations:`, searchVariations);
          
          // Filter to New Zealand destinations first (but keep all destinations as fallback)
          const nzDestinations = destinations.filter((dest: any) => {
            const destName = (dest.destinationName || dest.name || dest.title || "").toLowerCase();
            const isNZ = destName.includes("new zealand") || destName.includes("nz") || 
                   dest.countryCode === "NZ" || dest.country === "New Zealand" ||
                   dest.countryCode === "nz" || dest.countryCode === "NZL";
            return isNZ;
          });
          
          console.log(`[Viator API] Found ${nzDestinations.length} New Zealand destinations (out of ${destinations.length} total)`);
          
          // Debug: Check if Queenstown is in the destinations
          if (mainLocation.toLowerCase().includes("queenstown")) {
            const queenstownMatches = destinations.filter((d: any) => {
              const name = (d.destinationName || d.name || d.title || "").toLowerCase();
              return name.includes("queenstown");
            });
            console.log(`[Viator API] DEBUG: Found ${queenstownMatches.length} destinations containing "queenstown":`, 
              queenstownMatches.map((d: any) => ({
                name: d.destinationName || d.name || d.title,
                id: d.destinationId || d.id || d.destId,
                country: d.country || d.countryCode,
                inNZList: nzDestinations.includes(d)
              }))
            );
          }
          
          let match: any = null;
          
          // First, try exact match in NZ destinations for each variation
          for (const variation of searchVariations) {
            match = nzDestinations.find((dest: any) => {
              const destName = (dest.destinationName || dest.name || dest.title || "").toLowerCase().trim();
              return destName === variation || 
                     destName === `${variation}, new zealand` || 
                     destName === `${variation}, nz` ||
                     destName.startsWith(`${variation},`) ||
                     destName === `${variation} new zealand` ||
                     destName === `${variation} nz`;
            });
            if (match) {
              console.log(`[Viator API] ✅ Exact match found in NZ destinations with variation: "${variation}"`);
              break;
            }
          }
          
          // If no exact match in NZ, try in all destinations (for edge cases)
          if (!match) {
            for (const variation of searchVariations) {
              match = destinations.find((dest: any) => {
                const destName = (dest.destinationName || dest.name || dest.title || "").toLowerCase().trim();
                return destName === variation || 
                       destName === `${variation}, new zealand` || 
                       destName === `${variation}, nz` ||
                       destName.startsWith(`${variation},`);
              });
              if (match) {
                console.log(`[Viator API] ✅ Exact match found in all destinations with variation: "${variation}"`);
                break;
              }
            }
          }
          
          // If no exact match, try partial match in NZ destinations for each variation
          if (!match) {
            for (const variation of searchVariations) {
              // Split variation into words for better matching
              const variationWords = variation.split(/\s+/).filter(w => w.length > 2); // Ignore short words
              
              match = nzDestinations.find((dest: any) => {
                const destName = (dest.destinationName || dest.name || dest.title || "").toLowerCase().trim();
                
                // Check if destination contains all significant words from variation
                const hasAllWords = variationWords.length > 0 && variationWords.every(word => destName.includes(word));
                
                // Or check if variation contains the main part of destination name
                const destMainPart = destName.split(',')[0].trim();
                const variationMainPart = variation.split(',')[0].trim();
                const containsMainPart = destName.includes(variationMainPart) || variation.includes(destMainPart);
                
                // Also check if destination starts with variation (for "Queenstown" matching "Queenstown, New Zealand")
                const startsWithVariation = destName.startsWith(variation);
                
                return hasAllWords || containsMainPart || startsWithVariation;
              });
              
              if (match) {
                console.log(`[Viator API] ✅ Partial match found in NZ destinations with variation: "${variation}"`);
                break;
              }
            }
          }
          
          // Last resort: try partial match in all destinations
          if (!match) {
            for (const variation of searchVariations) {
              const variationWords = variation.split(/\s+/).filter(w => w.length > 2);
              
              match = destinations.find((dest: any) => {
                const destName = (dest.destinationName || dest.name || dest.title || "").toLowerCase().trim();
                const destMainPart = destName.split(',')[0].trim();
                const variationMainPart = variation.split(',')[0].trim();
                return destName.includes(variationMainPart) || 
                       variation.includes(destMainPart) ||
                       destName.startsWith(variation);
              });
              
              if (match) {
                console.log(`[Viator API] ✅ Partial match found in all destinations with variation: "${variation}"`);
                break;
              }
            }
          }
          
          if (match) {
            const destId = match.destinationId || match.id || match.destId;
            if (destId) {
              foundDestinationId = parseInt(String(destId), 10);
              const matchName = match.destinationName || match.name || match.title;
              console.log(`[Viator API] ✅ MATCHED DESTINATION:`);
              console.log(`[Viator API]   - Name: ${matchName}`);
              console.log(`[Viator API]   - ID: ${foundDestinationId}`);
              console.log(`[Viator API]   - Will search ONLY this destination (not nearby areas)`);
            }
          } else {
            console.log(`[Viator API] ❌ No destination match found for ${locationName}`);
            console.log(`[Viator API] Tried variations:`, searchVariations);
            
            // Log all NZ destinations that might be relevant (containing key words)
            const keyWords = mainLocation.toLowerCase().split(/\s+/).filter(w => w.length > 3);
            const potentialMatches = nzDestinations
              .filter((d: any) => {
                const name = (d.destinationName || d.name || d.title || "").toLowerCase();
                return keyWords.some(word => name.includes(word));
              })
              .slice(0, 20)
              .map((d: any) => ({
                name: d.destinationName || d.name || d.title,
                id: d.destinationId || d.id || d.destId,
                country: d.country || d.countryCode
              }));
            console.log(`[Viator API] Potential matches (${potentialMatches.length}):`, potentialMatches);
            
            // Also log all NZ destinations for debugging
            const allNzDestinations = nzDestinations.slice(0, 50).map((d: any) => ({
              name: d.destinationName || d.name || d.title,
              id: d.destinationId || d.id || d.destId,
            }));
            console.log(`[Viator API] Sample of all NZ destinations (first 50):`, allNzDestinations);
          }
        } catch (destError) {
          console.error(`[Viator API] ❌ Error fetching destinations:`, destError);
          // Continue without destination lookup - will return empty results
        }
      }
      
      if (foundDestinationId) {
        searchParams_obj.destinationId = foundDestinationId;
        console.log(`[Viator API] Using destination ID ${foundDestinationId} for ${locationName}`);
        console.log(`[Viator API] ⚠️  NOTE: Viator API searches by destination ID only - radius parameter is IGNORED`);
        console.log(`[Viator API] ⚠️  This means we're getting ALL products for this destination, not just within ${searchRadius}km`);
      } else {
        // No destination found - return empty results gracefully
        console.log(`[Viator API] ❌ No destination ID found for location: ${locationName || `lat:${lat}, lng:${lng}`}`);
        return NextResponse.json({
          success: true,
          count: 0,
          total: 0,
          hasMore: false,
          start,
          requestedCount: count,
          products: [],
          message: "No Viator destination found for the provided location",
        });
      }
    }
    
    // Validate that we have a valid destinationId before proceeding
    // This is a critical check - Viator API requires destinationId
    if (!searchParams_obj.destinationId || typeof searchParams_obj.destinationId !== 'number' || searchParams_obj.destinationId <= 0) {
      console.error(`[Viator API] ❌ Missing or invalid destinationId. searchParams_obj:`, JSON.stringify(searchParams_obj, null, 2));
      return NextResponse.json({
        success: false,
        error: "Destination ID is required for Viator product search",
        message: "A valid destination ID must be provided. Please provide either a destinationId parameter or lat/lng coordinates with locationName.",
        count: 0,
        total: 0,
        hasMore: false,
        start,
        requestedCount: count,
        products: [],
      }, { status: 400 });
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

    // Final validation before API call - double check destinationId is valid
    if (!searchParams_obj.destinationId || typeof searchParams_obj.destinationId !== 'number' || searchParams_obj.destinationId <= 0 || isNaN(searchParams_obj.destinationId)) {
      console.error(`[Viator API] ❌ CRITICAL: Invalid destinationId before API call. searchParams_obj:`, JSON.stringify(searchParams_obj, null, 2));
      return NextResponse.json({
        success: false,
        error: "Invalid destination ID",
        message: "A valid destination ID is required for Viator product search",
        count: 0,
        total: 0,
        hasMore: false,
        start,
        requestedCount: count,
        products: [],
      }, { status: 400 });
    }

    // Make request
    let result;
    try {
      console.log(`[Viator API] ========================================`);
      console.log(`[Viator API] PRODUCT SEARCH REQUEST`);
      console.log(`[Viator API] Destination ID: ${searchParams_obj.destinationId}`);
      console.log(`[Viator API] Pagination: start=${searchParams_obj.start}, count=${searchParams_obj.count}`);
      console.log(`[Viator API] Sort: ${searchParams_obj.sortBy} ${searchParams_obj.sortOrder}`);
      console.log(`[Viator API] Currency: ${searchParams_obj.currencyCode}`);
      console.log(`[Viator API] Full search params:`, JSON.stringify(searchParams_obj, null, 2));
      console.log(`[Viator API] ========================================`);
      
      result = await client.searchProducts(searchParams_obj);
      
      console.log(`[Viator API] ========================================`);
      console.log(`[Viator API] SEARCH RESULTS`);
      console.log(`[Viator API] Products returned: ${result.products.length}`);
      console.log(`[Viator API] Total available: ${result.totalCount}`);
      console.log(`[Viator API] Has more: ${result.hasMore}`);
      console.log(`[Viator API] Coverage: ${result.products.length}/${result.totalCount} (${((result.products.length / result.totalCount) * 100).toFixed(1)}%)`);
      
      if (result.products.length > 0) {
        console.log(`[Viator API] First 10 product codes:`, result.products.slice(0, 10).map((p: any) => p.productCode));
        console.log(`[Viator API] First 10 product titles:`, result.products.slice(0, 10).map((p: any) => p.title?.substring(0, 50)));
      }
      console.log(`[Viator API] ========================================`);
    } catch (searchError) {
      console.error("[Viator API] Error searching products:", searchError);
      const errorMessage = searchError instanceof Error ? searchError.message : String(searchError);
      const errorStack = searchError instanceof Error ? searchError.stack : undefined;
      console.error("[Viator API] Error details:", { message: errorMessage, stack: errorStack });
      
      // Check if it's a validation error (missing destinationId)
      const isValidationError = errorMessage.includes("destinationId is required") || 
                                 errorMessage.includes("destination") && errorMessage.includes("required");
      
      if (isValidationError) {
        // Return 400 for validation errors
        return NextResponse.json({
          success: false,
          error: "Validation error",
          message: errorMessage,
          count: 0,
          total: 0,
          hasMore: false,
          start,
          requestedCount: count,
          products: [],
        }, { status: 400 });
      }
      
      // Return empty results with 200 status for other errors to prevent UI errors
      return NextResponse.json({
        success: true,
        count: 0,
        total: 0,
        hasMore: false,
        start,
        requestedCount: count,
        products: [],
        message: "Failed to search Viator products",
        error: process.env.NODE_ENV === "development" ? errorMessage : undefined,
      });
    }

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
    console.error("[Viator API] Unhandled error in route:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error("[Viator API] Error stack:", errorStack);
    
    // Return 200 with empty results instead of 500 to prevent UI errors
    return NextResponse.json({
      success: true,
      count: 0,
      total: 0,
      hasMore: false,
      products: [],
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? errorMessage : undefined,
    });
  }
}
