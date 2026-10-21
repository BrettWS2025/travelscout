/**
 * GET|PATCH /api/marketplace/operators/:operatorId/notifications/me
 * Own notification preferences (Chunk 39). Permission: settings.notifications.own.
 *
 * PATCH body:
 *   { event_type, email?, sms?, in_app? } — single row
 *   or { preferences: [{ event_type, email?, sms?, in_app? }, ...] } — bulk
 */

import { badRequest, unauthorized } from "@/lib/marketplace/auth";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import {
  getMyNotificationPreferences,
  patchMyNotificationPreference,
  patchMyNotificationPreferencesBulk,
  requireNotificationsOwn,
  serializeNotificationPreference,
} from "@/lib/marketplace/notifications";

export const runtime = "nodejs";

type Params = { params: { operatorId: string } };

export async function GET(req: Request, { params }: Params) {
  try {
    const operatorId = params.operatorId;
    if (!operatorId) return badRequest("operatorId is required.");

    const { requirePermission } = await import(
      "@/lib/marketplace/permissions"
    );
    const auth = await requirePermission(
      req,
      operatorId,
      "settings.notifications.own"
    );
    if (!auth.ok) return auth.response;

    requireNotificationsOwn(auth.permissionUser, operatorId);

    const prefs = getMyNotificationPreferences(
      getDealDraftHttpStore(),
      operatorId,
      auth.user.id
    );

    return Response.json({
      preferences: prefs.map(serializeNotificationPreference),
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Authentication required.") {
      return unauthorized();
    }
    return dealDraftErrorResponse(err, "Failed to load notification preferences.");
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const operatorId = params.operatorId;
    if (!operatorId) return badRequest("operatorId is required.");

    const { requirePermission } = await import(
      "@/lib/marketplace/permissions"
    );
    const auth = await requirePermission(
      req,
      operatorId,
      "settings.notifications.own"
    );
    if (!auth.ok) return auth.response;

    requireNotificationsOwn(auth.permissionUser, operatorId);

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return badRequest("Invalid JSON body.");
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return badRequest("Body must be an object.");
    }

    const store = getDealDraftHttpStore();
    const userId = auth.user.id;

    if (Array.isArray(body.preferences)) {
      const prefs = patchMyNotificationPreferencesBulk(
        store,
        operatorId,
        userId,
        body.preferences as Array<Record<string, unknown>>
      );
      return Response.json({
        preferences: prefs.map(serializeNotificationPreference),
      });
    }

    const updated = patchMyNotificationPreference(
      store,
      operatorId,
      userId,
      body
    );
    const prefs = getMyNotificationPreferences(store, operatorId, userId);
    return Response.json({
      preference: serializeNotificationPreference(updated),
      preferences: prefs.map(serializeNotificationPreference),
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Authentication required.") {
      return unauthorized();
    }
    return dealDraftErrorResponse(
      err,
      "Failed to update notification preferences."
    );
  }
}
