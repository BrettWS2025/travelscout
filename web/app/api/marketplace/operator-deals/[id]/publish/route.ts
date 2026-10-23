/**
 * POST /api/marketplace/operator-deals/:id/publish
 * Publish / schedule / submit for review (Chunk 17). Requires inventory.write.
 *
 * Body: { attest: true } required for manual deals.
 */

import { badRequest } from "@/lib/marketplace/auth";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
  requirePermissionForDeal,
} from "@/lib/marketplace/deal-draft-http";
import { publishDeal } from "@/lib/marketplace/deal-publish";

export const runtime = "nodejs";

type Params = { params: { id: string } };

export async function POST(req: Request, { params }: Params) {
  try {
    const dealId = params.id;
    if (!dealId) return badRequest("Deal id is required.");

    const auth = await requirePermissionForDeal(req, dealId, "inventory.write");
    if (!auth.ok) return auth.response;

    let body: Record<string, unknown> = {};
    try {
      const text = await req.text();
      if (text.trim()) {
        body = JSON.parse(text) as Record<string, unknown>;
      }
    } catch {
      return badRequest("Request body must be JSON.");
    }

    const attestRaw = body.attest;
    const attest =
      attestRaw === true || attestRaw === "true"
        ? true
        : attestRaw === false || attestRaw === "false"
          ? false
          : undefined;

    const result = await publishDeal(getDealDraftHttpStore(), dealId, {
      actor: { type: "user", id: auth.user.id },
      attest,
    });

    return Response.json({
      deal: result.deal,
      validation: result.validation,
      publish_button: result.publish_button,
      target_status: result.target_status,
      attestation: result.attestation,
      link_check: result.link_check
        ? {
            booking_check: result.link_check.bookingCheck,
            auto_paused: result.link_check.autoPaused,
            auto_resumed: result.link_check.autoResumed,
          }
        : null,
    });
  } catch (err) {
    return dealDraftErrorResponse(err, "Failed to publish deal.");
  }
}
