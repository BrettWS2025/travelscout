/**
 * GET / POST /api/marketplace/operator-deals/:id/discount-steps
 * Stepped discount CRUD (Chunk 43). GET inventory.read; POST inventory.write.
 */

import { badRequest } from "@/lib/marketplace/auth";
import {
  createDiscountStep,
  listDiscountSteps,
} from "@/lib/marketplace/deal-stepped-discounts";
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

    const url = new URL(req.url);
    const priceOptionId =
      url.searchParams.get("price_option_id") ?? undefined;

    const steps = listDiscountSteps(
      getDealDraftHttpStore(),
      dealId,
      priceOptionId ?? undefined
    );
    return Response.json({ discount_steps: steps });
  } catch (err) {
    return dealDraftErrorResponse(err, "Failed to list discount steps.");
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const dealId = params.id;
    if (!dealId) return badRequest("Deal id is required.");

    const auth = await requirePermissionForDeal(req, dealId, "inventory.write");
    if (!auth.ok) return auth.response;

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return badRequest("Request body must be JSON.");
    }

    const result = await createDiscountStep(
      getDealDraftHttpStore(),
      dealId,
      body,
      {
        actor: { type: "user", id: auth.user.id },
        confirm: body.confirm === true,
      }
    );

    return Response.json({
      discount_step: result.step,
      validation: result.validation,
    });
  } catch (err) {
    return dealDraftErrorResponse(err, "Failed to create discount step.");
  }
}
