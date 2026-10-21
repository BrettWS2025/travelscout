/**
 * GET|PATCH /api/marketplace/operators/:operatorId/booking-defaults
 * OperatorBookingDefaults (Chunk 38). Requires settings.defaults.
 * Response includes note: "Changes apply to new deals only".
 * Changing defaults never edits existing deals.
 */

import { badRequest, unauthorized } from "@/lib/marketplace/auth";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import {
  bookingDefaultsResponse,
  getOperatorBookingDefaults,
  updateOperatorBookingDefaults,
} from "@/lib/marketplace/operator-profile";
import { requirePermission } from "@/lib/marketplace/permissions";

export const runtime = "nodejs";

type Params = { params: { operatorId: string } };

export async function GET(req: Request, { params }: Params) {
  try {
    const operatorId = params.operatorId;
    if (!operatorId) return badRequest("operatorId is required.");

    const auth = await requirePermission(
      req,
      operatorId,
      "settings.defaults"
    );
    if (!auth.ok) return auth.response;

    const defaults = getOperatorBookingDefaults(
      getDealDraftHttpStore(),
      operatorId
    );
    return Response.json({ defaults: bookingDefaultsResponse(defaults) });
  } catch (err) {
    if (err instanceof Error && err.message === "Authentication required.") {
      return unauthorized();
    }
    return dealDraftErrorResponse(err, "Failed to load booking defaults.");
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const operatorId = params.operatorId;
    if (!operatorId) return badRequest("operatorId is required.");

    const auth = await requirePermission(
      req,
      operatorId,
      "settings.defaults"
    );
    if (!auth.ok) return auth.response;

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return badRequest("Invalid JSON body.");
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return badRequest("Body must be an object.");
    }

    const defaults = updateOperatorBookingDefaults(
      getDealDraftHttpStore(),
      operatorId,
      body
    );

    return Response.json({ defaults: bookingDefaultsResponse(defaults) });
  } catch (err) {
    if (err instanceof Error && err.message === "Authentication required.") {
      return unauthorized();
    }
    return dealDraftErrorResponse(err, "Failed to update booking defaults.");
  }
}
