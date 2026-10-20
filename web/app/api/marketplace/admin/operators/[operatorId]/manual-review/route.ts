/**
 * POST /api/marketplace/admin/operators/:operatorId/manual-review
 * Body: { on: true|false } or { on: "on"|"off" } (Chunk 17).
 */

import { badRequest } from "@/lib/marketplace/auth";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import { setManualReviewFlag } from "@/lib/marketplace/deal-publish";
import { requirePermission } from "@/lib/marketplace/permissions";

export const runtime = "nodejs";

type Params = { params: { operatorId: string } };

function parseOnOff(body: Record<string, unknown>): boolean | null {
  const raw = body.on ?? body.enabled ?? body.value;
  if (raw === true || raw === "on" || raw === "true" || raw === 1) return true;
  if (raw === false || raw === "off" || raw === "false" || raw === 0) {
    return false;
  }
  return null;
}

export async function POST(req: Request, { params }: Params) {
  try {
    const operatorId = params.operatorId;
    if (!operatorId) return badRequest("operatorId is required.");

    const auth = await requirePermission(
      req,
      operatorId,
      "admin.operators.manual_review"
    );
    if (!auth.ok) return auth.response;

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return badRequest("Request body must be JSON.");
    }

    const on = parseOnOff(body);
    if (on == null) {
      return badRequest('Body must include on: true|false (or "on"|"off").');
    }

    const store = getDealDraftHttpStore();
    if (!store.operators.operators.has(operatorId)) {
      return badRequest("Operator not found.");
    }

    const operator = setManualReviewFlag(store, operatorId, on);
    return Response.json({
      operator,
      requires_manual_review: operator.requiresManualReview,
    });
  } catch (err) {
    return dealDraftErrorResponse(err, "Failed to set manual review flag.");
  }
}
