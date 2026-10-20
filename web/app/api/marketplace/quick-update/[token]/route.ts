/**
 * GET|POST /api/marketplace/quick-update/:token
 *
 * No login. Signed single-use token from attestation reminder (Chunk 20).
 * GET → list live / auto_paused(attestation_expired) manual deals + seats.
 * POST → { deals: [{ deal_id, action: still_available|sold_out, seats_by_session }] }
 */

import { badRequest } from "@/lib/marketplace/auth";
import {
  getQuickUpdateByToken,
  parseQuickUpdateSubmissions,
  submitQuickUpdate,
} from "@/lib/marketplace/deal-attestation";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";

export const runtime = "nodejs";

type Params = { params: { token: string } };

function decodeTokenParam(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const token = decodeTokenParam(params.token ?? "");
    if (!token) return badRequest("Token is required.");

    const result = getQuickUpdateByToken(getDealDraftHttpStore(), token);
    return Response.json(result);
  } catch (err) {
    return dealDraftErrorResponse(err, "Failed to load quick-update.");
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const token = decodeTokenParam(params.token ?? "");
    if (!token) return badRequest("Token is required.");

    let body: Record<string, unknown> = {};
    try {
      const text = await req.text();
      if (text.trim()) {
        body = JSON.parse(text) as Record<string, unknown>;
      }
    } catch {
      return badRequest("Request body must be JSON.");
    }

    const submissions = parseQuickUpdateSubmissions(body);
    const result = await submitQuickUpdate(
      getDealDraftHttpStore(),
      token,
      submissions
    );

    return Response.json({
      token: {
        id: result.token.id,
        operator_id: result.token.operatorId,
        expires_at: result.token.expiresAt,
        used_at: result.token.usedAt,
      },
      results: result.results,
    });
  } catch (err) {
    return dealDraftErrorResponse(err, "Failed to submit quick-update.");
  }
}
