/**
 * GET|POST /api/marketplace/operators/:operatorId/team
 * Chunk 40 — list members; invite by email + role.
 * Permission: settings.team
 */

import { badRequest, unauthorized } from "@/lib/marketplace/auth";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import { isUserRole, type UserRole } from "@/lib/marketplace/enums";
import {
  inviteTeamMember,
  listOperatorTeam,
  serializeTeamMember,
  type ActorForTeam,
} from "@/lib/marketplace/team";

export const runtime = "nodejs";

type Params = { params: { operatorId: string } };

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

export async function GET(req: Request, { params }: Params) {
  try {
    const operatorId = params.operatorId;
    if (!operatorId) return badRequest("operatorId is required.");

    const { requirePermission } = await import(
      "@/lib/marketplace/permissions"
    );
    const auth = await requirePermission(req, operatorId, "settings.team");
    if (!auth.ok) return auth.response;

    const members = listOperatorTeam(getDealDraftHttpStore(), operatorId);
    return Response.json({
      members: members.map(serializeTeamMember),
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Authentication required.") {
      return unauthorized();
    }
    return dealDraftErrorResponse(err, "Failed to load team.");
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const operatorId = params.operatorId;
    if (!operatorId) return badRequest("operatorId is required.");

    const { requirePermission } = await import(
      "@/lib/marketplace/permissions"
    );
    const auth = await requirePermission(req, operatorId, "settings.team");
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

    const email =
      typeof body.email === "string"
        ? body.email
        : typeof body.invited_email === "string"
          ? body.invited_email
          : "";
    const roleRaw = body.role;
    if (!isUserRole(roleRaw)) {
      return badRequest("role must be owner, manager, or staff.");
    }

    const origin = new URL(req.url).origin;
    const issued = await inviteTeamMember(
      getDealDraftHttpStore(),
      operatorId,
      actorFromAuth(auth),
      { email, role: roleRaw },
      { origin }
    );

    return Response.json(
      {
        member: serializeTeamMember(issued.member),
        invite_path: issued.invitePath,
        expires_at: issued.record.expiresAt,
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof Error && err.message === "Authentication required.") {
      return unauthorized();
    }
    return dealDraftErrorResponse(err, "Failed to invite team member.");
  }
}
