/**
 * POST /api/marketplace/operator-deals/:id/pause
 * Operator pause (reason=operator). Requires inventory.write.
 *
 * Optional body: { detail?: string }
 */

import { badRequest } from "@/lib/marketplace/auth";
import { pauseDeal } from "@/lib/marketplace/deal-actions";
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

    let body: Record<string, unknown> = {};
    try {
      const text = await req.text();
      if (text.trim()) {
        body = JSON.parse(text) as Record<string, unknown>;
      }
    } catch {
      return badRequest("Request body must be JSON.");
    }

    const detailRaw = body.detail ?? body.pause_detail ?? body.pauseDetail;
    const detail =
      detailRaw == null
        ? null
        : typeof detailRaw === "string"
          ? detailRaw
          : null;

    const deal = pauseDeal(getDealDraftHttpStore(), dealId, {
      actor: { type: "user", id: auth.user.id },
      detail,
    });

    return Response.json({ deal });
  } catch (err) {
    return dealDraftErrorResponse(err, "Failed to pause deal.");
  }
}
