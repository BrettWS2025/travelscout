/**
 * GET /api/marketplace/operators/:operatorId/deal-rules/:ruleId/preview
 * Chunk 44 — "this rule would create N deals in the next 72 hours".
 */

import { badRequest, unauthorized } from "@/lib/marketplace/auth";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import { previewDealRule } from "@/lib/marketplace/deal-rules";
import { requirePermission } from "@/lib/marketplace/permissions";

export const runtime = "nodejs";

type Params = { params: { operatorId: string; ruleId: string } };

export async function GET(req: Request, { params }: Params) {
  try {
    const { operatorId, ruleId } = params;
    if (!operatorId || !ruleId) {
      return badRequest("operatorId and ruleId are required.");
    }

    const auth = await requirePermission(req, operatorId, "inventory.read");
    if (!auth.ok) return auth.response;

    const preview = previewDealRule(getDealDraftHttpStore(), ruleId, {
      operatorId,
      now: new Date().toISOString(),
    });
    return Response.json(preview);
  } catch (err) {
    if (err instanceof Error && err.message === "Authentication required.") {
      return unauthorized();
    }
    return dealDraftErrorResponse(err, "Failed to preview deal rule.");
  }
}
