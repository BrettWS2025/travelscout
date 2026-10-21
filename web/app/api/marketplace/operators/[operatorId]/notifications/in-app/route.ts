/**
 * GET|POST /api/marketplace/operators/:operatorId/notifications/in-app
 * In-app inbox for the current user (Chunk 39).
 *
 * GET  → list (optional ?unread=1)
 * POST → { action: "mark_all_read" } or { action: "mark_read", id }
 */

import { badRequest, unauthorized } from "@/lib/marketplace/auth";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import {
  listMyInAppNotifications,
  markAllInAppNotificationsRead,
  markInAppNotificationRead,
  serializeInAppNotification,
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

    const url = new URL(req.url);
    const unreadOnly =
      url.searchParams.get("unread") === "1" ||
      url.searchParams.get("unread") === "true";

    const rows = listMyInAppNotifications(
      getDealDraftHttpStore(),
      operatorId,
      auth.user.id,
      { unreadOnly }
    );

    return Response.json({
      notifications: rows.map(serializeInAppNotification),
      unread_count: rows.filter((r) => r.readAt == null).length,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Authentication required.") {
      return unauthorized();
    }
    return dealDraftErrorResponse(err, "Failed to load in-app notifications.");
  }
}

export async function POST(req: Request, { params }: Params) {
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

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return badRequest("Invalid JSON body.");
    }

    const store = getDealDraftHttpStore();
    const action = body.action;

    if (action === "mark_all_read") {
      const count = markAllInAppNotificationsRead(
        store,
        operatorId,
        auth.user.id
      );
      return Response.json({ marked: count });
    }

    if (action === "mark_read") {
      const id = body.id ?? body.notification_id;
      if (typeof id !== "string" || !id) {
        return badRequest("id is required for mark_read.");
      }
      const row = markInAppNotificationRead(
        store,
        operatorId,
        auth.user.id,
        id
      );
      return Response.json({
        notification: serializeInAppNotification(row),
      });
    }

    return badRequest('action must be "mark_read" or "mark_all_read".');
  } catch (err) {
    if (err instanceof Error && err.message === "Authentication required.") {
      return unauthorized();
    }
    return dealDraftErrorResponse(err, "Failed to update in-app notifications.");
  }
}
