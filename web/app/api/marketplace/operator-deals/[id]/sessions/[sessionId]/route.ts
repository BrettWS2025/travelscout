/**
 * PATCH / DELETE /api/marketplace/operator-deals/:id/sessions/:sessionId
 * Manual session / open-window day updates (Chunk 13). inventory.write.
 */

import { badRequest } from "@/lib/marketplace/auth";
import {
  deleteDealSession,
  updateDealSession,
} from "@/lib/marketplace/deal-inventory";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
  requirePermissionForDeal,
} from "@/lib/marketplace/deal-draft-http";

export const runtime = "nodejs";

type Params = { params: { id: string; sessionId: string } };


export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id: dealId, sessionId } = params;
    if (!dealId || !sessionId) return badRequest("Deal id and session id are required.");

    const auth = await requirePermissionForDeal(req, dealId, "inventory.write");
    if (!auth.ok) return auth.response;

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return badRequest("Request body must be JSON.");
    }

    const result = await updateDealSession(
      getDealDraftHttpStore(),
      dealId,
      sessionId,
      body,
      {
        actor: { type: "user", id: auth.user.id },
        confirm: body.confirm === true,
      }
    );

    return Response.json({
      session: result.session,
      validation: result.validation,
    });
  } catch (err) {
    return dealDraftErrorResponse(err, "Failed to update session.");
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const { id: dealId, sessionId } = params;
    if (!dealId || !sessionId) return badRequest("Deal id and session id are required.");

    const auth = await requirePermissionForDeal(req, dealId, "inventory.write");
    if (!auth.ok) return auth.response;

    let confirm = false;
    try {
      const url = new URL(req.url);
      if (url.searchParams.get("confirm") === "true") confirm = true;
      const body = await req.json().catch(() => null);
      if (body && typeof body === "object" && (body as { confirm?: unknown }).confirm === true) {
        confirm = true;
      }
    } catch {
      // no body is fine for DELETE
    }

    const result = await deleteDealSession(
      getDealDraftHttpStore(),
      dealId,
      sessionId,
      {
        actor: { type: "user", id: auth.user.id },
        confirm,
      }
    );

    return Response.json({ ok: true, validation: result.validation });
  } catch (err) {
    return dealDraftErrorResponse(err, "Failed to delete session.");
  }
}
