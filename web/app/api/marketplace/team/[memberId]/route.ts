/**
 * PATCH|DELETE /api/marketplace/team/:memberId
 * Chunk 40 — change role or remove a member.
 * Permission: settings.team on the member's operator.
 */

import { badRequest, unauthorized } from "@/lib/marketplace/auth";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import { isUserRole, type UserRole } from "@/lib/marketplace/enums";
import {
  TeamError,
  deleteTeamMember,
  serializeTeamMember,
  updateTeamMemberRole,
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

export async function PATCH(req: Request, { params }: Params) {
  try {
    const memberId = params.memberId;
    if (!memberId) return badRequest("memberId is required.");

    const store = getDealDraftHttpStore();
    const member = store.operators.teamMembers.get(memberId);
    if (!member) {
      return dealDraftErrorResponse(
        new TeamError("Team member not found.", 404),
        "Failed to update team member."
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

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return badRequest("Invalid JSON body.");
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return badRequest("Body must be an object.");
    }

    if (!isUserRole(body.role)) {
      return badRequest("role must be owner, manager, or staff.");
    }

    const updated = updateTeamMemberRole(
      store,
      memberId,
      actorFromAuth(auth),
      body.role
    );
    return Response.json({ member: serializeTeamMember(updated) });
  } catch (err) {
    if (err instanceof Error && err.message === "Authentication required.") {
      return unauthorized();
    }
    return dealDraftErrorResponse(err, "Failed to update team member.");
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const memberId = params.memberId;
    if (!memberId) return badRequest("memberId is required.");

    const store = getDealDraftHttpStore();
    const member = store.operators.teamMembers.get(memberId);
    if (!member) {
      return dealDraftErrorResponse(
        new TeamError("Team member not found.", 404),
        "Failed to remove team member."
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

    deleteTeamMember(store, memberId, actorFromAuth(auth));
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === "Authentication required.") {
      return unauthorized();
    }
    return dealDraftErrorResponse(err, "Failed to remove team member.");
  }
}
