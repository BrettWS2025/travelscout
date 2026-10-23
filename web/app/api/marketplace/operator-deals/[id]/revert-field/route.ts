/**
 * POST /api/marketplace/operator-deals/:id/revert-field
 * Restore a content field from the linked ExternalProduct (Chunk 32).
 * Body: { field: "title" | "summary" | … }
 * Requires inventory.write.
 */

import { badRequest } from "@/lib/marketplace/auth";
import { revertDealField } from "@/lib/marketplace/deal-draft";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
  requirePermissionForDeal,
} from "@/lib/marketplace/deal-draft-http";

export const runtime = "nodejs";

type Params = { params: { id: string } };

export async function POST(req: Request, { params }: Params) {
  try {
    const dealId = params.id;
    if (!dealId) return badRequest("Deal id is required.");

    const auth = await requirePermissionForDeal(
      req,
      dealId,
      "inventory.write"
    );
    if (!auth.ok) return auth.response;

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return badRequest("Request body must be JSON.");
    }

    const field = body.field ?? body.Field;
    if (typeof field !== "string" || !field.trim()) {
      return badRequest("field is required.");
    }

    const deal = revertDealField(
      getDealDraftHttpStore(),
      dealId,
      field.trim(),
      {
        actor: { type: "user", id: auth.user.id },
      }
    );
    return Response.json({ deal });
  } catch (err) {
    return dealDraftErrorResponse(err, "Failed to revert field.");
  }
}
