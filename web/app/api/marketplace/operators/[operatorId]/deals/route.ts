/**
 * POST /api/marketplace/operators/:operatorId/deals
 * Create a draft deal (Chunk 12). Requires inventory.write.
 *
 * Body: { deal_type | dealType, template_id?, duplicate_of?, source_provider? }
 */

import { badRequest, unauthorized } from "@/lib/marketplace/auth";
import {
  createDraftDeal,
  type CreateDraftDealInput,
} from "@/lib/marketplace/deal-draft";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import { isDealType, isSourceProvider } from "@/lib/marketplace/enums";
import { requirePermission } from "@/lib/marketplace/permissions";

export const runtime = "nodejs";

type Params = { params: { operatorId: string } };

export async function POST(req: Request, { params }: Params) {
  try {
    const operatorId = params.operatorId;
    if (!operatorId) return badRequest("operatorId is required.");

    const auth = await requirePermission(req, operatorId, "inventory.write");
    if (!auth.ok) return auth.response;

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return badRequest("Request body must be JSON.");
    }

    const dealTypeRaw = body.deal_type ?? body.dealType;
    if (!isDealType(dealTypeRaw)) {
      return badRequest("deal_type is required and must be a valid type.");
    }

    const sourceRaw = body.source_provider ?? body.sourceProvider;
    const sourceProvider =
      sourceRaw == null
        ? undefined
        : isSourceProvider(sourceRaw)
          ? sourceRaw
          : null;
    if (sourceRaw != null && sourceProvider == null) {
      return badRequest("source_provider is invalid.");
    }

    const templateId =
      (body.template_id as string | undefined) ??
      (body.templateId as string | undefined) ??
      null;
    const duplicateOf =
      (body.duplicate_of as string | undefined) ??
      (body.duplicateOf as string | undefined) ??
      null;

    const store = getDealDraftHttpStore();
    const input: CreateDraftDealInput = {
      operatorId,
      dealType: dealTypeRaw,
      sourceProvider,
      templateId,
      duplicateOf,
      actor: { type: "user", id: auth.user.id },
    };

    const deal = createDraftDeal(store, input);
    return Response.json({ deal }, { status: 201 });
  } catch (err) {
    if (
      err instanceof Error &&
      err.message === "Authentication required."
    ) {
      return unauthorized();
    }
    return dealDraftErrorResponse(err, "Failed to create draft deal.");
  }
}
