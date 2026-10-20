/**
 * POST /api/marketplace/operator-deals/:id/test-link
 * Returns the final tracked booking URL and a live reachability check (Chunk 15).
 * Requires inventory.write.
 */

import { badRequest } from "@/lib/marketplace/auth";
import {
  BookingLinkError,
  testDealLink,
} from "@/lib/marketplace/booking-link";
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

    const result = await testDealLink(getDealDraftHttpStore(), dealId, {
      actor: { type: "user", id: auth.user.id },
    });

    return Response.json({
      url: result.url,
      tracked: result.tracked,
      click_id: result.clickId,
      check: {
        ok: result.check.ok,
        status: result.check.status,
        error: result.check.error,
      },
    });
  } catch (err) {
    if (err instanceof BookingLinkError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    return dealDraftErrorResponse(err, "Failed to test booking link.");
  }
}
