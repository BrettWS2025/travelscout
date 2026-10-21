/**
 * GET /api/marketplace/deal-rules/:id/preview
 * Chunk 44 — top-level preview alias (same as operators/.../preview).
 * Requires inventory.read on the rule's operator.
 */

import { badRequest, unauthorized } from "@/lib/marketplace/auth";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import {
  getDealRule,
  previewDealRule,
} from "@/lib/marketplace/deal-rules";
import { requirePermission } from "@/lib/marketplace/permissions";

export const runtime = "nodejs";

type Params = { params: { id: string } };

export async function GET(req: Request, { params }: Params) {
  try {
    const ruleId = params.id;
    if (!ruleId) return badRequest("id is required.");

    const store = getDealDraftHttpStore();
    const rule = getDealRule(store, ruleId);

    const auth = await requirePermission(
      req,
      rule.operatorId,
      "inventory.read"
    );
    if (!auth.ok) return auth.response;

    const preview = previewDealRule(store, ruleId, {
      operatorId: rule.operatorId,
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
