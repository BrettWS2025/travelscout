/**
 * GET|PATCH /api/marketplace/operators/:operatorId/profile
 * Business profile (Chunk 38). Read: settings.profile.read. Write: settings.profile.write.
 * account_status / requires_manual_review are admin-only (stripped for operators).
 */

import { badRequest, unauthorized } from "@/lib/marketplace/auth";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import {
  getOperatorProfile,
  serializeOperator,
  updateOperatorProfile,
} from "@/lib/marketplace/operator-profile";
import { can, requirePermission } from "@/lib/marketplace/permissions";

export const runtime = "nodejs";

type Params = { params: { operatorId: string } };

export async function GET(req: Request, { params }: Params) {
  try {
    const operatorId = params.operatorId;
    if (!operatorId) return badRequest("operatorId is required.");

    const auth = await requirePermission(
      req,
      operatorId,
      "settings.profile.read"
    );
    if (!auth.ok) return auth.response;

    const operator = getOperatorProfile(getDealDraftHttpStore(), operatorId);
    const canWrite = can(
      auth.permissionUser,
      operatorId,
      "settings.profile.write"
    );
    return Response.json({
      operator: serializeOperator(operator),
      read_only: !canWrite,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Authentication required.") {
      return unauthorized();
    }
    return dealDraftErrorResponse(err, "Failed to load business profile.");
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const operatorId = params.operatorId;
    if (!operatorId) return badRequest("operatorId is required.");

    const auth = await requirePermission(
      req,
      operatorId,
      "settings.profile.write"
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

    const isPlatformAdmin = auth.permissionUser.isPlatformAdmin === true;
    const operator = updateOperatorProfile(
      getDealDraftHttpStore(),
      operatorId,
      body,
      { isPlatformAdmin }
    );

    return Response.json({ operator: serializeOperator(operator) });
  } catch (err) {
    if (err instanceof Error && err.message === "Authentication required.") {
      return unauthorized();
    }
    return dealDraftErrorResponse(err, "Failed to update business profile.");
  }
}
