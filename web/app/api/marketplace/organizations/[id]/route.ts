// app/api/marketplace/organizations/[id]/route.ts
import {
  badRequest,
  getMarketplaceAuth,
  notFound,
  serverError,
  unauthorized,
} from "@/lib/marketplace/auth";
import { getOrganization, updateOrganization } from "@/lib/marketplace/db";
import type { UpdateOrganizationInput } from "@/lib/marketplace/types";

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

/**
 * PATCH /api/marketplace/organizations/:id
 * Owners/admins can update core organisation details.
 */
export async function PATCH(req: Request, { params }: Params) {
  try {
    const { user, accessToken } = await getMarketplaceAuth(req);
    if (!user || !accessToken) return unauthorized();

    const body = (await req.json()) as Partial<UpdateOrganizationInput>;
    const input: UpdateOrganizationInput = {};

    if (body.name !== undefined) {
      if (typeof body.name !== "string" || !body.name.trim()) {
        return badRequest("name is required.");
      }
      input.name = body.name;
    }
    if (body.phone !== undefined) {
      if (typeof body.phone !== "string") {
        return badRequest("phone must be a string.");
      }
      input.phone = body.phone;
    }
    if (body.website !== undefined) {
      if (typeof body.website !== "string") {
        return badRequest("website must be a string.");
      }
      input.website = body.website;
    }
    if (body.region !== undefined) {
      if (typeof body.region !== "string") {
        return badRequest("region must be a string.");
      }
      input.region = body.region;
    }

    if (Object.keys(input).length === 0) {
      return badRequest("No organisation fields to update.");
    }

    const organization = await updateOrganization(
      accessToken,
      params.id,
      input
    );
    return Response.json({ organization });
  } catch (err) {
    return serverError("Failed to update organization.", err);
  }
}
