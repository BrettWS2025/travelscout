/**
 * PATCH / DELETE /api/marketplace/operator-deals/:id/discount-steps/:stepId
 * Stepped discount updates (Chunk 43). inventory.write.
 */

import { badRequest } from "@/lib/marketplace/auth";
import {
  deleteDiscountStep,
  updateDiscountStep,
} from "@/lib/marketplace/deal-stepped-discounts";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
  requirePermissionForDeal,
} from "@/lib/marketplace/deal-draft-http";

export const runtime = "nodejs";

type Params = { params: { id: string; stepId: string } };


export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id: dealId, stepId } = params;
    if (!dealId || !stepId) {
      return badRequest("Deal id and discount step id are required.");
    }

    const auth = await requirePermissionForDeal(req, dealId, "inventory.write");
    if (!auth.ok) return auth.response;

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return badRequest("Request body must be JSON.");
    }

    const result = await updateDiscountStep(
      getDealDraftHttpStore(),
      dealId,
      stepId,
      body,
      {
        actor: { type: "user", id: auth.user.id },
        confirm: body.confirm === true,
      }
    );

    return Response.json({
      discount_step: result.step,
      validation: result.validation,
    });
  } catch (err) {
    return dealDraftErrorResponse(err, "Failed to update discount step.");
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const { id: dealId, stepId } = params;
    if (!dealId || !stepId) {
      return badRequest("Deal id and discount step id are required.");
    }

    const auth = await requirePermissionForDeal(req, dealId, "inventory.write");
    if (!auth.ok) return auth.response;

    let confirm = false;
    try {
      const url = new URL(req.url);
      if (url.searchParams.get("confirm") === "true") confirm = true;
      const body = await req.json().catch(() => null);
      if (
        body &&
        typeof body === "object" &&
        (body as { confirm?: unknown }).confirm === true
      ) {
        confirm = true;
      }
    } catch {
      // no body is fine for DELETE
    }

    const result = await deleteDiscountStep(
      getDealDraftHttpStore(),
      dealId,
      stepId,
      {
        actor: { type: "user", id: auth.user.id },
        confirm,
      }
    );

    return Response.json({ ok: true, validation: result.validation });
  } catch (err) {
    return dealDraftErrorResponse(err, "Failed to delete discount step.");
  }
}
