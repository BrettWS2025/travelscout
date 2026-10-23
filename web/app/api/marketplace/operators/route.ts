/**
 * POST /api/marketplace/operators
 * Create a marketplace.operators row + accepted owner team_members for the
 * authenticated user (idempotent via create_marketplace_operator RPC).
 */

import {
  badRequest,
  getMarketplaceAuth,
  serverError,
  unauthorized,
} from "@/lib/marketplace/auth";
import {
  createOperatorFromBusiness,
  ensureOperatorInventory,
  hydrateOperatorIntoHttpStore,
  listOperatorMembershipsFromDb,
} from "@/lib/marketplace/operator-bootstrap";
import { normalizeOperatorBusinessDetails } from "@/lib/marketplace/operator-signup";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { user, accessToken } = await getMarketplaceAuth(req);
    if (!user || !accessToken) return unauthorized();

    const body = (await req.json()) as {
      name?: string;
      phone?: string;
      website?: string;
      region?: string;
      slug?: string;
    };

    const business = normalizeOperatorBusinessDetails({
      name: body.name,
      phone: body.phone,
      website: body.website,
      region: body.region,
    });
    if (!business) {
      return badRequest(
        "name, phone, website, and a valid platform region are required."
      );
    }

    await createOperatorFromBusiness(accessToken, business, {
      slug: body.slug ?? null,
    });

    const memberships = await listOperatorMembershipsFromDb(
      accessToken,
      user.id
    );
    const first = memberships[0];
    if (!first) {
      // Fallback ensure path (e.g. RPC returned but select lag)
      const listed = await ensureOperatorInventory(accessToken, user.id, {
        business,
        email: user.email ?? null,
      });
      if (!listed) {
        return serverError("Failed to create operator.", new Error("no membership"));
      }
      return Response.json({ operator: listed }, { status: 201 });
    }

    hydrateOperatorIntoHttpStore({
      operator: first.operator,
      member: first.member,
    });

    return Response.json(
      {
        operator: {
          id: first.operator.id,
          tradingName: first.operator.tradingName,
          slug: first.operator.slug,
          role: first.role,
          timezone: first.operator.timezone,
          currency: first.operator.currency,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof Error && err.message === "Authentication required.") {
      return unauthorized();
    }
    return serverError("Failed to create operator.", err);
  }
}
