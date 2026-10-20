/**
 * POST /api/marketplace/operator-deals/:id/seats
 * Update manual seats by session id. Requires inventory.write. Manual deals only.
 *
 * Body: { "<session_id>": <seats>, ... } or { seats: { ... } }
 */

import { badRequest } from "@/lib/marketplace/auth";
import {
  normalizeSeatsBody,
  updateDealSeats,
} from "@/lib/marketplace/deal-actions";
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

    const seats = normalizeSeatsBody(body);
    const result = updateDealSeats(getDealDraftHttpStore(), dealId, {
      actor: { type: "user", id: auth.user.id },
      seats,
    });

    return Response.json({
      deal: result.deal,
      sessions: result.sessions,
    });
  } catch (err) {
    return dealDraftErrorResponse(err, "Failed to update seats.");
  }
}
