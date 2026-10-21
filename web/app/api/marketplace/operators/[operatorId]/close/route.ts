/**
 * POST /api/marketplace/operators/:operatorId/close
 * Chunk 42 — close operator account (owner only).
 * Body: { confirm_text } must match trading_name.
 * Ends live/scheduled deals, disconnects integrations, suspends account.
 */

import { badRequest, unauthorized } from "@/lib/marketplace/auth";
import { closeOperatorAccount } from "@/lib/marketplace/account";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import { isUserRole } from "@/lib/marketplace/enums";
import { requirePermission } from "@/lib/marketplace/permissions";

export const runtime = "nodejs";

type Params = { params: { operatorId: string } };

export async function POST(req: Request, { params }: Params) {
  try {
    const operatorId = params.operatorId;
    if (!operatorId) return badRequest("operatorId is required.");

    const auth = await requirePermission(req, operatorId, "settings.account");
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

    if (!auth.role || !isUserRole(auth.role)) {
      return unauthorized();
    }

    const result = await closeOperatorAccount(
      getDealDraftHttpStore(),
      operatorId,
      {
        confirmText: body.confirm_text ?? body.confirmText,
        actor: { type: "user", id: auth.user.id },
      }
    );
    return Response.json({ closed: result });
  } catch (err) {
    if (err instanceof Error && err.message === "Authentication required.") {
      return unauthorized();
    }
    return dealDraftErrorResponse(err, "Failed to close account.");
  }
}
