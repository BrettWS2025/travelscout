/**
 * POST /api/marketplace/operators/:operatorId/integrations/:provider/disconnect
 * Body: { confirm: true }. Disconnects, deletes secrets, auto-pauses live/scheduled
 * deals with pause_reason integration_disconnected (Chunk 27).
 * Requires settings.integrations.
 */

import { badRequest, unauthorized } from "@/lib/marketplace/auth";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import { disconnectIntegration } from "@/lib/marketplace/integration-connect";
import { requirePermission } from "@/lib/marketplace/permissions";

export const runtime = "nodejs";

type Params = { params: { operatorId: string; provider: string } };

export async function POST(req: Request, { params }: Params) {
  try {
    const { operatorId, provider } = params;
    if (!operatorId || !provider) {
      return badRequest("operatorId and provider are required.");
    }

    const auth = await requirePermission(
      req,
      operatorId,
      "settings.integrations"
    );
    if (!auth.ok) return auth.response;

    let body: Record<string, unknown> = {};
    try {
      const text = await req.text();
      if (text) body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return badRequest("Request body must be JSON.");
    }

    const confirm = body.confirm === true;

    const result = await disconnectIntegration(
      getDealDraftHttpStore(),
      operatorId,
      provider,
      { confirm, actor: { type: "user", id: auth.user.id } }
    );

    return Response.json({
      integration: result.public,
      paused_deal_ids: result.paused_deal_ids,
      paused_count: result.paused_deal_ids.length,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Authentication required.") {
      return unauthorized();
    }
    return dealDraftErrorResponse(err, "Failed to disconnect integration.");
  }
}
