/**
 * POST /api/marketplace/operator-deals/:id/attest
 * Dashboard reattest for a manual deal. Requires inventory.write.
 *
 * Body: { seats_by_session?: { [sessionId]: number } }
 */

import { badRequest } from "@/lib/marketplace/auth";
import { attestDeal } from "@/lib/marketplace/deal-attestation";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import { DealNotFoundError } from "@/lib/marketplace/deal-status";
import { requirePermission } from "@/lib/marketplace/permissions";

export const runtime = "nodejs";

type Params = { params: { id: string } };

async function loadDealOperatorId(dealId: string): Promise<string> {
  const store = getDealDraftHttpStore();
  const deal = store.deals.get(dealId);
  if (!deal) throw new DealNotFoundError(dealId);
  return deal.operatorId;
}

function parseSeatsBySession(
  body: Record<string, unknown>
): Record<string, number> | undefined {
  const raw = body.seats_by_session ?? body.seatsBySession;
  if (raw == null) return undefined;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("seats_by_session must be an object map");
  }
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const n =
      typeof value === "number"
        ? value
        : typeof value === "string" && value.trim() !== ""
          ? Number(value)
          : NaN;
    if (!Number.isInteger(n) || n < 0 || n > 999) {
      throw new Error(
        `Invalid seats for session ${key}: must be an integer 0–999`
      );
    }
    out[key] = n;
  }
  return out;
}

export async function POST(req: Request, { params }: Params) {
  try {
    const dealId = params.id;
    if (!dealId) return badRequest("Deal id is required.");

    const operatorId = await loadDealOperatorId(dealId);
    const auth = await requirePermission(req, operatorId, "inventory.write");
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

    let seatsBySession: Record<string, number> | undefined;
    try {
      seatsBySession = parseSeatsBySession(body);
    } catch (err) {
      return badRequest(err instanceof Error ? err.message : "Invalid seats");
    }

    const result = await attestDeal(getDealDraftHttpStore(), dealId, {
      actor: { type: "user", id: auth.user.id },
      seatsBySession,
    });

    return Response.json({
      deal: result.deal,
      attestation: result.attestation,
      sessions: result.sessions,
    });
  } catch (err) {
    return dealDraftErrorResponse(err, "Failed to attest deal.");
  }
}
