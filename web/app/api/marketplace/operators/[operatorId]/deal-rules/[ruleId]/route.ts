/**
 * GET|PATCH|DELETE /api/marketplace/operators/:operatorId/deal-rules/:ruleId
 * Chunk 44 — get / update / delete an auto-deal rule.
 */

import { badRequest, unauthorized } from "@/lib/marketplace/auth";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import {
  deleteDealRule,
  getDealRule,
  serializeDealRule,
  updateDealRule,
} from "@/lib/marketplace/deal-rules";
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

    const rule = getDealRule(getDealDraftHttpStore(), ruleId, operatorId);
    return Response.json({ rule: serializeDealRule(rule) });
  } catch (err) {
    if (err instanceof Error && err.message === "Authentication required.") {
      return unauthorized();
    }
    return dealDraftErrorResponse(err, "Failed to get deal rule.");
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { operatorId, ruleId } = params;
    if (!operatorId || !ruleId) {
      return badRequest("operatorId and ruleId are required.");
    }

    const auth = await requirePermission(req, operatorId, "inventory.write");
    if (!auth.ok) return auth.response;

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return badRequest("Invalid JSON body.");
    }

    const rule = updateDealRule(
      getDealDraftHttpStore(),
      operatorId,
      ruleId,
      body,
      { now: new Date().toISOString() }
    );
    return Response.json({ rule: serializeDealRule(rule) });
  } catch (err) {
    if (err instanceof Error && err.message === "Authentication required.") {
      return unauthorized();
    }
    return dealDraftErrorResponse(err, "Failed to update deal rule.");
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const { operatorId, ruleId } = params;
    if (!operatorId || !ruleId) {
      return badRequest("operatorId and ruleId are required.");
    }

    const auth = await requirePermission(req, operatorId, "inventory.write");
    if (!auth.ok) return auth.response;

    deleteDealRule(getDealDraftHttpStore(), operatorId, ruleId);
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === "Authentication required.") {
      return unauthorized();
    }
    return dealDraftErrorResponse(err, "Failed to delete deal rule.");
  }
}
