/**
 * POST /api/marketplace/admin/deals/:id/approve
 * Admin approve pending_review → scheduled/live (Chunk 17).
 */

import { badRequest } from "@/lib/marketplace/auth";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
  requirePermissionForDeal,
} from "@/lib/marketplace/deal-draft-http";
import { approveDeal } from "@/lib/marketplace/deal-publish";

export const runtime = "nodejs";

type Params = { params: { id: string } };

export async function POST(req: Request, { params }: Params) {
  try {
    const dealId = params.id;
    if (!dealId) return badRequest("Deal id is required.");

    const auth = await requirePermissionForDeal(req, dealId, "admin.deals.approve");
    if (!auth.ok) return auth.response;

    const result = await approveDeal(getDealDraftHttpStore(), dealId, {
      actor: { type: "admin", id: auth.user.id },
    });

    return Response.json({
      deal: result.deal,
      validation: result.validation,
      publish_button: result.publish_button,
      target_status: result.target_status,
    });
  } catch (err) {
    return dealDraftErrorResponse(err, "Failed to approve deal.");
  }
}
