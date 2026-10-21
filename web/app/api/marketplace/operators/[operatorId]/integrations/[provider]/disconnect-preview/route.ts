/**
 * GET /api/marketplace/operators/:operatorId/integrations/:provider/disconnect-preview
 * Count of live/scheduled deals that will be auto-paused (Chunk 27).
 * Requires settings.integrations.
 */

import { badRequest, unauthorized } from "@/lib/marketplace/auth";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import { getDisconnectPreview } from "@/lib/marketplace/integration-connect";
import { requirePermission } from "@/lib/marketplace/permissions";

export const runtime = "nodejs";

type Params = { params: { operatorId: string; provider: string } };

export async function GET(req: Request, { params }: Params) {
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

    const preview = getDisconnectPreview(
      getDealDraftHttpStore(),
      operatorId,
      provider
    );

    return Response.json(preview);
  } catch (err) {
    if (err instanceof Error && err.message === "Authentication required.") {
      return unauthorized();
    }
    return dealDraftErrorResponse(err, "Failed to preview disconnect.");
  }
}
