/**
 * POST /api/marketplace/operator-deals/:id/media/video-embed
 * Add a YouTube/Vimeo embed by URL (Chunk 14). inventory.write.
 */

import { badRequest } from "@/lib/marketplace/auth";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
  requirePermissionForDeal,
} from "@/lib/marketplace/deal-draft-http";
import { addDealVideoEmbed } from "@/lib/marketplace/deal-media-api";

export const runtime = "nodejs";

type Params = { params: { id: string } };

export async function POST(req: Request, { params }: Params) {
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

    const media = await addDealVideoEmbed(
      getDealDraftHttpStore(),
      dealId,
      body,
      { actor: { type: "user", id: auth.user.id } }
    );

    return Response.json({ media });
  } catch (err) {
    return dealDraftErrorResponse(err, "Failed to add video embed.");
  }
}
