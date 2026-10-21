/**
 * POST /api/marketplace/operators/:operatorId/export
 * Chunk 42 — CSV export of deals, DealMetricDaily, DealEvent.
 * Permission: settings.account (owner only)
 */

import { badRequest, unauthorized } from "@/lib/marketplace/auth";
import { exportOperatorData } from "@/lib/marketplace/account";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import { requirePermission } from "@/lib/marketplace/permissions";

export const runtime = "nodejs";

type Params = { params: { operatorId: string } };

export async function POST(req: Request, { params }: Params) {
  try {
    const operatorId = params.operatorId;
    if (!operatorId) return badRequest("operatorId is required.");

    const auth = await requirePermission(req, operatorId, "settings.account");
    if (!auth.ok) return auth.response;

    const result = exportOperatorData(getDealDraftHttpStore(), operatorId);
    return Response.json(result);
  } catch (err) {
    if (err instanceof Error && err.message === "Authentication required.") {
      return unauthorized();
    }
    return dealDraftErrorResponse(err, "Failed to export operator data.");
  }
}
