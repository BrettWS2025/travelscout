/**
 * POST /api/marketplace/operators/:operatorId/integrations/:provider/resync
 * Manual full catalogue sync (Chunk 28). Requires settings.integrations.
 */

import { badRequest, unauthorized } from "@/lib/marketplace/auth";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import { serializeSyncLog } from "@/lib/marketplace/integration-connect";
import { resyncIntegration } from "@/lib/marketplace/integration-sync";
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

    const result = await resyncIntegration(
      getDealDraftHttpStore(),
      operatorId,
      provider,
      { actor: { type: "user", id: auth.user.id } }
    );

    return Response.json(
      {
        sync_log: serializeSyncLog(result.sync_log),
        items_processed: result.items_processed,
        affected_deal_ids: result.affected_deal_ids,
        resumed_deal_ids: result.resumed_deal_ids,
      },
      { status: 200 }
    );
  } catch (err) {
    if (err instanceof Error && err.message === "Authentication required.") {
      return unauthorized();
    }
    return dealDraftErrorResponse(err, "Failed to resync integration.");
  }
}
