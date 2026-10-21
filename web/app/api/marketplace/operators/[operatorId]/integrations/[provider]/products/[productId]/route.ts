/**
 * PATCH .../integrations/:provider/products/:productId
 * Body: { is_enabled_for_deals: boolean }
 */

import { badRequest, unauthorized } from "@/lib/marketplace/auth";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import { setProductEnabledForDeals } from "@/lib/marketplace/integration-sync";
import { requirePermission } from "@/lib/marketplace/permissions";

export const runtime = "nodejs";

type Params = {
  params: { operatorId: string; provider: string; productId: string };
};

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { operatorId, provider, productId } = params;
    if (!operatorId || !provider || !productId) {
      return badRequest("operatorId, provider and productId are required.");
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

    const raw =
      body.is_enabled_for_deals ?? body.isEnabledForDeals;
    if (typeof raw !== "boolean") {
      return badRequest("is_enabled_for_deals must be a boolean.");
    }

    const product = setProductEnabledForDeals(
      getDealDraftHttpStore(),
      operatorId,
      provider,
      productId,
      raw
    );

    return Response.json(
      {
        product: {
          id: product.id,
          external_id: product.externalId,
          name: product.name,
          is_enabled_for_deals: product.isEnabledForDeals,
          archived_in_provider: product.archivedInProvider,
          last_synced_at: product.lastSyncedAt,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    if (err instanceof Error && err.message === "Authentication required.") {
      return unauthorized();
    }
    return dealDraftErrorResponse(err, "Failed to update product.");
  }
}
