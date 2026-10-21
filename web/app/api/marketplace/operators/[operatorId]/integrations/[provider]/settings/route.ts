/**
 * PATCH /api/marketplace/operators/:operatorId/integrations/:provider/settings
 * sync_mode, poll_interval_seconds (clamped), booking destination, conversion
 * tracking, auto_enable_new_products (Chunk 27). Requires settings.integrations.
 */

import { badRequest, unauthorized } from "@/lib/marketplace/auth";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import { updateIntegrationSettings } from "@/lib/marketplace/integration-connect";
import { requirePermission } from "@/lib/marketplace/permissions";

export const runtime = "nodejs";

type Params = { params: { operatorId: string; provider: string } };

export async function PATCH(req: Request, { params }: Params) {
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

    const result = updateIntegrationSettings(
      getDealDraftHttpStore(),
      operatorId,
      provider,
      body
    );

    return Response.json({ integration: result.public });
  } catch (err) {
    if (err instanceof Error && err.message === "Authentication required.") {
      return unauthorized();
    }
    return dealDraftErrorResponse(err, "Failed to update integration settings.");
  }
}
