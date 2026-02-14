import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

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
    
    // Test: Try fetching with metadata to see if that's the issue
    console.log(`[Viator Tags API] Testing query with metadata field...`);
    const testWithMetadata = supabase
      .from("viator_tags")
      .select("tag_id, tag_name, metadata")
      .limit(5);
    const { data: testMetadata, error: testMetadataError } = await testWithMetadata;
    console.log(`[Viator Tags API] Test query with metadata:`, {
      hasData: !!testMetadata,
      dataLength: testMetadata?.length || 0,
      error: testMetadataError ? {
        message: testMetadataError.message,
        details: testMetadataError.details,
        hint: testMetadataError.hint,
        code: testMetadataError.code
      } : null
    });
    
    // Try fetching without order first to see if that's the issue
    console.log(`[Viator Tags API] Fetching all tags...`);
    let query = supabase
      .from("viator_tags")
      .select("tag_id, tag_name, description, category, group_name, metadata");

    if (category) {
      query = query.eq("category", category);
    }
    if (group) {
      query = query.eq("group_name", group);
    }

    // Try without order first
    const { data: allTagsNoOrder, error: errorNoOrder } = await query;
    console.log(`[Viator Tags API] Query without order:`, {
      hasData: !!allTagsNoOrder,
      dataLength: allTagsNoOrder?.length || 0,
      error: errorNoOrder
    });

    // Now try with order
    query = query.order("tag_name", { ascending: true });
    const { data: allTags, error } = await query;
    
    console.log(`[Viator Tags API] Query with order:`, {
      hasData: !!allTags,
      dataLength: allTags?.length || 0,
      error: error
    });
    
    // Use the result that worked
    const finalTags = allTags && allTags.length > 0 ? allTags : (allTagsNoOrder || []);

    if (error) {
      console.error("[Viator Tags API] Error fetching tags:", error);
      console.error("[Viator Tags API] Error details:", JSON.stringify(error, null, 2));
      return NextResponse.json(
        {
          error: "Failed to fetch tags",
          message: error.message,
          details: error,
        },
        { status: 500 }
      );
    }

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
    
    finalTags.forEach(tag => {
      // Handle metadata - it might be null, a string, or already an object
      let metadata = tag.metadata;
      if (metadata === null || metadata === undefined) {
        return;
      }
      
      if (typeof metadata === 'string') {
        try {
          metadata = JSON.parse(metadata);
        } catch (e) {
          // Skip tags with invalid JSON metadata
          return;
        }
      }
      
      if (metadata) {
        tagsWithMetadata++;
        const parentTagIds = metadata.parentTagIds;
        if (Array.isArray(parentTagIds) && parentTagIds.length > 0) {
          tagsWithParentIds++;
          parentTagIds.forEach((id: any) => {
            const numId = typeof id === 'string' ? parseInt(id, 10) : Number(id);
            if (!isNaN(numId) && numId > 0) {
              allParentTagIds.add(numId);
            }
          });
        }
      }
    });

    // Filter to only tags that are parent tags
    const parentTags = finalTags.filter(tag => allParentTagIds.has(Number(tag.tag_id)));

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

    return NextResponse.json({
      success: true,
      count: parentTags.length,
      tags: parentTags,
    });
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
