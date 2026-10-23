/**
 * GET / PATCH / DELETE /api/marketplace/operator-deals/:id
 * Inventory Deal draft API (Chunk 12). Distinct from legacy /api/marketplace/deals.
 *
 * GET  → inventory.read
 * PATCH / DELETE → inventory.write
 */

import { badRequest } from "@/lib/marketplace/auth";
import {
  deleteDraftDeal,
  getDealDetail,
  updateDraftDeal,
} from "@/lib/marketplace/deal-draft";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
  requirePermissionForDeal,
} from "@/lib/marketplace/deal-draft-http";

export const runtime = "nodejs";

type Params = { params: { id: string } };

export async function GET(req: Request, { params }: Params) {
  try {
    const dealId = params.id;
    if (!dealId) return badRequest("Deal id is required.");

    const auth = await requirePermissionForDeal(req, dealId, "inventory.read");
    if (!auth.ok) return auth.response;

    const detail = await getDealDetail(getDealDraftHttpStore(), dealId);
    return Response.json(detail);
  } catch (err) {
    return dealDraftErrorResponse(err, "Failed to get deal.");
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const dealId = params.id;
    if (!dealId) return badRequest("Deal id is required.");

    const auth = await requirePermissionForDeal(req, dealId, "inventory.write");
    if (!auth.ok) return auth.response;

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return badRequest("Request body must be JSON.");
    }
    if (!body || typeof body !== "object") {
      return badRequest("Request body is required.");
    }

    const deal = updateDraftDeal(getDealDraftHttpStore(), dealId, body, {
      actor: { type: "user", id: auth.user.id },
    });
    return Response.json({ deal });
  } catch (err) {
    return dealDraftErrorResponse(err, "Failed to update deal.");
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const dealId = params.id;
    if (!dealId) return badRequest("Deal id is required.");

    const auth = await requirePermissionForDeal(req, dealId, "inventory.write");
    if (!auth.ok) return auth.response;

    deleteDraftDeal(getDealDraftHttpStore(), dealId);
    return Response.json({ ok: true });
  } catch (err) {
    return dealDraftErrorResponse(err, "Failed to delete deal.");
  }
}
