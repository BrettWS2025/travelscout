/**
 * POST /api/marketplace/operators/:operatorId/deals/bulk
 * Bulk pause | resume | end | mark_sold_out. Requires inventory.write.
 *
 * Body: { action, deal_ids, confirm?, attest? }
 * Pause requires confirm: true. Returns per-deal { id, ok, error? }.
 */

import { badRequest } from "@/lib/marketplace/auth";
import {
  bulkDealActions,
  isBulkDealAction,
} from "@/lib/marketplace/deal-actions";
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

    const auth = await requirePermission(req, operatorId, "inventory.write");
    if (!auth.ok) return auth.response;

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return badRequest("Request body must be JSON.");
    }

    const actionRaw = body.action;
    if (!isBulkDealAction(actionRaw)) {
      return badRequest(
        "action must be pause, resume, end, or mark_sold_out."
      );
    }

    const dealIdsRaw = body.deal_ids ?? body.dealIds;
    if (!Array.isArray(dealIdsRaw) || dealIdsRaw.length === 0) {
      return badRequest("deal_ids must be a non-empty array.");
    }
    const dealIds = dealIdsRaw.map((id) => String(id));

    const confirmRaw = body.confirm;
    const confirm =
      confirmRaw === true || confirmRaw === "true"
        ? true
        : confirmRaw === false || confirmRaw === "false"
          ? false
          : undefined;

    const attestRaw = body.attest;
    const attest =
      attestRaw === true || attestRaw === "true"
        ? true
        : attestRaw === false || attestRaw === "false"
          ? false
          : undefined;

    const result = await bulkDealActions(
      getDealDraftHttpStore(),
      operatorId,
      {
        action: actionRaw,
        dealIds,
        confirm,
        attest,
        actor: { type: "user", id: auth.user.id },
      }
    );

    return Response.json({ results: result.results });
  } catch (err) {
    return dealDraftErrorResponse(err, "Failed to run bulk deal action.");
  }
}
