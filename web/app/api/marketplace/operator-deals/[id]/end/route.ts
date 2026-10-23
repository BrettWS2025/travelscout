/**
 * POST /api/marketplace/operator-deals/:id/end
 * Operator end deal. Requires inventory.write.
 */

import { badRequest } from "@/lib/marketplace/auth";
import { endDeal } from "@/lib/marketplace/deal-actions";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
  requirePermissionForDeal,
} from "@/lib/marketplace/deal-draft-http";

export const runtime = "nodejs";

type Params = { params: { id: string } };

export async function POST(req: Request, { params }: Params) {
  try {
    const dealId = params.id;
    if (!dealId) return badRequest("Deal id is required.");

    const auth = await requirePermissionForDeal(req, dealId, "inventory.write");
    if (!auth.ok) return auth.response;

    const deal = endDeal(getDealDraftHttpStore(), dealId, {
      actor: { type: "user", id: auth.user.id },
    });

    return Response.json({ deal });
  } catch (err) {
    return dealDraftErrorResponse(err, "Failed to end deal.");
  }
}
