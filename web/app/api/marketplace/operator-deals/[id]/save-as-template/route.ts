/**
 * POST /api/marketplace/operator-deals/:id/save-as-template
 * Save deal content / media / price options as a DealTemplate (Chunk 25).
 * Requires inventory.write.
 */

import { badRequest } from "@/lib/marketplace/auth";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import { DealNotFoundError } from "@/lib/marketplace/deal-status";
import {
  saveDealAsTemplate,
  serializeDealTemplate,
} from "@/lib/marketplace/deal-templates";
import { requirePermission } from "@/lib/marketplace/permissions";

export const runtime = "nodejs";

type Params = { params: { id: string } };

export async function POST(req: Request, { params }: Params) {
  try {
    const dealId = params.id;
    if (!dealId) return badRequest("Deal id is required.");

    const store = getDealDraftHttpStore();
    const source = store.deals.get(dealId);
    if (!source) throw new DealNotFoundError(dealId);

    const auth = await requirePermission(
      req,
      source.operatorId,
      "inventory.write"
    );
    if (!auth.ok) return auth.response;

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return badRequest("Request body must be JSON.");
    }

    const name =
      typeof body.name === "string"
        ? body.name
        : typeof body.template_name === "string"
          ? body.template_name
          : "";

    const template = saveDealAsTemplate(store, dealId, name, {
      actor: { type: "user", id: auth.user.id },
    });

    return Response.json(
      { template: serializeDealTemplate(template) },
      { status: 201 }
    );
  } catch (err) {
    return dealDraftErrorResponse(err, "Failed to save deal as template.");
  }
}
