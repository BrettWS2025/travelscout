/**
 * GET /api/marketplace/operator-deals/:id/stats?from=&to=
 *
 * Inventory deal stats (Chunk 45). Requires inventory.read.
 * from/to = local YYYY-MM-DD in the operator timezone (defaults last 7 days).
 */

import { badRequest } from "@/lib/marketplace/auth";
import {
  DealMetricsError,
  defaultStatsRange,
  getDealStats,
} from "@/lib/marketplace/deal-metrics";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import { DealNotFoundError } from "@/lib/marketplace/deal-status";
import { requirePermission } from "@/lib/marketplace/permissions";
import { localDateKey } from "@/lib/marketplace/timezone";

export const runtime = "nodejs";

type Params = { params: { id: string } };

export async function GET(req: Request, { params }: Params) {
  try {
    const dealId = params.id;
    if (!dealId) return badRequest("Deal id is required.");

    const store = getDealDraftHttpStore();
    const deal = store.deals.get(dealId);
    if (!deal) throw new DealNotFoundError(dealId);

    const auth = await requirePermission(
      req,
      deal.operatorId,
      "inventory.read"
    );
    if (!auth.ok) return auth.response;

    const url = new URL(req.url);
    const operator = store.operators.operators.get(deal.operatorId);
    const timeZone = operator?.timezone || "Pacific/Auckland";
    const defaults = defaultStatsRange(new Date().toISOString(), timeZone);

    const from = url.searchParams.get("from")?.trim() || defaults.from;
    const to = url.searchParams.get("to")?.trim() || defaults.to;

    // Touch localDateKey so timezone stays consistent if caller omits dates.
    void localDateKey(new Date().toISOString(), timeZone);

    const stats = getDealStats(store, dealId, { from, to });
    return Response.json(stats);
  } catch (err) {
    if (err instanceof DealMetricsError) {
      return Response.json(
        { error: err.message, ...(err.code ? { code: err.code } : {}) },
        { status: err.status }
      );
    }
    return dealDraftErrorResponse(err, "Failed to load deal stats.");
  }
}
