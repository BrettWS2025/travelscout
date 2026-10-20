/**
 * GET /api/marketplace/operators/:operatorId/templates
 *   List DealTemplates for the operator (Chunk 25). Requires inventory.read.
 *
 * POST is not used — templates are created via save-as-template on a deal.
 */

import { badRequest, unauthorized } from "@/lib/marketplace/auth";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import {
  listOperatorTemplates,
  serializeDealTemplate,
} from "@/lib/marketplace/deal-templates";
import { requirePermission } from "@/lib/marketplace/permissions";

export const runtime = "nodejs";

type Params = { params: { operatorId: string } };

export async function GET(req: Request, { params }: Params) {
  try {
    const operatorId = params.operatorId;
    if (!operatorId) return badRequest("operatorId is required.");

    const auth = await requirePermission(req, operatorId, "inventory.read");
    if (!auth.ok) return auth.response;

    const templates = listOperatorTemplates(
      getDealDraftHttpStore(),
      operatorId
    ).map(serializeDealTemplate);

    return Response.json({ templates });
  } catch (err) {
    if (err instanceof Error && err.message === "Authentication required.") {
      return unauthorized();
    }
    return dealDraftErrorResponse(err, "Failed to list templates.");
  }
}
