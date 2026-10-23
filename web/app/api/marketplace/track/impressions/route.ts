/**
 * POST /api/marketplace/track/impressions
 *
 * Public (no login): batched deal-card impressions (Chunk 45).
 * Body: { items: [{ deal_id? | slug?, visitor_id? }] }
 * Rate-limited by client IP (security S16).
 */

import { getClientIp } from "@/lib/bff-rate-limit";
import { badRequest } from "@/lib/marketplace/auth";
import {
  DealMetricsError,
  parseImpressionsBody,
  recordImpressions,
} from "@/lib/marketplace/deal-metrics";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import {
  enforcePublicIpRateLimit,
  publicRateLimitedResponse,
} from "@/lib/marketplace/public-rate-limit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const rl = enforcePublicIpRateLimit(
      "trackImpressions",
      getClientIp(req)
    );
    if (!rl.ok) {
      return publicRateLimitedResponse(
        rl.retryAfterSec,
        "Too many impression tracking requests"
      );
    }

    let body: unknown = {};
    try {
      const text = await req.text();
      if (text.trim()) body = JSON.parse(text);
    } catch {
      return badRequest("Request body must be JSON.");
    }

    const input = parseImpressionsBody(body);
    const result = recordImpressions(getDealDraftHttpStore(), input);
    return Response.json(result);
  } catch (err) {
    if (err instanceof DealMetricsError) {
      return Response.json(
        { error: err.message, ...(err.code ? { code: err.code } : {}) },
        { status: err.status }
      );
    }
    return dealDraftErrorResponse(err, "Failed to record impressions.");
  }
}
