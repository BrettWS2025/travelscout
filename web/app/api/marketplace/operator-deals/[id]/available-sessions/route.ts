/**
 * GET  /api/marketplace/operator-deals/:id/available-sessions
 * PUT  /api/marketplace/operator-deals/:id/available-sessions
 *
 * Chunk 34 — list provider sessions in MAX_LEAD_HOURS and select them for
 * integrated deals (capacity_mode / seat_cap optional on PUT).
 *
 * PUT body:
 *   {
 *     external_session_ids: string[],
 *     capacity_mode?: "live_provider" | "live_provider_capped",
 *     seat_cap?: number | null,
 *     session_seat_caps?: Record<string, number | null>,
 *     confirm?: boolean
 *   }
 */

import { badRequest } from "@/lib/marketplace/auth";
import {
  listAvailableSessionsForDeal,
  selectIntegratedSessions,
} from "@/lib/marketplace/deal-integrated-availability";
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

    const result = listAvailableSessionsForDeal(
      getDealDraftHttpStore(),
      dealId
    );

    return Response.json({
      sessions: result.sessions,
      capacity_mode: result.capacity_mode,
      seat_cap: result.seat_cap,
      note: result.note,
      max_lead_hours: result.max_lead_hours,
    });
  } catch (err) {
    return dealDraftErrorResponse(err, "Failed to list available sessions.");
  }
}

export async function PUT(req: Request, { params }: Params) {
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

    const result = await selectIntegratedSessions(
      getDealDraftHttpStore(),
      dealId,
      body,
      {
        actor: { type: "user", id: auth.user.id },
        confirm: body.confirm === true,
      }
    );

    return Response.json({
      deal: result.deal,
      sessions: result.sessions,
      validation: result.validation,
      note: result.note,
    });
  } catch (err) {
    return dealDraftErrorResponse(err, "Failed to select sessions.");
  }
}
