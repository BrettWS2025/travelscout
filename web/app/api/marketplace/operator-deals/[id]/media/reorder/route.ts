/**
 * POST /api/marketplace/operator-deals/:id/media/reorder
 * Body: { ordered_ids: string[] } (Chunk 14). inventory.write.
 */

import { badRequest } from "@/lib/marketplace/auth";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import { reorderDealMediaItems } from "@/lib/marketplace/deal-media-api";
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

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return badRequest("Request body must be JSON.");
    }

    const orderedIds = (body.ordered_ids ?? body.orderedIds) as unknown;
    if (
      !Array.isArray(orderedIds) ||
      !orderedIds.every((x) => typeof x === "string")
    ) {
      return badRequest("ordered_ids must be an array of strings.");
    }

    const media = await reorderDealMediaItems(
      getDealDraftHttpStore(),
      dealId,
      orderedIds as string[],
      { actor: { type: "user", id: auth.user.id } }
    );

    return Response.json({ media });
  } catch (err) {
    return dealDraftErrorResponse(err, "Failed to reorder media.");
  }
}
