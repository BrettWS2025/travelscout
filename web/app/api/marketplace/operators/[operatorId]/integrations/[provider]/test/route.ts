/**
 * POST /api/marketplace/operators/:operatorId/integrations/:provider/test
 * adapter.testConnection (Chunk 27). Requires settings.integrations.
 */

import { badRequest, unauthorized } from "@/lib/marketplace/auth";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import { testIntegrationConnection } from "@/lib/marketplace/integration-connect";
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

    const result = await testIntegrationConnection(
      getDealDraftHttpStore(),
      operatorId,
      provider
    );

    return Response.json(result);
  } catch (err) {
    if (err instanceof Error && err.message === "Authentication required.") {
      return unauthorized();
    }
    return dealDraftErrorResponse(err, "Failed to test integration.");
  }
}
