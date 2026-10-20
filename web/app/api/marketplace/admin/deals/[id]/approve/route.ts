/**
 * POST /api/marketplace/admin/deals/:id/approve
 * Admin approve pending_review → scheduled/live (Chunk 17).
 */

import { badRequest } from "@/lib/marketplace/auth";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import { approveDeal } from "@/lib/marketplace/deal-publish";
import { DealNotFoundError } from "@/lib/marketplace/deal-status";
import { requirePermission } from "@/lib/marketplace/permissions";

export const runtime = "nodejs";

type Params = { params: { id: string } };

async function loadDealOperatorId(dealId: string): Promise<string> {
  const store = getDealDraftHttpStore();
  const deal = store.deals.get(dealId);
  if (!deal) throw new DealNotFoundError(dealId);
  return deal.operatorId;
}

export async function POST(req: Request, { params }: Params) {
  try {
    const dealId = params.id;
    if (!dealId) return badRequest("Deal id is required.");

    const operatorId = await loadDealOperatorId(dealId);
    const auth = await requirePermission(req, operatorId, "admin.deals.approve");
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
