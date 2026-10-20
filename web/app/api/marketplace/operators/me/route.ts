/**
 * GET /api/marketplace/operators/me
 * Operators the authenticated user belongs to (Chunk 22 editor context).
 */

import { unauthorized } from "@/lib/marketplace/auth";
import { getMarketplaceAuth } from "@/lib/marketplace/auth";
import { listOperatorsForUser } from "@/lib/marketplace/deal-draft-http";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { user, accessToken } = await getMarketplaceAuth(req);
    if (!user || !accessToken) return unauthorized();

    const operators = listOperatorsForUser(user.id, user.email ?? null);
    return Response.json({ operators });
  } catch (err) {
    if (err instanceof Error && err.message === "Authentication required.") {
      return unauthorized();
    }
    console.error("Failed to list my operators", err);
    return Response.json(
      { error: "Failed to list operators." },
      { status: 500 }
    );
  }
}
