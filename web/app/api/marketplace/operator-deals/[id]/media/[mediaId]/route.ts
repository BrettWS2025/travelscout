/**
 * PATCH / DELETE /api/marketplace/operator-deals/:id/media/:mediaId
 * Update alt/caption/focal (and optional set_cover) or delete (Chunk 14).
 */

import { badRequest } from "@/lib/marketplace/auth";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import {
  patchDealMedia,
  removeDealMedia,
} from "@/lib/marketplace/deal-media-api";
import { getMediaStorage } from "@/lib/marketplace/media-storage";
import { DealNotFoundError } from "@/lib/marketplace/deal-status";
import { requirePermission } from "@/lib/marketplace/permissions";

export const runtime = "nodejs";

type Params = { params: { id: string; mediaId: string } };

async function loadDealOperatorId(dealId: string): Promise<string> {
  const store = getDealDraftHttpStore();
  const deal = store.deals.get(dealId);
  if (!deal) throw new DealNotFoundError(dealId);
  return deal.operatorId;
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const dealId = params.id;
    const mediaId = params.mediaId;
    if (!dealId || !mediaId) return badRequest("Deal id and media id are required.");

    const operatorId = await loadDealOperatorId(dealId);
    const auth = await requirePermission(req, operatorId, "inventory.write");
    if (!auth.ok) return auth.response;

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return badRequest("Request body must be JSON.");
    }

    const media = await patchDealMedia(
      getDealDraftHttpStore(),
      dealId,
      mediaId,
      body,
      { actor: { type: "user", id: auth.user.id } }
    );

    return Response.json({ media });
  } catch (err) {
    return dealDraftErrorResponse(err, "Failed to update media.");
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const dealId = params.id;
    const mediaId = params.mediaId;
    if (!dealId || !mediaId) return badRequest("Deal id and media id are required.");

    const operatorId = await loadDealOperatorId(dealId);
    const auth = await requirePermission(req, operatorId, "inventory.write");
    if (!auth.ok) return auth.response;

    const result = await removeDealMedia(
      getDealDraftHttpStore(),
      dealId,
      mediaId,
      {
        actor: { type: "user", id: auth.user.id },
        storage: getMediaStorage(),
      }
    );

    return Response.json({
      ok: true,
      deleted_id: result.deleted.id,
      new_cover: result.newCover,
    });
  } catch (err) {
    return dealDraftErrorResponse(err, "Failed to delete media.");
  }
}
