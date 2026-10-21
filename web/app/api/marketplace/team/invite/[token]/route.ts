/**
 * GET|POST /api/marketplace/team/invite/:token
 * Chunk 40 — preview invite (no auth); accept (auth required, email must match).
 */

import {
  badRequest,
  unauthorized,
} from "@/lib/marketplace/auth";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import {
  acceptTeamInvite,
  getTeamInvitePreview,
  serializeTeamMember,
} from "@/lib/marketplace/team";

export const runtime = "nodejs";

type Params = { params: { token: string } };

function decodeToken(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const token = decodeToken(params.token ?? "");
    if (!token) return badRequest("token is required.");

    const preview = getTeamInvitePreview(getDealDraftHttpStore(), token);
    return Response.json({ invite: preview });
  } catch (err) {
    return dealDraftErrorResponse(err, "Failed to load invite.");
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const token = decodeToken(params.token ?? "");
    if (!token) return badRequest("token is required.");

    const { getMarketplaceAuth } = await import("@/lib/marketplace/auth");
    const { user } = await getMarketplaceAuth(req);
    if (!user) return unauthorized();

    const member = acceptTeamInvite(getDealDraftHttpStore(), token, {
      id: user.id,
      email: user.email ?? null,
    });

    return Response.json({
      member: serializeTeamMember(member),
      ok: true,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Authentication required.") {
      return unauthorized();
    }
    return dealDraftErrorResponse(err, "Failed to accept invite.");
  }
}
