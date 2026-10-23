/**
 * UI helpers for Notifications settings grid (Chunk 39).
 */

import {
  MANDATORY_NOTIFICATION_EVENTS,
  NOTIFICATION_EVENT_TYPES,
  type NotificationEventType,
} from "./settings";
import { isMandatoryNotificationEvent } from "./notifications";
import {
  NOTIFICATION_CHANNEL_LABELS,
  NOTIFICATION_EVENT_DESCRIPTIONS,
  NOTIFICATION_EVENT_LABELS,
} from "./display-labels";

export type NotificationChannelKey = "email" | "sms" | "in_app";

export { NOTIFICATION_CHANNEL_LABELS };

export type NotificationPrefRow = {
  event_type: NotificationEventType;
  email: boolean;
  sms: boolean;
  in_app: boolean;
  mandatory: boolean;
  label: string;
  description: string;
};

export function notificationEventOrder(): NotificationEventType[] {
  return [...NOTIFICATION_EVENT_TYPES];
}

export function eventLabel(eventType: NotificationEventType): string {
  return NOTIFICATION_EVENT_LABELS[eventType];
}

export function eventDescription(eventType: NotificationEventType): string {
  return NOTIFICATION_EVENT_DESCRIPTIONS[eventType];
}

export function isMandatoryEvent(eventType: NotificationEventType): boolean {
  return isMandatoryNotificationEvent(eventType);
}

export function wouldDisableLastMandatoryChannel(
  row: Pick<NotificationPrefRow, "event_type" | "email" | "sms" | "in_app">,
  channel: NotificationChannelKey,
  nextValue: boolean
): boolean {
  if (nextValue) return false;
  if (!isMandatoryNotificationEvent(row.event_type)) return false;
  const next = {
    email: channel === "email" ? nextValue : row.email,
    sms: channel === "sms" ? nextValue : row.sms,
    in_app: channel === "in_app" ? nextValue : row.in_app,
  };
  return !next.email && !next.sms && !next.in_app;
}

export function fieldErrorMap(
  errors: Array<{ field: string; message: string }> | undefined
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of errors ?? []) {
    out[e.field] = e.message;
  }
  return out;
}

export { MANDATORY_NOTIFICATION_EVENTS };
