/**
 * Browser client for Notifications settings APIs (Chunk 39).
 */

export class NotificationsApiError extends Error {
  status: number;
  errors: Array<{ field: string; message: string }>;

  constructor(
    message: string,
    status: number,
    errors?: Array<{ field: string; message: string }>
  ) {
    super(message);
    this.name = "NotificationsApiError";
    this.status = status;
    this.errors = errors ?? [];
  }
}

export type NotificationPreferenceRow = {
  id: string;
  user_id: string;
  operator_id: string;
  event_type: string;
  email: boolean;
  sms: boolean;
  in_app: boolean;
  mandatory: boolean;
  label: string;
  description: string;
  created_at: string;
  updated_at: string;
};

export type InAppNotificationRow = {
  id: string;
  user_id: string;
  operator_id: string;
  event_type: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export async function getMyNotificationPreferencesApi(
  operatorId: string,
  token: string
): Promise<{ preferences: NotificationPreferenceRow[] }> {
  const res = await fetch(
    `/api/marketplace/operators/${encodeURIComponent(operatorId)}/notifications/me`,
    { headers: authHeaders(token), cache: "no-store" }
  );
  const data = await parseJson(res);
  if (!res.ok) {
    throw new NotificationsApiError(
      typeof data.error === "string"
        ? data.error
        : "Failed to load preferences",
      res.status,
      Array.isArray(data.errors)
        ? (data.errors as Array<{ field: string; message: string }>)
        : []
    );
  }
  return {
    preferences: (data.preferences ?? []) as NotificationPreferenceRow[],
  };
}

export async function patchMyNotificationPreferenceApi(
  operatorId: string,
  token: string,
  body: {
    event_type: string;
    email?: boolean;
    sms?: boolean;
    in_app?: boolean;
  }
): Promise<{
  preference?: NotificationPreferenceRow;
  preferences: NotificationPreferenceRow[];
}> {
  const res = await fetch(
    `/api/marketplace/operators/${encodeURIComponent(operatorId)}/notifications/me`,
    {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(body),
    }
  );
  const data = await parseJson(res);
  if (!res.ok) {
    throw new NotificationsApiError(
      typeof data.error === "string"
        ? data.error
        : "Failed to update preference",
      res.status,
      Array.isArray(data.errors)
        ? (data.errors as Array<{ field: string; message: string }>)
        : []
    );
  }
  return {
    preference: data.preference as NotificationPreferenceRow | undefined,
    preferences: (data.preferences ?? []) as NotificationPreferenceRow[],
  };
}

export async function listInAppNotificationsApi(
  operatorId: string,
  token: string,
  options?: { unreadOnly?: boolean }
): Promise<{ notifications: InAppNotificationRow[]; unread_count: number }> {
  const q = options?.unreadOnly ? "?unread=1" : "";
  const res = await fetch(
    `/api/marketplace/operators/${encodeURIComponent(operatorId)}/notifications/in-app${q}`,
    { headers: authHeaders(token), cache: "no-store" }
  );
  const data = await parseJson(res);
  if (!res.ok) {
    throw new NotificationsApiError(
      typeof data.error === "string"
        ? data.error
        : "Failed to load notifications",
      res.status
    );
  }
  return {
    notifications: (data.notifications ?? []) as InAppNotificationRow[],
    unread_count:
      typeof data.unread_count === "number" ? data.unread_count : 0,
  };
}

export async function markInAppReadApi(
  operatorId: string,
  token: string,
  notificationId: string
): Promise<InAppNotificationRow> {
  const res = await fetch(
    `/api/marketplace/operators/${encodeURIComponent(operatorId)}/notifications/in-app`,
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ action: "mark_read", id: notificationId }),
    }
  );
  const data = await parseJson(res);
  if (!res.ok) {
    throw new NotificationsApiError(
      typeof data.error === "string" ? data.error : "Failed to mark read",
      res.status
    );
  }
  return data.notification as InAppNotificationRow;
}
