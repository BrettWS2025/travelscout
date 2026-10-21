/**
 * POST .../integrations/:provider/test-booking-link
 * Reachability check for booking_base_url (Chunk 37 Settings → Booking links).
 * Body optional: { url?: string } to test an unsaved draft URL.
 * Requires settings.integrations.
 */

import { badRequest, unauthorized } from "@/lib/marketplace/auth";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import { testIntegrationBookingLink } from "@/lib/marketplace/integration-connect";
import { requirePermission } from "@/lib/marketplace/permissions";

export const runtime = "nodejs";

type Params = { params: { operatorId: string; provider: string } };

export async function POST(req: Request, { params }: Params) {
  try {
    const { operatorId, provider } = params;
    if (!operatorId || !provider) {
      return badRequest("operatorId and provider are required.");
    }

    const auth = await requirePermission(
      req,
      operatorId,
      "settings.integrations"
    );
    if (!auth.ok) return auth.response;

    let body: Record<string, unknown> = {};
    try {
      const text = await req.text();
      if (text) body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return badRequest("Request body must be JSON.");
    }

    const url =
      typeof body.url === "string"
        ? body.url
        : body.booking_base_url != null &&
            typeof body.booking_base_url === "string"
          ? body.booking_base_url
          : null;

    const result = await testIntegrationBookingLink(
      getDealDraftHttpStore(),
      operatorId,
      provider,
      { url }
    );

    return Response.json(result);
  } catch (err) {
    if (err instanceof Error && err.message === "Authentication required.") {
      return unauthorized();
    }
    return dealDraftErrorResponse(err, "Failed to test booking link.");
  }
}
