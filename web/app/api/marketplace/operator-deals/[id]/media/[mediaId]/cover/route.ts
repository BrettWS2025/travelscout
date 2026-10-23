/**
 * POST /api/marketplace/operator-deals/:id/media/:mediaId/cover
 * Set this image as the deal cover (Chunk 14). inventory.write.
 */

import { badRequest } from "@/lib/marketplace/auth";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
  requirePermissionForDeal,
} from "@/lib/marketplace/deal-draft-http";
import { setCoverMedia } from "@/lib/marketplace/deal-media-api";

export const runtime = "nodejs";

type Params = { params: { id: string; mediaId: string } };


export async function POST(req: Request, { params }: Params) {
  try {
    const dealId = params.id;
    const mediaId = params.mediaId;
    if (!dealId || !mediaId) {
      return badRequest("Deal id and media id are required.");
    }

    const auth = await requirePermissionForDeal(req, dealId, "inventory.write");
    if (!auth.ok) return auth.response;

    const media = await setCoverMedia(
      getDealDraftHttpStore(),
      dealId,
      mediaId,
      { actor: { type: "user", id: auth.user.id } }
    );

    return Response.json({ media });
  } catch (err) {
    return dealDraftErrorResponse(err, "Failed to set cover.");
  }
}
