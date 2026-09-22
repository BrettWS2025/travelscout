// app/api/marketplace/deals/route.ts
import {
  badRequest,
  getMarketplaceAuth,
  serverError,
  unauthorized,
} from "@/lib/marketplace/auth";
import {
  createDeal,
  listLiveDeals,
  listOrganizationDeals,
} from "@/lib/marketplace/db";
import type {
  BookingProvider,
  CreateDealInput,
  DealStatus,
} from "@/lib/marketplace/types";

export const runtime = "nodejs";

const PROVIDERS: BookingProvider[] = ["manual", "rezdy", "fareharbor", "other"];
const STATUSES: DealStatus[] = ["draft", "live", "expired", "sold_out"];

/**
 * GET /api/marketplace/deals
 * - Default: public live deal feed
 * - ?organizationId=... : authenticated member listing for that org
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const organizationId = url.searchParams.get("organizationId");
    const placeId = url.searchParams.get("placeId") || undefined;
    const region = url.searchParams.get("region") || undefined;
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : undefined;

    if (organizationId) {
      const { user, accessToken } = await getMarketplaceAuth(req);
      if (!user || !accessToken) return unauthorized();
      const deals = await listOrganizationDeals(accessToken, organizationId);
      return Response.json({ deals });
    }

    const deals = await listLiveDeals({
      placeId,
      region,
      limit:
        limit != null && Number.isFinite(limit) && limit > 0
          ? Math.min(limit, 100)
          : 50,
    });
    return Response.json({ deals });
  } catch (err) {
    return serverError("Failed to list deals.", err);
  }
}

/**
 * POST /api/marketplace/deals
 * Create a deal for an organization the user belongs to.
 */
export async function POST(req: Request) {
  try {
    const { user, accessToken } = await getMarketplaceAuth(req);
    if (!user || !accessToken) return unauthorized();

    const body = (await req.json()) as Partial<CreateDealInput>;

    if (!body.organizationId || typeof body.organizationId !== "string") {
      return badRequest("organizationId is required.");
    }
    if (!body.title || typeof body.title !== "string" || !body.title.trim()) {
      return badRequest("title is required.");
    }
    if (!body.departureAt || typeof body.departureAt !== "string") {
      return badRequest("departureAt is required (ISO timestamp).");
    }
    if (typeof body.dealPrice !== "number" || Number.isNaN(body.dealPrice)) {
      return badRequest("dealPrice is required and must be a number.");
    }
    if (body.bookingProvider && !PROVIDERS.includes(body.bookingProvider)) {
      return badRequest(`bookingProvider must be one of: ${PROVIDERS.join(", ")}`);
    }
    if (body.status && !STATUSES.includes(body.status)) {
      return badRequest(`status must be one of: ${STATUSES.join(", ")}`);
    }
    if (body.status === "live" && !body.bookingUrl?.trim()) {
      return badRequest("bookingUrl is required when status is live.");
    }

    const deal = await createDeal(accessToken, user.id, {
      organizationId: body.organizationId,
      title: body.title,
      description: body.description,
      category: body.category,
      placeId: body.placeId,
      locationName: body.locationName,
      latitude: body.latitude,
      longitude: body.longitude,
      departureAt: body.departureAt,
      spotsLeft: body.spotsLeft,
      originalPrice: body.originalPrice,
      dealPrice: body.dealPrice,
      currency: body.currency,
      status: body.status,
      bookingProvider: body.bookingProvider,
      bookingUrl: body.bookingUrl,
      affiliateTrackingUrl: body.affiliateTrackingUrl,
      affiliateAsn: body.affiliateAsn,
      affiliateAsnRef: body.affiliateAsnRef,
      affiliateRef: body.affiliateRef,
      imageUrl: body.imageUrl,
    });

    return Response.json({ deal }, { status: 201 });
  } catch (err) {
    return serverError("Failed to create deal.", err);
  }
}
