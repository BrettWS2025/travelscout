/**
 * POST /api/marketplace/operator-deals/:id/verify-discount
 * Chunk 33 — verify integrated discount against the provider adapter.
 *
 * Body (optional): { promo_code_confirmed_by_operator?: boolean }
 */

import { badRequest } from "@/lib/marketplace/auth";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import { verifyDealDiscount } from "@/lib/marketplace/deal-integrated-pricing";
import { DealNotFoundError } from "@/lib/marketplace/deal-status";
import { requirePermission } from "@/lib/marketplace/permissions";

export const runtime = "nodejs";

type Params = { params: { id: string } };

export async function POST(req: Request, { params }: Params) {
  try {
    const dealId = params.id;
    if (!dealId) return badRequest("Deal id is required.");

    const store = getDealDraftHttpStore();
    const deal = store.deals.get(dealId);
    if (!deal) throw new DealNotFoundError(dealId);

    const auth = await requirePermission(
      req,
      deal.operatorId,
      "inventory.write"
    );
    if (!auth.ok) return auth.response;

    let body: Record<string, unknown> = {};
    try {
      const parsed = await req.json();
      if (parsed && typeof parsed === "object") {
        body = parsed as Record<string, unknown>;
      }
    } catch {
      // empty body is fine
    }

    const confirmed = body.promo_code_confirmed_by_operator;
    const result = await verifyDealDiscount(store, dealId, {
      actor: { type: "user", id: auth.user.id },
      promo_code_confirmed_by_operator:
        confirmed === true ? true : confirmed === false ? false : undefined,
    });

    return Response.json({
      deal: result.deal,
      verification: result.verification,
      status: result.verification.status,
      options: result.verification.options,
    });
  } catch (err) {
    return dealDraftErrorResponse(err, "Failed to verify discount.");
  }
}
