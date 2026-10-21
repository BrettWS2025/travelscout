/**
 * GET|PATCH /api/marketplace/operators/:operatorId/billing
 * Chunk 42 — billing plan, invoices, usage; PATCH billing_email only.
 * Permission: settings.billing (owner only)
 */

import { badRequest, unauthorized } from "@/lib/marketplace/auth";
import {
  getOperatorBilling,
  patchBillingEmail,
} from "@/lib/marketplace/billing";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import { requirePermission } from "@/lib/marketplace/permissions";

export const runtime = "nodejs";

type Params = { params: { operatorId: string } };

export async function GET(req: Request, { params }: Params) {
  try {
    const operatorId = params.operatorId;
    if (!operatorId) return badRequest("operatorId is required.");

    const auth = await requirePermission(req, operatorId, "settings.billing");
    if (!auth.ok) return auth.response;

    const billing = getOperatorBilling(getDealDraftHttpStore(), operatorId);
    return Response.json({ billing });
  } catch (err) {
    if (err instanceof Error && err.message === "Authentication required.") {
      return unauthorized();
    }
    return dealDraftErrorResponse(err, "Failed to load billing.");
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const operatorId = params.operatorId;
    if (!operatorId) return badRequest("operatorId is required.");

    const auth = await requirePermission(req, operatorId, "settings.billing");
    if (!auth.ok) return auth.response;

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return badRequest("Invalid JSON body.");
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return badRequest("Body must be an object.");
    }

    const billing = patchBillingEmail(
      getDealDraftHttpStore(),
      operatorId,
      { billing_email: body.billing_email }
    );
    return Response.json({ billing });
  } catch (err) {
    if (err instanceof Error && err.message === "Authentication required.") {
      return unauthorized();
    }
    return dealDraftErrorResponse(err, "Failed to update billing.");
  }
}
