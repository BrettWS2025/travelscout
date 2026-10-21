/**
 * POST /api/marketplace/deals/:slug/book
 *
 * Public Book now click flow (Chunk 36). Body: { session_id, visitor_id }.
 * No login. Rate-limited by visitor_id / IP.
 *
 * Path param lives under the existing `[id]` segment (Next.js cannot have
 * sibling `[id]` and `[slug]` folders); the value is the deal **slug**.
 */

import { badRequest } from "@/lib/marketplace/auth";
import {
  bookDealNow,
  DealBookNowError,
  parseBookNowInput,
} from "@/lib/marketplace/deal-book-now";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import { getClientIp } from "@/lib/bff-rate-limit";

export const runtime = "nodejs";

type Params = { params: { id: string } };

export async function POST(req: Request, { params }: Params) {
  try {
    const slug = decodeURIComponent(params.id ?? "").trim();
    if (!slug) return badRequest("Deal slug is required.");

    let body: Record<string, unknown> = {};
    try {
      const text = await req.text();
      if (text.trim()) {
        body = JSON.parse(text) as Record<string, unknown>;
      }
    } catch {
      return badRequest("Request body must be JSON.");
    }

    const input = parseBookNowInput(body);
    const result = await bookDealNow(
      getDealDraftHttpStore(),
      slug,
      input,
      { clientIp: getClientIp(req) }
    );

    return Response.json(result);
  } catch (err) {
    if (err instanceof DealBookNowError) {
      const headers: HeadersInit = {};
      if (err.status === 429 && err.retryAfterSec != null) {
        headers["Retry-After"] = String(err.retryAfterSec);
      }
      return Response.json(
        {
          error: err.message,
          ...(err.code ? { code: err.code } : {}),
        },
        { status: err.status, headers }
      );
    }
    return dealDraftErrorResponse(err, "Failed to process Book now.");
  }
}
