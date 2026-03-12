import { NextResponse } from "next/server";
import { createViatorClient } from "@/lib/viator";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * Sync Viator Tags API Route
 * 
 * Fetches all tags from Viator API and updates the database
 * This endpoint should be called weekly via scheduled workflow
 * 
 * Query parameters:
 * - force: set to "true" to force sync even if recently synced (optional)
 */
export async function GET(req: Request) {
  try {
    console.log("[Viator Tags Sync] Starting sync process...");
    
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

    // Get Supabase credentials
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        {
          error: "Supabase credentials not configured. Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
        },
        { status: 500 }
      );
    }

    // Check if we should force sync
    const { searchParams } = new URL(req.url);
    const force = searchParams.get("force") === "true";

    // Create clients
    const viatorClient = createViatorClient();
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch tags from Viator API
    console.log("[Viator Tags Sync] Fetching tags from Viator API...");
    let tagsResponse: any;
    try {
      tagsResponse = await viatorClient.getTags();
    } catch (error) {
      console.error("[Viator Tags Sync] Error fetching tags from Viator:", error);
      return NextResponse.json(
        {
          error: "Failed to fetch tags from Viator API",
          message: error instanceof Error ? error.message : String(error),
        },
        { status: 500 }
      );
    }

    // Parse tags from response (handle different response structures)
    let tags: any[] = [];
    
    if (Array.isArray(tagsResponse)) {
      tags = tagsResponse;
    } else if (tagsResponse && typeof tagsResponse === 'object') {
      // Try common response structures
      if (Array.isArray(tagsResponse.tags)) {
        tags = tagsResponse.tags;
      } else if (tagsResponse.data && Array.isArray(tagsResponse.data.tags)) {
        tags = tagsResponse.data.tags;
      } else if (tagsResponse.data && Array.isArray(tagsResponse.data)) {
        tags = tagsResponse.data;
      } else {
        // If it's an object but not an array, log the structure for debugging
        console.warn("[Viator Tags Sync] Unexpected response structure:", Object.keys(tagsResponse));
        // Try to extract tags from the object
        const values = Object.values(tagsResponse);
        if (values.length > 0 && Array.isArray(values[0])) {
          tags = values[0] as any[];
        }
      }
    }

    if (tags.length === 0) {
      console.warn("[Viator Tags Sync] No tags found in response");
      return NextResponse.json(
        {
          error: "No tags found in Viator API response",
          responseStructure: Object.keys(tagsResponse || {}),
        },
        { status: 500 }
      );
    }

    console.log(`[Viator Tags Sync] Found ${tags.length} tags to sync`);

    // Log first tag structure for debugging
    if (tags.length > 0) {
      console.log("[Viator Tags Sync] Sample tag structure:", JSON.stringify(tags[0], null, 2));
    }

    // Process and upsert tags
    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    for (const tag of tags) {
      try {
        // Extract tag fields (handle different possible structures)
        const tagId = tag.tagId || tag.id || tag.tag_id;
        const tagName = tag.tagName || tag.name || tag.tag_name || tag.title || String(tagId);
        const description = tag.description || tag.desc || null;
        const category = tag.category || tag.categoryName || tag.category_name || null;
        const groupName = tag.group || tag.groupName || tag.group_name || null;
        
        // Store any additional fields in metadata
        const metadata: any = {};
        Object.keys(tag).forEach(key => {
          if (!['tagId', 'id', 'tag_id', 'tagName', 'name', 'tag_name', 'title', 
                'description', 'desc', 'category', 'categoryName', 'category_name',
                'group', 'groupName', 'group_name'].includes(key)) {
            metadata[key] = tag[key];
          }
        });

        if (!tagId) {
          console.warn("[Viator Tags Sync] Skipping tag without ID:", tag);
          errorCount++;
          errors.push(`Tag missing ID: ${JSON.stringify(tag)}`);
          continue;
        }

        // Upsert tag using the database function
        const { error: upsertError } = await supabase.rpc('upsert_viator_tags', {
          p_tag_id: parseInt(String(tagId), 10),
          p_tag_name: String(tagName),
          p_description: description,
          p_category: category,
          p_group_name: groupName,
          p_metadata: metadata,
        });

        if (upsertError) {
          console.error(`[Viator Tags Sync] Error upserting tag ${tagId}:`, upsertError);
          errorCount++;
          errors.push(`Tag ${tagId}: ${upsertError.message}`);
        } else {
          successCount++;
        }
      } catch (tagError) {
        console.error(`[Viator Tags Sync] Error processing tag:`, tagError);
        errorCount++;
        errors.push(`Tag processing error: ${tagError instanceof Error ? tagError.message : String(tagError)}`);
      }
    }

    console.log(`[Viator Tags Sync] Sync complete: ${successCount} successful, ${errorCount} errors`);

    return NextResponse.json({
      success: true,
      totalTags: tags.length,
      successCount,
      errorCount,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined, // Limit error details
      message: `Synced ${successCount} tags successfully${errorCount > 0 ? `, ${errorCount} errors` : ''}`,
    });
  } catch (error) {
    console.error("[Viator Tags Sync] Unhandled error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    return NextResponse.json(
      {
        error: "Internal server error",
        message: errorMessage,
        stack: process.env.NODE_ENV === "development" ? errorStack : undefined,
      },
      { status: 500 }
    );
  }
}
