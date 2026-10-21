/**
 * POST /api/marketplace/team/:memberId/resend
 * Chunk 40 — resend pending invite email with a fresh token.
 */

import { badRequest, unauthorized } from "@/lib/marketplace/auth";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import { isUserRole, type UserRole } from "@/lib/marketplace/enums";
import {
  TeamError,
  resendTeamInvite,
  serializeTeamMember,
  type ActorForTeam,
} from "@/lib/marketplace/team";

export const runtime = "nodejs";

type Params = { params: { memberId: string } };

function actorFromAuth(auth: {
  user: { id: string; email?: string | null };
  role: UserRole | null;
}): ActorForTeam {
  if (!auth.role || !isUserRole(auth.role)) {
    throw new Error("Authentication required.");
  }
  return {
    userId: auth.user.id,
    role: auth.role,
    email: auth.user.email ?? null,
  };
}

export async function POST(req: Request, { params }: Params) {
  try {
    const memberId = params.memberId;
    if (!memberId) return badRequest("memberId is required.");

    const store = getDealDraftHttpStore();
    const member = store.operators.teamMembers.get(memberId);
    if (!member) {
      return dealDraftErrorResponse(
        new TeamError("Team member not found.", 404),
        "Failed to resend invite."
      );
    }

    const { requirePermission } = await import(
      "@/lib/marketplace/permissions"
    );
    const auth = await requirePermission(
      req,
      member.operatorId,
      "settings.team"
    );
    if (!auth.ok) return auth.response;

    const origin = new URL(req.url).origin;
    const issued = await resendTeamInvite(
      store,
      memberId,
      actorFromAuth(auth),
      { origin }
    );

    return Response.json({
      member: serializeTeamMember(issued.member),
      invite_path: issued.invitePath,
      expires_at: issued.record.expiresAt,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Authentication required.") {
      return unauthorized();
    }
    return dealDraftErrorResponse(err, "Failed to resend invite.");
  }
}
