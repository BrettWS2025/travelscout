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
    let query = supabase
      .from("viator_tags")
      .select("tag_id, tag_name, description, category, group_name, metadata")
      .order("tag_name", { ascending: true });

    if (category) {
      query = query.eq("category", category);
    }
    if (group) {
      query = query.eq("group_name", group);
    }

    const { data: allTags, error } = await query;

    if (error) {
      console.error("[Viator Tags API] Error fetching tags:", error);
      return NextResponse.json(
        {
          error: "Failed to fetch tags",
          message: error.message,
        },
        { status: 500 }
      );
    }

    // Filter to only parent tags (tags that are referenced in other tags' parentTagIds)
    if (!allTags || allTags.length === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
        tags: [],
      });
    }

    // Collect all parentTagIds from all tags
    // Handle both number and string IDs (JSONB can sometimes return strings)
    const allParentTagIds = new Set<number>();
    let tagsWithMetadata = 0;
    let tagsWithParentIds = 0;
    
    allTags.forEach(tag => {
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
    const parentTags = allTags.filter(tag => allParentTagIds.has(Number(tag.tag_id)));

    // Debug logging
    console.log(`[Viator Tags API] Total tags: ${allTags.length}, Tags with metadata: ${tagsWithMetadata}, Tags with parentTagIds: ${tagsWithParentIds}, Unique parent tag IDs found: ${allParentTagIds.size}, Parent tags returned: ${parentTags.length}`);
    
    if (parentTags.length > 0) {
      console.log(`[Viator Tags API] Sample parent tags:`, parentTags.slice(0, 5).map(t => {
        const metadata = typeof t.metadata === 'string' ? JSON.parse(t.metadata) : t.metadata;
        return {
          id: t.tag_id,
          name: t.tag_name,
          englishName: metadata?.allNamesByLocale?.en
        };
      }));
    } else if (allTags.length > 0) {
      console.warn("[Viator Tags API] No parent tags found. Debug info:");
      console.warn(`  - Total tags: ${allTags.length}`);
      console.warn(`  - Tags with metadata: ${tagsWithMetadata}`);
      console.warn(`  - Tags with parentTagIds: ${tagsWithParentIds}`);
      console.warn(`  - Unique parent IDs collected: ${allParentTagIds.size}`);
      
      // Sample a tag with metadata to see structure
      const sampleTag = allTags.find(t => t.metadata);
      if (sampleTag) {
        const metadata = typeof sampleTag.metadata === 'string' ? JSON.parse(sampleTag.metadata) : sampleTag.metadata;
        console.warn(`  - Sample tag metadata structure:`, JSON.stringify(metadata, null, 2));
      }
      
      if (allParentTagIds.size > 0) {
        const sampleParentIds = Array.from(allParentTagIds).slice(0, 10);
        console.warn(`  - Sample parent IDs found:`, sampleParentIds);
        const matchingTags = allTags.filter(t => sampleParentIds.includes(Number(t.tag_id)));
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
