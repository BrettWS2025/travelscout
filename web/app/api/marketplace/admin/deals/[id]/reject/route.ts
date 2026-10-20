/**
 * POST /api/marketplace/admin/deals/:id/reject
 * Body: { notes }. Returns deal to draft with pause_detail = notes (Chunk 17).
 */

import { badRequest } from "@/lib/marketplace/auth";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import { rejectDeal } from "@/lib/marketplace/deal-publish";
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
    const auth = await requirePermission(req, operatorId, "admin.deals.reject");
    if (!auth.ok) return auth.response;

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return badRequest("Request body must be JSON.");
    }

    const notesRaw = body.notes ?? body.detail;
    if (typeof notesRaw !== "string") {
      return badRequest("notes is required.");
    }

    const deal = rejectDeal(getDealDraftHttpStore(), dealId, {
      actor: { type: "admin", id: auth.user.id },
      notes: notesRaw,
    });

    return Response.json({ deal });
  } catch (err) {
    return dealDraftErrorResponse(err, "Failed to reject deal.");
  }
}
