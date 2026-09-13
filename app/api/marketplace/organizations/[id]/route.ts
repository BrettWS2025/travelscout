// app/api/marketplace/organizations/[id]/route.ts
import {
  getMarketplaceAuth,
  notFound,
  serverError,
} from "@/lib/marketplace/auth";
import { getOrganization } from "@/lib/marketplace/db";

export const runtime = "nodejs";

type Params = { params: { id: string } };

/**
 * GET /api/marketplace/organizations/:id
 * Members can always read; public can read orgs that currently have live deals.
 */
export async function GET(req: Request, { params }: Params) {
  try {
    const { accessToken } = await getMarketplaceAuth(req);
    const organization = await getOrganization(accessToken, params.id);
    if (!organization) return notFound("Organization not found.");
    return Response.json({ organization });
  } catch (err) {
    return serverError("Failed to get organization.", err);
  }
}
