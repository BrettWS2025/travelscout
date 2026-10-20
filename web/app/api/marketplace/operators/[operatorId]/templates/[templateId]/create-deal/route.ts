/**
 * POST /api/marketplace/operators/:operatorId/templates/:templateId/create-deal
 * Create a new draft from a DealTemplate payload (Chunk 25).
 * Requires inventory.write. Never copies sessions.
 */

import { badRequest, unauthorized } from "@/lib/marketplace/auth";
import { createDealFromTemplate } from "@/lib/marketplace/deal-draft";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import { isDealType } from "@/lib/marketplace/enums";
import { requirePermission } from "@/lib/marketplace/permissions";

export const runtime = "nodejs";

type Params = { params: { operatorId: string; templateId: string } };

export async function POST(req: Request, { params }: Params) {
  try {
    const { operatorId, templateId } = params;
    if (!operatorId || !templateId) {
      return badRequest("operatorId and templateId are required.");
    }

    const auth = await requirePermission(req, operatorId, "inventory.write");
    if (!auth.ok) return auth.response;

    let body: Record<string, unknown> = {};
    try {
      const text = await req.text();
      if (text) body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return badRequest("Request body must be JSON.");
    }

    const dealTypeRaw = body.deal_type ?? body.dealType;
    const dealType =
      dealTypeRaw == null
        ? null
        : isDealType(dealTypeRaw)
          ? dealTypeRaw
          : null;
    if (dealTypeRaw != null && dealType == null) {
      return badRequest("deal_type is invalid.");
    }

    const deal = createDealFromTemplate(
      getDealDraftHttpStore(),
      operatorId,
      templateId,
      {
        actor: { type: "user", id: auth.user.id },
        dealType,
      }
    );

    return Response.json({ deal }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "Authentication required.") {
      return unauthorized();
    }
    return dealDraftErrorResponse(err, "Failed to create deal from template.");
  }
}
