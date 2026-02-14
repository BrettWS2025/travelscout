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
    // Get Supabase credentials
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        {
          error: "Supabase credentials not configured.",
        },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { searchParams } = new URL(req.url);
    
    const category = searchParams.get("category");
    const group = searchParams.get("group");

    // Build query
    let query = supabase
      .from("viator_tags")
      .select("tag_id, tag_name, description, category, group_name")
      .order("tag_name", { ascending: true });

    if (category) {
      query = query.eq("category", category);
    }
    if (group) {
      query = query.eq("group_name", group);
    }

    const { data, error } = await query;

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

    return NextResponse.json({
      success: true,
      count: data?.length || 0,
      tags: data || [],
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
