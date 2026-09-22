// app/api/marketplace/deals/[id]/route.ts
import {
  badRequest,
  getMarketplaceAuth,
  notFound,
  serverError,
  unauthorized,
} from "@/lib/marketplace/auth";
import { deleteDeal, getDeal, updateDeal } from "@/lib/marketplace/db";
import type {
  BookingProvider,
  DealStatus,
  UpdateDealInput,
} from "@/lib/marketplace/types";

export const runtime = "nodejs";

type Params = { params: { id: string } };

const PROVIDERS: BookingProvider[] = ["manual", "rezdy", "fareharbor", "other"];
const STATUSES: DealStatus[] = ["draft", "live", "expired", "sold_out"];

/**
 * GET /api/marketplace/deals/:id
 * Live deals are public; drafts require org membership.
 */
export async function GET(req: Request, { params }: Params) {
  try {
    const { accessToken } = await getMarketplaceAuth(req);
    const deal = await getDeal(accessToken, params.id);
    if (!deal) return notFound("Deal not found.");
    return Response.json({ deal });
  } catch (err) {
    return serverError("Failed to get deal.", err);
  }
}

/**
 * PATCH /api/marketplace/deals/:id
 * Update a deal (org members only via RLS).
 */
export async function PATCH(req: Request, { params }: Params) {
  try {
    const { user, accessToken } = await getMarketplaceAuth(req);
    if (!user || !accessToken) return unauthorized();

    const body = (await req.json()) as UpdateDealInput;
    if (!body || typeof body !== "object") {
      return badRequest("Request body is required.");
    }
    if (body.bookingProvider && !PROVIDERS.includes(body.bookingProvider)) {
      return badRequest(`bookingProvider must be one of: ${PROVIDERS.join(", ")}`);
    }
    if (body.status && !STATUSES.includes(body.status)) {
      return badRequest(`status must be one of: ${STATUSES.join(", ")}`);
    }

    const deal = await updateDeal(accessToken, params.id, body);
    return Response.json({ deal });
  } catch (err) {
    return serverError("Failed to update deal.", err);
  }
}

/**
 * DELETE /api/marketplace/deals/:id
 */
export async function DELETE(req: Request, { params }: Params) {
  try {
    const { user, accessToken } = await getMarketplaceAuth(req);
    if (!user || !accessToken) return unauthorized();

    await deleteDeal(accessToken, params.id);
    return Response.json({ ok: true });
  } catch (err) {
    return serverError("Failed to delete deal.", err);
  }
}
