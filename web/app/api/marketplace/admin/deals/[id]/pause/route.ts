/**
 * POST /api/marketplace/admin/deals/:id/pause
 * Body: { detail? }. pause_reason=admin, no auto-resume (Chunk 17).
 */

import { badRequest } from "@/lib/marketplace/auth";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
  requirePermissionForDeal,
} from "@/lib/marketplace/deal-draft-http";
import { adminPauseDeal } from "@/lib/marketplace/deal-publish";

export const runtime = "nodejs";

type Params = { params: { id: string } };

export async function POST(req: Request, { params }: Params) {
  try {
    const dealId = params.id;
    if (!dealId) return badRequest("Deal id is required.");

    const auth = await requirePermissionForDeal(req, dealId, "admin.deals.pause");
    if (!auth.ok) return auth.response;

    let body: Record<string, unknown> = {};
    try {
      const text = await req.text();
      if (text.trim()) {
        body = JSON.parse(text) as Record<string, unknown>;
      }
    } catch {
      return badRequest("Request body must be JSON.");
    }

    const detail =
      typeof body.detail === "string"
        ? body.detail
        : typeof body.notes === "string"
          ? body.notes
          : null;

    const deal = adminPauseDeal(getDealDraftHttpStore(), dealId, {
      actor: { type: "admin", id: auth.user.id },
      detail,
    });

    return Response.json({ deal });
  } catch (err) {
    return dealDraftErrorResponse(err, "Failed to admin-pause deal.");
  }
}
