import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  parseTagMetadata,
  parentTagIdsFromMetadata,
} from "@/lib/viator/tag-metadata";

export const dynamic = "force-dynamic";

/** PostgREST returns at most 1000 rows per request unless paginated. */
const PAGE_SIZE = 1000;

/** Batch `.in()` lists so request URLs stay well under proxy limits. */
const IN_CHUNK_SIZE = 100;

type ViatorTagRow = {
  tag_id: number;
  tag_name: string;
  description: string | null;
  category: string | null;
  group_name: string | null;
  metadata: unknown;
};

/**
 * Load every row from viator_tags (optionally filtered). Uses tag_id order so
 * pagination is stable; tag_name is often numeric strings and sorts badly.
 */
async function fetchAllViatorTags(
  supabase: SupabaseClient,
  category: string | null,
  group: string | null
): Promise<{ data: ViatorTagRow[]; error: { message: string } | null }> {
  const rows: ViatorTagRow[] = [];
  let from = 0;
  for (;;) {
    let q = supabase
      .from("viator_tags")
      .select("tag_id, tag_name, description, category, group_name, metadata")
      .order("tag_id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (category) q = q.eq("category", category);
    if (group) q = q.eq("group_name", group);
    const { data, error } = await q;
    if (error) return { data: [], error };
    if (!data?.length) break;
    rows.push(...(data as ViatorTagRow[]));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return { data: rows, error: null };
}

async function fetchViatorTagsByIds(
  supabase: SupabaseClient,
  ids: number[],
  select: string
): Promise<{ data: any[]; error: { message: string } | null }> {
  if (ids.length === 0) return { data: [], error: null };
  const out: any[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + IN_CHUNK_SIZE);
    const { data, error } = await supabase
      .from("viator_tags")
      .select(select)
      .in("tag_id", chunk);
    if (error) return { data: [], error };
    if (data?.length) out.push(...data);
  }
  return { data: out, error: null };
}

/**
 * Get Viator Tags API Route
 * 
 * Returns all tags from the database for filtering
 * 
 * Query parameters:
 * - category: filter by category (optional)
 * - group: filter by group (optional)
 */
export async function GET(req: Request) {
  try {
    // Get Supabase credentials (using anon key for read-only access)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        {
          error: "Supabase credentials not configured.",
          message: "Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your environment.",
        },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { searchParams } = new URL(req.url);
    
    const category = searchParams.get("category");
    const group = searchParams.get("group");
    const productTagIdsParam = searchParams.get("productTagIds"); // Comma-separated list of tag IDs from products
    const tagIdsParam = searchParams.get("tagIds"); // Comma-separated list of specific tag IDs to fetch (for building child-to-parent map)

    // No Redis cache: responses depend on viator_tags (updated by sync). Hour-long cache caused stale chips after sync.

    // Debug: Test basic access first
    console.log(`[Viator Tags API] Testing database access...`);
    const testQuery = supabase.from("viator_tags").select("tag_id").limit(1);
    const { data: testData, error: testError } = await testQuery;
    console.log(`[Viator Tags API] Test query result:`, { 
      hasData: !!testData, 
      dataLength: testData?.length || 0,
      error: testError ? {
        message: testError.message,
        details: testError.details,
        hint: testError.hint,
        code: testError.code
      } : null
    });
    
    if (testError) {
      console.error("[Viator Tags API] Cannot access viator_tags table:", testError);
      return NextResponse.json(
        {
          error: "Cannot access tags table",
          message: testError.message,
          details: testError.details,
          hint: testError.hint,
          code: testError.code,
        },
        { status: 500 }
      );
    }

    // Use SQL to find parent tags (tags that are referenced in other tags' parentTagIds)
    // This is more efficient and reliable than JavaScript filtering
    let sqlQuery = `
      WITH parent_tag_ids AS (
        SELECT DISTINCT jsonb_array_elements_text(metadata->'parentTagIds')::integer as parent_id
        FROM viator_tags
        WHERE metadata->'parentTagIds' IS NOT NULL
      )
      SELECT 
        t.tag_id,
        t.tag_name,
        t.description,
        t.category,
        t.group_name,
        t.metadata
      FROM viator_tags t
      WHERE t.tag_id IN (SELECT parent_id FROM parent_tag_ids)
    `;

    const conditions: string[] = [];
    if (category) {
      conditions.push(`t.category = '${category.replace(/'/g, "''")}'`);
    }
    if (group) {
      conditions.push(`t.group_name = '${group.replace(/'/g, "''")}'`);
    }

    if (conditions.length > 0) {
      sqlQuery += ` AND ${conditions.join(' AND ')}`;
    }

    sqlQuery += ` ORDER BY t.tag_name ASC`;

    // Execute the SQL query using Supabase RPC or direct query
    // Since we can't use raw SQL easily with the client, we'll fetch all and filter
    // But let's use a more efficient approach

    console.log(`[Viator Tags API] Fetching all tags (paginated, max ${PAGE_SIZE} per request)...`);
    const { data: allTagsRows, error: fetchAllError } = await fetchAllViatorTags(
      supabase,
      category,
      group
    );

    if (fetchAllError) {
      console.error("[Viator Tags API] Error fetching tags:", fetchAllError);
      return NextResponse.json(
        {
          error: "Failed to fetch tags",
          message: fetchAllError.message,
          details: fetchAllError,
        },
        { status: 500 }
      );
    }

    const finalTags = allTagsRows;
    const error = null;

    console.log(`[Viator Tags API] Loaded ${finalTags.length} tag rows total`);

    // Filter to only parent tags (tags that are referenced in other tags' parentTagIds)
    if (!finalTags || finalTags.length === 0) {
      console.warn("[Viator Tags API] No tags returned from database");
      console.warn("[Viator Tags API] Query result:", { data: finalTags, error, dataLength: finalTags?.length });
      
      // Try a simple test query to see if we can access the table at all
      const testQuery = supabase.from("viator_tags").select("tag_id").limit(1);
      const { data: testData, error: testError } = await testQuery;
      console.warn("[Viator Tags API] Test query result:", { 
        testData, 
        testError,
        testDataLength: testData?.length,
        canAccessTable: !testError && testData && testData.length > 0
      });
      
      return NextResponse.json({
        success: true,
        count: 0,
        tags: [],
        debug: {
          error: error || null,
          testQuery: testError ? testError.message : "success",
          testDataCount: testData?.length || 0
        }
      });
    }

    // Debug: Check what we actually got
    console.log(`[Viator Tags API] Fetched ${finalTags.length} tags from database`);
    if (finalTags.length > 0) {
      const sampleTag = finalTags[0];
      console.log(`[Viator Tags API] Sample tag structure:`, {
        tag_id: sampleTag.tag_id,
        tag_name: sampleTag.tag_name,
        has_metadata: !!sampleTag.metadata,
        metadata_type: typeof sampleTag.metadata,
        metadata_keys: sampleTag.metadata ? Object.keys(sampleTag.metadata) : null,
        metadata_sample: sampleTag.metadata ? JSON.stringify(sampleTag.metadata).substring(0, 200) : null
      });
    }

    // Collect all parentTagIds from all tags
    // Handle both number and string IDs (JSONB can sometimes return strings)
    const allParentTagIds = new Set<number>();
    let tagsWithMetadata = 0;
    let tagsWithParentIds = 0;
    
    finalTags.forEach((tag) => {
      const metadata = parseTagMetadata(tag.metadata);
      if (!metadata) return;
      tagsWithMetadata++;
      const parentIds = parentTagIdsFromMetadata(metadata);
      if (parentIds.length > 0) {
        tagsWithParentIds++;
        parentIds.forEach((numId) => allParentTagIds.add(numId));
      }
    });

    // Filter to only tags that are parent tags
    let parentTags = finalTags.filter(tag => allParentTagIds.has(Number(tag.tag_id)));

    // If productTagIds are provided, filter to only show parent tags that are referenced by those products
    // Also prepare for fetching child tags if tagIdsParam is provided
    let allTagsForMap: any[] = [];
    const tagIdsToFetch = new Set<number>();
    
    if (productTagIdsParam) {
      const productTagIds = productTagIdsParam.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
      
      if (productTagIds.length > 0) {
        // Add product tag IDs to the set of tags to fetch
        productTagIds.forEach(id => tagIdsToFetch.add(id));
        
        // Get metadata for the product tags to find their parentTagIds
        // If tagIdsParam is also provided, we'll combine the queries
        const { data: productTagsData, error: productTagsLookupError } =
          await fetchViatorTagsByIds(supabase, productTagIds, "tag_id, metadata");
        if (productTagsLookupError) {
          console.error("[Viator Tags API] Product tag lookup failed:", productTagsLookupError);
        }
        
        if (productTagsData && productTagsData.length > 0) {
          const parentTagsBeforeProductFilter = parentTags;
          // Collect all parent tag IDs referenced by product tags
          const referencedParentTagIds = new Set<number>();
          productTagsData.forEach((productTag) => {
            const metadata = parseTagMetadata(productTag.metadata);
            parentTagIdsFromMetadata(metadata).forEach((numId) =>
              referencedParentTagIds.add(numId)
            );
          });

          // Also include parent tags that directly match product tag IDs (in case products have parent tags directly)
          productTagIds.forEach((id) => {
            if (allParentTagIds.has(id)) {
              referencedParentTagIds.add(id);
            }
          });

          // Filter parent tags to only those referenced by products
          parentTags = parentTags.filter((tag) => {
            const tagId = Number(tag.tag_id);
            return allParentTagIds.has(tagId) && referencedParentTagIds.has(tagId);
          });

          if (
            parentTags.length === 0 &&
            parentTagsBeforeProductFilter.length > 0 &&
            referencedParentTagIds.size === 0
          ) {
            console.warn(
              "[Viator Tags API] No parentTagIds on product tags; showing all parent tags for this view"
            );
            parentTags = parentTagsBeforeProductFilter;
          }

          console.log(
            `[Viator Tags API] Filtered to ${parentTags.length} applicable parent tags from ${productTagIds.length} product tags`
          );
        }
      }
    }

    // If tagIds parameter is provided, also return all tags (not just parent tags) for building child-to-parent map
    // Combine with productTagIds if both are provided to reduce database queries
    if (tagIdsParam) {
      const tagIds = tagIdsParam.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
      tagIds.forEach(id => tagIdsToFetch.add(id));
    }

    // Fetch all needed tags if we have any tag IDs to fetch (chunked .in)
    if (tagIdsToFetch.size > 0) {
      const { data: allTagsData, error: mapLookupError } = await fetchViatorTagsByIds(
        supabase,
        Array.from(tagIdsToFetch),
        "tag_id, tag_name, metadata"
      );
      if (mapLookupError) {
        console.error("[Viator Tags API] Child/parent tag map lookup failed:", mapLookupError);
      }
      if (allTagsData?.length) {
        allTagsForMap = allTagsData;
      }
    }

    // If Viator metadata does not expose parent links, fall back to direct product tags
    // so chips still render instead of showing an empty filter bar.
    let usingDirectProductTagFallback = false;
    if (parentTags.length === 0 && productTagIdsParam) {
      const productTagIds = new Set(
        productTagIdsParam
          .split(",")
          .map((id) => parseInt(id.trim(), 10))
          .filter((id) => !isNaN(id))
      );
      if (productTagIds.size > 0) {
        const directTags = finalTags.filter((tag) => productTagIds.has(Number(tag.tag_id)));
        if (directTags.length > 0) {
          usingDirectProductTagFallback = true;
          parentTags = directTags;
          console.warn(
            `[Viator Tags API] Falling back to direct product tags: ${parentTags.length} tags`
          );
        }
      }
    }

    // Final validation: ensure returned tags are parent tags, unless we are using
    // direct product-tag fallback for providers that do not supply parentTagIds metadata.
    if (!usingDirectProductTagFallback) {
      const validatedParentTags = parentTags.filter((tag) =>
        allParentTagIds.has(Number(tag.tag_id))
      );
      if (validatedParentTags.length !== parentTags.length) {
        console.warn(
          `[Viator Tags API] WARNING: Filtered out ${parentTags.length - validatedParentTags.length} non-parent tags!`
        );
      }
      parentTags = validatedParentTags;
    }

    // Debug logging - detailed breakdown
    console.log(`[Viator Tags API] Processing results:`);
    console.log(`  - Total tags fetched: ${finalTags.length}`);
    console.log(`  - Tags with metadata: ${tagsWithMetadata}`);
    console.log(`  - Tags with parentTagIds: ${tagsWithParentIds}`);
    console.log(`  - Unique parent tag IDs collected: ${allParentTagIds.size}`);
    
    if (allParentTagIds.size > 0) {
      const sampleIds = Array.from(allParentTagIds).slice(0, 10);
      console.log(`  - Sample parent IDs found: ${sampleIds.join(', ')}`);
      
      // Check if any of these IDs exist in finalTags
      const matchingTags = finalTags.filter(t => sampleIds.includes(Number(t.tag_id)));
      console.log(`  - Tags matching sample parent IDs: ${matchingTags.length}`);
      if (matchingTags.length > 0) {
        console.log(`  - Sample matching tag IDs: ${matchingTags.slice(0, 5).map(t => t.tag_id).join(', ')}`);
      } else {
        console.warn(`  - WARNING: No tags found matching the parent IDs! This suggests a data mismatch.`);
      }
    } else {
      console.warn(`  - WARNING: No parent tag IDs were collected from metadata!`);
      // Show sample metadata to debug
      const sampleTagWithMetadata = finalTags.find(t => t.metadata);
      if (sampleTagWithMetadata) {
        const meta = typeof sampleTagWithMetadata.metadata === 'string' 
          ? JSON.parse(sampleTagWithMetadata.metadata) 
          : sampleTagWithMetadata.metadata;
        console.warn(`  - Sample metadata structure:`, JSON.stringify(meta, null, 2).substring(0, 500));
      }
    }
    
    console.log(`  - Parent tags returned: ${parentTags.length}`);
    
    if (parentTags.length > 0) {
      console.log(`[Viator Tags API] Sample parent tags:`, parentTags.slice(0, 5).map(t => {
        const metadata = typeof t.metadata === 'string' ? JSON.parse(t.metadata) : t.metadata;
        return {
          id: t.tag_id,
          name: t.tag_name,
          englishName: metadata?.allNamesByLocale?.en
        };
      }));
    } else if (finalTags.length > 0) {
      console.warn("[Viator Tags API] No parent tags found. Debug info:");
      console.warn(`  - Total tags: ${finalTags.length}`);
      console.warn(`  - Tags with metadata: ${tagsWithMetadata}`);
      console.warn(`  - Tags with parentTagIds: ${tagsWithParentIds}`);
      console.warn(`  - Unique parent IDs collected: ${allParentTagIds.size}`);
      
      // Sample a tag with metadata to see structure
      const sampleTag = finalTags.find(t => t.metadata);
      if (sampleTag) {
        const metadata = typeof sampleTag.metadata === 'string' ? JSON.parse(sampleTag.metadata) : sampleTag.metadata;
        console.warn(`  - Sample tag metadata structure:`, JSON.stringify(metadata, null, 2));
      }
      
      if (allParentTagIds.size > 0) {
        const sampleParentIds = Array.from(allParentTagIds).slice(0, 10);
        console.warn(`  - Sample parent IDs found:`, sampleParentIds);
        const matchingTags = finalTags.filter(t => sampleParentIds.includes(Number(t.tag_id)));
        console.warn(`  - Tags matching these IDs:`, matchingTags.map(t => ({ id: t.tag_id, name: t.tag_name })));
      } else {
        console.warn(`  - No parent IDs were collected from metadata`);
      }
    }


    const responseData = {
      success: true,
      count: parentTags.length,
      tags: parentTags,
      ...(allTagsForMap.length > 0 && { allTags: allTagsForMap }),
    };

    return NextResponse.json(responseData);
  } catch (error) {
    console.error("[Viator Tags API] Unhandled error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    return NextResponse.json(
      {
        error: "Internal server error",
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}
