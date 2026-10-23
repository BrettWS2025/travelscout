/**
 * POST /api/marketplace/webhooks/providers/:provider
 * Provider webhook: verify signature (webhook_secret_ref), bump
 * webhook_last_received_at, run incremental sync for affected products.
 * Security S12: missing webhook secret → 401 (unsigned webhooks rejected).
 */

import { badRequest } from "@/lib/marketplace/auth";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import { serializeSyncLog } from "@/lib/marketplace/integration-connect";
import { handleIntegrationWebhook } from "@/lib/marketplace/integration-sync";
import { isIntegrationProvider } from "@/lib/marketplace/enums";

export const runtime = "nodejs";

type Params = { params: { provider: string } };

export async function POST(req: Request, { params }: Params) {
  try {
    const { provider } = params;
    if (!provider || !isIntegrationProvider(provider)) {
      return badRequest("Unknown provider.");
    }

    let body: unknown = null;
    const text = await req.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }

    const result = await handleIntegrationWebhook(
      getDealDraftHttpStore(),
      provider,
      { headers: req.headers, body }
    );

    return Response.json(
      {
        ok: result.ok,
        events: result.events,
        sync_log: result.sync
          ? serializeSyncLog(result.sync.sync_log)
          : null,
      },
      { status: result.ok ? 200 : 502 }
    );
  } catch (err) {
    return dealDraftErrorResponse(err, "Webhook handling failed.");
  }
}
