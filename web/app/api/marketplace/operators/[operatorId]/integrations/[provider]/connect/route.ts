/**
 * POST /api/marketplace/operators/:operatorId/integrations/:provider/connect
 * Connect (or reconnect) a booking provider. Kicks off a full sync (Chunk 27).
 * Requires settings.integrations. Body: credentials fields (e.g. { api_key }).
 */

import { badRequest, unauthorized } from "@/lib/marketplace/auth";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import {
  connectIntegration,
  serializeSyncLog,
} from "@/lib/marketplace/integration-connect";
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

    const credentials =
      body.credentials &&
      typeof body.credentials === "object" &&
      !Array.isArray(body.credentials)
        ? (body.credentials as Record<string, unknown>)
        : body;

    const result = await connectIntegration(
      getDealDraftHttpStore(),
      operatorId,
      provider,
      credentials,
      { actor: { type: "user", id: auth.user.id } }
    );

    return Response.json(
      {
        integration: result.public,
        sync_log: serializeSyncLog(result.sync_log),
        sync_started: true,
        resumed_deal_ids: result.resumed_deal_ids,
      },
      { status: 200 }
    );
  } catch (err) {
    if (err instanceof Error && err.message === "Authentication required.") {
      return unauthorized();
    }
    return dealDraftErrorResponse(err, "Failed to connect integration.");
  }
}
