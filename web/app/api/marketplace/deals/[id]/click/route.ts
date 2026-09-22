// app/api/marketplace/deals/[id]/click/route.ts
// Records attribution and redirects the traveler to the operator booking URL.

import { buildDealRedirectUrl } from "@/lib/marketplace/affiliates";
import {
  getMarketplaceAuth,
  notFound,
  serverError,
} from "@/lib/marketplace/auth";
import { getDeal, getOrganization, recordDealClick } from "@/lib/marketplace/db";

export const runtime = "nodejs";

type Params = { params: { id: string } };

async function handleClick(req: Request, dealId: string) {
  const { user, accessToken } = await getMarketplaceAuth(req);
  const deal = await getDeal(accessToken, dealId);

  if (!deal || deal.status !== "live") {
    return notFound("Live deal not found.");
  }

  const organization = await getOrganization(accessToken, deal.organizationId);
  const clickId = crypto.randomUUID();

  let destinationUrl: string;
  try {
    destinationUrl = buildDealRedirectUrl(deal, clickId, organization);
  } catch (err) {
    return serverError("Deal is missing a booking URL.", err);
  }

  await recordDealClick({
    dealId: deal.id,
    clickId,
    destinationUrl,
    userId: user?.id,
    accessToken,
    userAgent: req.headers.get("user-agent"),
    referrer: req.headers.get("referer"),
  });

  return Response.redirect(destinationUrl, 302);
}

/**
 * GET /api/marketplace/deals/:id/click
 * Preferred Book CTA target — logs click then 302s to attributed booking URL.
 */
export async function GET(req: Request, { params }: Params) {
  try {
    return await handleClick(req, params.id);
  } catch (err) {
    return serverError("Failed to process deal click.", err);
  }
}

/**
 * POST /api/marketplace/deals/:id/click
 * Same as GET, for clients that prefer POST before navigating.
 */
export async function POST(req: Request, { params }: Params) {
  try {
    return await handleClick(req, params.id);
  } catch (err) {
    return serverError("Failed to process deal click.", err);
  }
}
