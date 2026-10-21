/**
 * GET|POST /api/marketplace/operators/:operatorId/deal-rules
 * Chunk 44 — list / create auto-deal rules (inventory.read / inventory.write).
 */

import { badRequest, unauthorized } from "@/lib/marketplace/auth";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import {
  createDealRule,
  listOperatorDealRules,
  serializeDealRule,
} from "@/lib/marketplace/deal-rules";
import { requirePermission } from "@/lib/marketplace/permissions";

export const runtime = "nodejs";

type Params = { params: { operatorId: string } };

export async function GET(req: Request, { params }: Params) {
  try {
    const operatorId = params.operatorId;
    if (!operatorId) return badRequest("operatorId is required.");

    const auth = await requirePermission(req, operatorId, "inventory.read");
    if (!auth.ok) return auth.response;

    const rules = listOperatorDealRules(getDealDraftHttpStore(), operatorId);
    return Response.json({ rules });
  } catch (err) {
    if (err instanceof Error && err.message === "Authentication required.") {
      return unauthorized();
    }
    return dealDraftErrorResponse(err, "Failed to list deal rules.");
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const operatorId = params.operatorId;
    if (!operatorId) return badRequest("operatorId is required.");

    const auth = await requirePermission(req, operatorId, "inventory.write");
    if (!auth.ok) return auth.response;

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return badRequest("Invalid JSON body.");
    }

    const rule = createDealRule(getDealDraftHttpStore(), operatorId, body, {
      now: new Date().toISOString(),
    });

    return Response.json(
      { rule: serializeDealRule(rule) },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof Error && err.message === "Authentication required.") {
      return unauthorized();
    }
    return dealDraftErrorResponse(err, "Failed to create deal rule.");
  }
}
