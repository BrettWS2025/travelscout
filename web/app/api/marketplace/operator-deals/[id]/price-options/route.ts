/**
 * POST /api/marketplace/operator-deals/:id/price-options
 * Add a manual price option (Chunk 13). inventory.write.
 */

import { badRequest } from "@/lib/marketplace/auth";
import { createDealPriceOption } from "@/lib/marketplace/deal-inventory";
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

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return badRequest("Request body must be JSON.");
    }

    const result = await createDealPriceOption(
      getDealDraftHttpStore(),
      dealId,
      body,
      {
        actor: { type: "user", id: auth.user.id },
        confirm: body.confirm === true,
      }
    );

    return Response.json({
      price_option: result.priceOption,
      validation: result.validation,
    });
  } catch (err) {
    return dealDraftErrorResponse(err, "Failed to create price option.");
  }
}
