/**
 * Pure helpers / copy for Integrations settings screens (Chunk 37).
 * Visual layout mirrors other Account screens; rules stay server-side.
 */

import type {
  BookingDestinationType,
  ConversionTrackingMethod,
  IntegrationProvider,
  SyncMode,
  SyncType,
} from "./enums";
import {
  BOOKING_DESTINATION_TYPES,
  CONVERSION_TRACKING_METHODS,
  SYNC_MODES,
  SYNC_TYPES,
} from "./enums";
import type { IntegrationProviderCard } from "./integration-connect";
import type { SyncLogStatus } from "./integration";
import {
  BOOKING_DESTINATION_LABELS,
  CONVERSION_TRACKING_LABELS,
  INTEGRATION_STATUS_LABELS,
  SOURCE_PROVIDER_LABELS,
  SYNC_LOG_STATUS_LABELS,
  SYNC_MODE_LABELS,
  SYNC_TYPE_LABELS,
} from "./display-labels";

export {
  BOOKING_DESTINATION_LABELS,
  CONVERSION_TRACKING_LABELS,
  INTEGRATION_STATUS_LABELS,
  SOURCE_PROVIDER_LABELS,
  SYNC_LOG_STATUS_LABELS,
  SYNC_MODE_LABELS,
  SYNC_TYPE_LABELS,
};

/** Settings subnav items. Integrations + profile/defaults + notifications + team + compliance live. */
export const SETTINGS_NAV_ITEMS = [
  {
    href: "/account/settings/integrations",
    label: "Integrations",
    live: true,
  },
  {
    href: "/account/settings/business-profile",
    label: "Business Profile",
    live: true,
  },
  {
    href: "/account/settings/deal-defaults",
    label: "Deal Defaults",
    live: true,
  },
  {
    href: "/account/settings/notifications",
    label: "Notifications",
    live: true,
  },
  {
    href: "/account/settings/team",
    label: "Team",
    live: true,
  },
  {
    href: "/account/settings/compliance",
    label: "Compliance",
    live: true,
  },
  {
    href: "/account/settings/billing",
    label: "Billing",
    live: true,
  },
  {
    href: "/account/settings/account",
    label: "Account",
    live: true,
  },
] as const;

export function providerLabel(provider: string): string {
  if (provider in SOURCE_PROVIDER_LABELS) {
    return SOURCE_PROVIDER_LABELS[provider as keyof typeof SOURCE_PROVIDER_LABELS];
  }
  return provider;
}

export function canManageIntegrations(
  role: string | null | undefined
): boolean {
  return role === "owner" || role === "manager";
}

export function isIntegrationConnectedStatus(
  status: string | null | undefined
): boolean {
  return (
    status === "connected" ||
    status === "degraded" ||
    status === "error" ||
    status === "connecting"
  );
}

/**
 * Plain-language fix text for integration / sync error codes.
 * Falls back to the stored message when the code is unknown.
 */
export function integrationErrorFixText(
  errorCode: string | null | undefined,
  errorMessage: string | null | undefined,
  providerLabelText: string
): string | null {
  if (!errorCode && !errorMessage) return null;

  const code = (errorCode ?? "").toLowerCase();
  const known: Record<string, string> = {
    sync_failed: `${providerLabelText} sync failed. Click Sync Again. If it keeps failing, use Test Connection and reconnect with a fresh API key.`,
    sync_error: `${providerLabelText} returned an error during sync. Click Sync Again, or disconnect and reconnect if the problem continues.`,
    sync_in_progress: `A sync is already running for ${providerLabelText}. Wait for it to finish, then try again.`,
    connect_failed: `Could not connect to ${providerLabelText}. Check the API key and try Connect again.`,
    not_implemented: `${providerLabelText} is coming soon and cannot be connected yet.`,
    not_connected: `${providerLabelText} is not connected. Enter your API key to connect.`,
    missing_credentials: `Stored credentials are missing. Disconnect and connect again with a valid API key.`,
    invalid_status: `This action is not available in the current connection state. Refresh the page and try again.`,
    auth: `Sign-in failed. Generate a new API key in ${providerLabelText} and reconnect.`,
    unauthorized: `Sign-in failed. Generate a new API key in ${providerLabelText} and reconnect.`,
    invalid_api_key: `The API key was rejected. Generate a new key in ${providerLabelText} and reconnect.`,
    rate_limit: `${providerLabelText} asked us to slow down. Wait a few minutes, then Sync Again. You can also check less often.`,
    timeout: `The request to ${providerLabelText} timed out. Try Sync Again; if it keeps happening, check ${providerLabelText} status.`,
    network: `Could not reach ${providerLabelText}. Check your network and try Sync Again.`,
  };

  if (code && known[code]) return known[code];
  if (errorMessage?.trim()) {
    return `${errorMessage.trim()} — try Sync Again or Test Connection.`;
  }
  if (code) {
    return `Error “${errorCode}”. Try Sync Again or Test Connection.`;
  }
  return null;
}

export function formatSyncTime(
  iso: string | null | undefined,
  timeZone = "Pacific/Auckland"
): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown";
  try {
    return new Intl.DateTimeFormat("en-NZ", {
      timeZone,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

export function pollIntervalOptions(
  minSeconds: number,
  maxSeconds: number
): number[] {
  const candidates = [60, 120, 300, 600, 900, 1800, 3600];
  const inRange = candidates.filter(
    (s) => s >= minSeconds && s <= maxSeconds
  );
  if (inRange.length === 0) {
    return [Math.min(Math.max(minSeconds, 300), maxSeconds)];
  }
  return inRange;
}

export function formatPollInterval(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hours = Math.round(mins / 60);
  return `${hours} h`;
}

/** True when no provider card is in a connected-ish state. */
export function showManualOperatorExplainer(
  cards: IntegrationProviderCard[]
): boolean {
  return !cards.some((c) => isIntegrationConnectedStatus(c.status));
}

export function syncModeOptions(
  caps: { webhooks_availability?: boolean; preferred_sync_mode?: SyncMode } | null
): SyncMode[] {
  if (!caps) return [...SYNC_MODES];
  if (caps.preferred_sync_mode && SYNC_MODES.includes(caps.preferred_sync_mode)) {
    // Still allow all modes; UI may highlight preferred.
    return [...SYNC_MODES];
  }
  return [...SYNC_MODES];
}

export function bookingDestinationOptions(): BookingDestinationType[] {
  return [...BOOKING_DESTINATION_TYPES];
}

export function conversionTrackingOptions(): ConversionTrackingMethod[] {
  return [...CONVERSION_TRACKING_METHODS];
}

export function syncTypeFilterOptions(): Array<SyncType | ""> {
  return ["", ...SYNC_TYPES];
}

export function syncStatusFilterOptions(): Array<SyncLogStatus | ""> {
  return ["", "running", "success", "failed"];
}

export function providerDetailHref(provider: IntegrationProvider | string): string {
  return `/account/settings/integrations/${encodeURIComponent(provider)}`;
}

export function integrationsListHref(): string {
  return "/account/settings/integrations";
}
