import { listNzRegions } from "@/lib/places";
import { NZ_REGIONS_ALPHA } from "@/lib/regions";

export const runtime = "nodejs";

/**
 * GET /api/regions
 * Distinct NZ regions from nz_places_final (canonical short names).
 */
export async function GET() {
  try {
    const regions = await listNzRegions();
    return Response.json({ regions });
  } catch (err) {
    console.error("[api/regions]", err);
    return Response.json({ regions: [...NZ_REGIONS_ALPHA] });
  }
}
