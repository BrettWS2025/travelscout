/**
 * POST /api/marketplace/operator-deals/:id/mark-sold-out
 * Zero all manual seats and move live → sold_out. Requires inventory.write.
 * Manual deals only.
 */

import { badRequest } from "@/lib/marketplace/auth";
import { markDealSoldOut } from "@/lib/marketplace/deal-actions";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
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
    const auth = await requirePermission(req, operatorId, "inventory.write");
    if (!auth.ok) return auth.response;

    const result = markDealSoldOut(getDealDraftHttpStore(), dealId, {
      actor: { type: "user", id: auth.user.id },
    });

    return Response.json({
      deal: result.deal,
      sessions: result.sessions,
    });
  } catch (err) {
    return dealDraftErrorResponse(err, "Failed to mark deal sold out.");
  }
}
