/**
 * POST /api/marketplace/operator-deals/:id/media/import-provider
 * Stub for Chunk 32 (import images from linked ExternalProduct).
 */

import { badRequest } from "@/lib/marketplace/auth";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
  requirePermissionForDeal,
} from "@/lib/marketplace/deal-draft-http";
import { importProviderImages } from "@/lib/marketplace/deal-media-api";

export const runtime = "nodejs";

type Params = { params: { id: string } };

export async function POST(req: Request, { params }: Params) {
  try {
    const dealId = params.id;
    if (!dealId) return badRequest("Deal id is required.");

    const auth = await requirePermissionForDeal(req, dealId, "inventory.write");
    if (!auth.ok) return auth.response;

    const result = await importProviderImages(
      getDealDraftHttpStore(),
      dealId,
      { actor: { type: "user", id: auth.user.id } }
    );

    return Response.json(result);
  } catch (err) {
    return dealDraftErrorResponse(err, "Failed to import provider images.");
  }
}
