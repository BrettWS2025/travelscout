/**
 * GET /api/marketplace/operators/:operatorId/deals/calendar?from=YYYY-MM-DD
 * 3 local days of sessions grouped by day (Chunk 21). Requires inventory.read.
 */

import { badRequest, unauthorized } from "@/lib/marketplace/auth";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import { getOperatorDealsCalendar } from "@/lib/marketplace/deal-list";
import { requirePermission } from "@/lib/marketplace/permissions";

export const runtime = "nodejs";

type Params = { params: { operatorId: string } };

export async function GET(req: Request, { params }: Params) {
  try {
    const operatorId = params.operatorId;
    if (!operatorId) return badRequest("operatorId is required.");

    const auth = await requirePermission(req, operatorId, "inventory.read");
    if (!auth.ok) return auth.response;

    const url = new URL(req.url);
    const from = url.searchParams.get("from");

    const result = getOperatorDealsCalendar(
      getDealDraftHttpStore(),
      operatorId,
      { from }
    );

    return Response.json(result);
  } catch (err) {
    if (
      err instanceof Error &&
      err.message === "Authentication required."
    ) {
      return unauthorized();
    }
    return dealDraftErrorResponse(err, "Failed to load deals calendar.");
  }
}
