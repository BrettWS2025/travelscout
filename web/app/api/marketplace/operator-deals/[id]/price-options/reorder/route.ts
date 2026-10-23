/**
 * POST /api/marketplace/operator-deals/:id/price-options/reorder
 * Set sort_order from ordered_ids (Chunk 13). inventory.write.
 */

import { badRequest } from "@/lib/marketplace/auth";
import { reorderDealPriceOptions } from "@/lib/marketplace/deal-inventory";
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

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return badRequest("Request body must be JSON.");
    }

    const orderedIds = (body.ordered_ids ?? body.orderedIds) as unknown;
    if (!Array.isArray(orderedIds) || !orderedIds.every((x) => typeof x === "string")) {
      return badRequest("ordered_ids must be an array of strings.");
    }

    const result = await reorderDealPriceOptions(
      getDealDraftHttpStore(),
      dealId,
      orderedIds as string[],
      {
        actor: { type: "user", id: auth.user.id },
        confirm: body.confirm === true,
      }
    );

    return Response.json({
      price_options: result.priceOptions,
      validation: result.validation,
    });
  } catch (err) {
    return dealDraftErrorResponse(err, "Failed to reorder price options.");
  }
}
