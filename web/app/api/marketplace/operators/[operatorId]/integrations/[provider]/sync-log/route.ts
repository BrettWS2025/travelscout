/**
 * GET .../integrations/:provider/sync-log
 * Filter by status / sync_type. Includes readable error and affected deals.
 */

import { badRequest, unauthorized } from "@/lib/marketplace/auth";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import { isSyncType } from "@/lib/marketplace/enums";
import { isSyncLogStatus } from "@/lib/marketplace/integration";
import { listSyncLogs } from "@/lib/marketplace/integration-sync";
import { requirePermission } from "@/lib/marketplace/permissions";

export const runtime = "nodejs";

type Params = { params: { operatorId: string; provider: string } };

export async function GET(req: Request, { params }: Params) {
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

    const url = new URL(req.url);
    const statusRaw = url.searchParams.get("status");
    const typeRaw =
      url.searchParams.get("sync_type") ?? url.searchParams.get("type");
    const limitRaw = url.searchParams.get("limit");

    const status =
      statusRaw && isSyncLogStatus(statusRaw) ? statusRaw : undefined;
    const sync_type = typeRaw && isSyncType(typeRaw) ? typeRaw : undefined;
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;

    const logs = listSyncLogs(
      getDealDraftHttpStore(),
      operatorId,
      provider,
      {
        status,
        sync_type,
        limit: Number.isFinite(limit) ? limit : undefined,
      }
    );

    return Response.json({ sync_logs: logs }, { status: 200 });
  } catch (err) {
    if (err instanceof Error && err.message === "Authentication required.") {
      return unauthorized();
    }
    return dealDraftErrorResponse(err, "Failed to list sync logs.");
  }
}
