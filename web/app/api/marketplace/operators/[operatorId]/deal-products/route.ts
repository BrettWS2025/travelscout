/**
 * GET /api/marketplace/operators/:operatorId/deal-products
 * Enabled ExternalProducts from connected integrations for the deal editor
 * product picker (Chunk 32). Requires inventory.read.
 */

import { badRequest, unauthorized } from "@/lib/marketplace/auth";
import { listDealProductsForPicker } from "@/lib/marketplace/deal-draft";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import { requirePermission } from "@/lib/marketplace/permissions";

export const runtime = "nodejs";

type Params = { params: { operatorId: string } };

export async function GET(req: Request, { params }: Params) {
  try {
    const operatorId = params.operatorId;
    if (!operatorId) return badRequest("operatorId is required.");

    const auth = await requirePermission(req, operatorId, "inventory.read");
    if (!auth.ok) return auth.response;

    const products = listDealProductsForPicker(
      getDealDraftHttpStore(),
      operatorId
    );
    const has_connected_integration = products.length > 0 ||
      [...(getDealDraftHttpStore().integrations?.values() ?? [])].some(
        (i) =>
          i.operatorId === operatorId &&
          (i.status === "connected" || i.status === "degraded")
      );

    return Response.json({
      products,
      has_connected_integration,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Authentication required.") {
      return unauthorized();
    }
    return dealDraftErrorResponse(err, "Failed to list deal products.");
  }
}
