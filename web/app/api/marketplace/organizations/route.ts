// app/api/marketplace/organizations/route.ts
import {
  badRequest,
  getMarketplaceAuth,
  serverError,
  unauthorized,
} from "@/lib/marketplace/auth";
import { createOrganization, listMyOrganizations } from "@/lib/marketplace/db";
import type { BookingProvider, CreateOrganizationInput } from "@/lib/marketplace/types";
import { canonicalizeRegion } from "@/lib/regions";

export const runtime = "nodejs";

const PROVIDERS: BookingProvider[] = ["manual", "rezdy", "fareharbor", "other"];

/**
 * GET /api/marketplace/organizations
 * List organizations the authenticated user belongs to.
 */
export async function GET(req: Request) {
  try {
    const { user, accessToken } = await getMarketplaceAuth(req);
    if (!user || !accessToken) return unauthorized();

    const organizations = await listMyOrganizations(accessToken);
    return Response.json({ organizations });
  } catch (err) {
    return serverError("Failed to list organizations.", err);
  }
}

/**
 * POST /api/marketplace/organizations
 * Create an organization; creator becomes owner via DB trigger.
 */
export async function POST(req: Request) {
  try {
    const { user, accessToken } = await getMarketplaceAuth(req);
    if (!user || !accessToken) return unauthorized();

    const body = (await req.json()) as Partial<CreateOrganizationInput>;
    if (!body?.name || typeof body.name !== "string" || !body.name.trim()) {
      return badRequest("name is required.");
    }
    if (!body?.phone || typeof body.phone !== "string" || !body.phone.trim()) {
      return badRequest("phone is required.");
    }
    if (
      !body?.website ||
      typeof body.website !== "string" ||
      !body.website.trim()
    ) {
      return badRequest("website is required.");
    }
    if (!body?.region || typeof body.region !== "string" || !body.region.trim()) {
      return badRequest("region is required.");
    }
    const region = canonicalizeRegion(body.region);
    if (!region) {
      return badRequest(
        "region must be a New Zealand region from nz_places_final."
      );
    }

    if (
      body.defaultBookingProvider &&
      !PROVIDERS.includes(body.defaultBookingProvider)
    ) {
      return badRequest(
        `defaultBookingProvider must be one of: ${PROVIDERS.join(", ")}`
      );
    }

    const organization = await createOrganization(accessToken, user.id, {
      name: body.name,
      slug: body.slug,
      phone: body.phone,
      website: body.website,
      region,
      defaultBookingProvider: body.defaultBookingProvider,
      fareharborShortname: body.fareharborShortname,
      fareharborAsn: body.fareharborAsn,
      rezdyAffiliateCode: body.rezdyAffiliateCode,
    });

    return Response.json({ organization }, { status: 201 });
  } catch (err) {
    return serverError("Failed to create organization.", err);
  }
}
