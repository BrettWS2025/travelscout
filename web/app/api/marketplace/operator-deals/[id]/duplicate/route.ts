/**
 * POST /api/marketplace/operator-deals/:id/duplicate
 * Duplicate a deal into a new draft (Chunk 12). Requires inventory.write.
 */

import { badRequest } from "@/lib/marketplace/auth";
import { duplicateDeal } from "@/lib/marketplace/deal-draft";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import { DealNotFoundError } from "@/lib/marketplace/deal-status";
import { requirePermission } from "@/lib/marketplace/permissions";

export const runtime = "nodejs";

type Params = { params: { id: string } };

export async function POST(req: Request, { params }: Params) {
  try {
    const dealId = params.id;
    if (!dealId) return badRequest("Deal id is required.");

    const store = getDealDraftHttpStore();
    const source = store.deals.get(dealId);
    if (!source) throw new DealNotFoundError(dealId);

    const auth = await requirePermission(
      req,
      source.operatorId,
      "inventory.write"
    );
    if (!auth.ok) return auth.response;

    const deal = duplicateDeal(store, dealId, {
      actor: { type: "user", id: auth.user.id },
    });
    return Response.json({ deal }, { status: 201 });
  } catch (err) {
    return dealDraftErrorResponse(err, "Failed to duplicate deal.");
  }
}
