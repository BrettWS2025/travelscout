/**
 * GET /api/marketplace/operators/:operatorId/integrations
 * Provider cards: status, account name, last_successful_sync_at, available (Chunk 27).
 * Requires settings.integrations.
 */

import { badRequest, unauthorized } from "@/lib/marketplace/auth";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import { listIntegrationCards } from "@/lib/marketplace/integration-connect";
import { requirePermission } from "@/lib/marketplace/permissions";

export const runtime = "nodejs";

type Params = { params: { operatorId: string } };

export async function GET(req: Request, { params }: Params) {
  try {
    const operatorId = params.operatorId;
    if (!operatorId) return badRequest("operatorId is required.");

    const auth = await requirePermission(
      req,
      operatorId,
      "settings.integrations"
    );
    if (!auth.ok) return auth.response;

    const integrations = listIntegrationCards(
      getDealDraftHttpStore(),
      operatorId
    );

    return Response.json({ integrations });
  } catch (err) {
    if (err instanceof Error && err.message === "Authentication required.") {
      return unauthorized();
    }
    return dealDraftErrorResponse(err, "Failed to list integrations.");
  }
}
