/**
 * PATCH / DELETE /api/marketplace/operator-deals/:id/price-options/:optionId
 * Manual price option updates (Chunk 13). inventory.write.
 */

import { badRequest } from "@/lib/marketplace/auth";
import {
  deleteDealPriceOption,
  updateDealPriceOption,
} from "@/lib/marketplace/deal-inventory";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import { DealNotFoundError } from "@/lib/marketplace/deal-status";
import { requirePermission } from "@/lib/marketplace/permissions";

export const runtime = "nodejs";

type Params = { params: { id: string; optionId: string } };

async function loadDealOperatorId(dealId: string): Promise<string> {
  const store = getDealDraftHttpStore();
  const deal = store.deals.get(dealId);
  if (!deal) throw new DealNotFoundError(dealId);
  return deal.operatorId;
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id: dealId, optionId } = params;
    if (!dealId || !optionId) {
      return badRequest("Deal id and price option id are required.");
    }

    const operatorId = await loadDealOperatorId(dealId);
    const auth = await requirePermission(req, operatorId, "inventory.write");
    if (!auth.ok) return auth.response;

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return badRequest("Request body must be JSON.");
    }

    const result = await updateDealPriceOption(
      getDealDraftHttpStore(),
      dealId,
      optionId,
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
    return dealDraftErrorResponse(err, "Failed to update price option.");
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const { id: dealId, optionId } = params;
    if (!dealId || !optionId) {
      return badRequest("Deal id and price option id are required.");
    }

    const operatorId = await loadDealOperatorId(dealId);
    const auth = await requirePermission(req, operatorId, "inventory.write");
    if (!auth.ok) return auth.response;

    let confirm = false;
    try {
      const url = new URL(req.url);
      if (url.searchParams.get("confirm") === "true") confirm = true;
      const body = await req.json().catch(() => null);
      if (
        body &&
        typeof body === "object" &&
        (body as { confirm?: unknown }).confirm === true
      ) {
        confirm = true;
      }
    } catch {
      // no body is fine for DELETE
    }

    const result = await deleteDealPriceOption(
      getDealDraftHttpStore(),
      dealId,
      optionId,
      {
        actor: { type: "user", id: auth.user.id },
        confirm,
      }
    );

    return Response.json({ ok: true, validation: result.validation });
  } catch (err) {
    return dealDraftErrorResponse(err, "Failed to delete price option.");
  }
}
