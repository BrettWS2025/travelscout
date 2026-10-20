/**
 * Integration, ExternalProduct, ExternalSession, SyncLog, DealRule
 * (deals platform Chunk 7).
 *
 * Tables: marketplace.integrations, external_products, external_sessions,
 * sync_logs, deal_rules. Secrets live in marketplace.encrypted_secrets via
 * credentials_ref / webhook_secret_ref — never returned by serializers.
 *
 * Parent operator: marketplace.operators. Inventory deals:
 * marketplace.operator_deals (not legacy marketplace.deals).
 */

import { MAX_LEAD_HOURS, getPlatformConfig } from "./config";
import type {
  AuthType,
  BookingDestinationType,
  ConversionTrackingMethod,
  DiscountMechanism,
  IntegrationStatus,
  RuleType,
  SessionStatus,
  SyncMode,
  SyncType,
} from "./enums";
import {
  INTEGRATION_PROVIDERS,
  isAuthType,
  isBookingDestinationType,
  isConversionTrackingMethod,
  isDiscountMechanism,
  isIntegrationProvider,
  isIntegrationStatus,
  isRuleType,
  isSessionStatus,
  isSyncMode,
  isSyncType,
  type IntegrationProvider,
} from "./enums";

// ---------------------------------------------------------------------------
// Sync log run status (not a platform enum — sync job vocabulary)
// ---------------------------------------------------------------------------

export const SYNC_LOG_STATUSES = ["running", "success", "failed"] as const;
export type SyncLogStatus = (typeof SYNC_LOG_STATUSES)[number];

export function isSyncLogStatus(value: unknown): value is SyncLogStatus {
  return (
    typeof value === "string" &&
    (SYNC_LOG_STATUSES as readonly string[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type Integration = {
  id: string;
  operatorId: string;
  provider: IntegrationProvider;
  status: IntegrationStatus;
  authType: AuthType | null;
  /** Opaque ref into encrypted store — never expose via serializeIntegration */
  credentialsRef: string | null;
  webhookSecretRef: string | null;
  externalAccountId: string | null;
  externalAccountName: string | null;
  syncMode: SyncMode | null;
  pollIntervalSeconds: number | null;
  webhookLastReceivedAt: string | null;
  lastSyncAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  defaultBookingDestinationType: BookingDestinationType | null;
  bookingBaseUrl: string | null;
  conversionTrackingMethod: ConversionTrackingMethod;
  bookingSourceLabel: string | null;
  autoEnableNewProducts: boolean;
  connectedAt: string | null;
  connectedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ExternalProduct = {
  id: string;
  integrationId: string;
  externalId: string;
  name: string;
  description: string | null;
  images: unknown[];
  durationMinutes: number | null;
  location: Record<string, unknown>;
  priceOptions: unknown[];
  isEnabledForDeals: boolean;
  archivedInProvider: boolean;
  rawPayload: Record<string, unknown>;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ExternalSession = {
  id: string;
  externalProductId: string;
  externalId: string;
  startAt: string;
  endAt: string | null;
  seatsAvailable: number | null;
  totalCapacity: number | null;
  status: SessionStatus;
  prices: unknown[];
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SyncLog = {
  id: string;
  integrationId: string;
  syncType: SyncType;
  status: SyncLogStatus;
  startedAt: string;
  finishedAt: string | null;
  itemsProcessed: number;
  errorCode: string | null;
  errorMessage: string | null;
  affectedDealIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type DealRule = {
  id: string;
  operatorId: string;
  integrationId: string;
  externalProductId: string;
  name: string;
  isActive: boolean;
  ruleType: RuleType;
  daysOfWeek: number[];
  specificDates: string[];
  sessionTimes: string[];
  listHoursBeforeStart: number;
  minUnsoldSeats: number;
  seatCap: number | null;
  priceConfig: Record<string, unknown>;
  discountMechanism: DiscountMechanism;
  promoCode: string | null;
  templateDealId: string;
  autoPublish: boolean;
  startDate: string;
  endDate: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Public API shape for an integration — secret refs stripped. */
export type PublicIntegration = Omit<
  Integration,
  "credentialsRef" | "webhookSecretRef"
>;

/** Fields that must never appear in client-facing payloads. */
export const INTEGRATION_SECRET_FIELDS = [
  "credentialsRef",
  "webhookSecretRef",
  "credentials_ref",
  "webhook_secret_ref",
] as const;

// ---------------------------------------------------------------------------
// Serializers (fail closed on secret refs)
// ---------------------------------------------------------------------------

/**
 * Serialize an Integration for API responses. Strips credentials_ref and
 * webhook_secret_ref (camelCase and snake_case). Never include plaintext.
 */
export function serializeIntegration(
  integration: Integration
): PublicIntegration {
  const {
    credentialsRef: _cred,
    webhookSecretRef: _hook,
    ...safe
  } = integration;
  return safe;
}

/**
 * Strip secret refs from a raw row / JSON object (snake or camel). Used when
 * returning DB rows without going through the domain type first.
 */
export function stripIntegrationSecrets<T extends Record<string, unknown>>(
  row: T
): Omit<T, "credentials_ref" | "webhook_secret_ref" | "credentialsRef" | "webhookSecretRef"> {
  const {
    credentials_ref: _a,
    webhook_secret_ref: _b,
    credentialsRef: _c,
    webhookSecretRef: _d,
    ...rest
  } = row as T & {
    credentials_ref?: unknown;
    webhook_secret_ref?: unknown;
    credentialsRef?: unknown;
    webhookSecretRef?: unknown;
  };
  return rest;
}

/** Assert a serialized payload has no secret refs (for tests / guards). */
export function assertNoSecretRefs(payload: unknown): void {
  if (payload === null || typeof payload !== "object") return;
  if (Array.isArray(payload)) {
    for (const item of payload) assertNoSecretRefs(item);
    return;
  }
  const obj = payload as Record<string, unknown>;
  for (const key of INTEGRATION_SECRET_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      throw new Error(
        `API payload must not include secret field "${key}"`
      );
    }
  }
  for (const value of Object.values(obj)) {
    if (value !== null && typeof value === "object") {
      assertNoSecretRefs(value);
    }
  }
}

// ---------------------------------------------------------------------------
// Field validation (draft-friendly; publish rules come later)
// ---------------------------------------------------------------------------

export type IntegrationFieldError = { field: string; message: string };

const PROMO_CODE_REGEX = /^[A-Z0-9_-]+$/;
const HHMM_REGEX = /^\d{2}:\d{2}$/;

export function validateIntegrationFields(
  input: Partial<{
    provider: unknown;
    status: unknown;
    authType: unknown;
    syncMode: unknown;
    pollIntervalSeconds: unknown;
    conversionTrackingMethod: unknown;
    defaultBookingDestinationType: unknown;
    autoEnableNewProducts: unknown;
  }>
): IntegrationFieldError[] {
  const errors: IntegrationFieldError[] = [];

  if (input.provider !== undefined && !isIntegrationProvider(input.provider)) {
    errors.push({
      field: "provider",
      message: `must be one of: ${INTEGRATION_PROVIDERS.join(", ")}`,
    });
  }
  if (input.status !== undefined && !isIntegrationStatus(input.status)) {
    errors.push({ field: "status", message: "invalid integration_status" });
  }
  if (
    input.authType !== undefined &&
    input.authType !== null &&
    !isAuthType(input.authType)
  ) {
    errors.push({ field: "auth_type", message: "invalid auth_type" });
  }
  if (
    input.syncMode !== undefined &&
    input.syncMode !== null &&
    !isSyncMode(input.syncMode)
  ) {
    errors.push({ field: "sync_mode", message: "invalid sync_mode" });
  }
  if (
    input.pollIntervalSeconds !== undefined &&
    input.pollIntervalSeconds !== null
  ) {
    const n = input.pollIntervalSeconds;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1) {
      errors.push({
        field: "poll_interval_seconds",
        message: "must be an integer ≥ 1",
      });
    }
  }
  if (
    input.conversionTrackingMethod !== undefined &&
    !isConversionTrackingMethod(input.conversionTrackingMethod)
  ) {
    errors.push({
      field: "conversion_tracking_method",
      message: "invalid conversion_tracking_method",
    });
  }
  if (
    input.defaultBookingDestinationType !== undefined &&
    input.defaultBookingDestinationType !== null &&
    !isBookingDestinationType(input.defaultBookingDestinationType)
  ) {
    errors.push({
      field: "default_booking_destination_type",
      message: "invalid booking_destination_type",
    });
  }

  return errors;
}

export function validateDealRuleFields(
  input: Partial<{
    name: unknown;
    ruleType: unknown;
    daysOfWeek: unknown;
    specificDates: unknown;
    sessionTimes: unknown;
    listHoursBeforeStart: unknown;
    minUnsoldSeats: unknown;
    seatCap: unknown;
    discountMechanism: unknown;
    promoCode: unknown;
    startDate: unknown;
  }>,
  config = getPlatformConfig()
): IntegrationFieldError[] {
  const errors: IntegrationFieldError[] = [];
  const maxLead = config.MAX_LEAD_HOURS ?? MAX_LEAD_HOURS;

  if (input.name !== undefined) {
    if (typeof input.name !== "string" || input.name.trim().length < 1) {
      errors.push({ field: "name", message: "required" });
    } else if (input.name.length > 120) {
      errors.push({ field: "name", message: "max 120 characters" });
    }
  }

  if (input.ruleType !== undefined && !isRuleType(input.ruleType)) {
    errors.push({ field: "rule_type", message: "invalid rule_type" });
  }

  if (input.daysOfWeek !== undefined) {
    if (!Array.isArray(input.daysOfWeek)) {
      errors.push({ field: "days_of_week", message: "must be an array" });
    } else {
      for (const d of input.daysOfWeek) {
        if (typeof d !== "number" || !Number.isInteger(d) || d < 0 || d > 6) {
          errors.push({
            field: "days_of_week",
            message: "each day must be an integer 0–6",
          });
          break;
        }
      }
    }
  }

  if (input.sessionTimes !== undefined) {
    if (!Array.isArray(input.sessionTimes)) {
      errors.push({ field: "session_times", message: "must be an array" });
    } else {
      for (const t of input.sessionTimes) {
        if (typeof t !== "string" || !HHMM_REGEX.test(t)) {
          errors.push({
            field: "session_times",
            message: 'each time must be "HH:MM"',
          });
          break;
        }
      }
    }
  }

  if (input.listHoursBeforeStart !== undefined) {
    const n = input.listHoursBeforeStart;
    if (
      typeof n !== "number" ||
      !Number.isInteger(n) ||
      n < 1 ||
      n > maxLead
    ) {
      errors.push({
        field: "list_hours_before_start",
        message: `must be an integer 1–${maxLead}`,
      });
    }
  }

  if (input.minUnsoldSeats !== undefined) {
    const n = input.minUnsoldSeats;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1) {
      errors.push({
        field: "min_unsold_seats",
        message: "must be an integer ≥ 1",
      });
    }
  }

  if (input.seatCap !== undefined && input.seatCap !== null) {
    const n = input.seatCap;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 999) {
      errors.push({ field: "seat_cap", message: "must be 1–999" });
    }
  }

  if (
    input.discountMechanism !== undefined &&
    !isDiscountMechanism(input.discountMechanism)
  ) {
    errors.push({
      field: "discount_mechanism",
      message: "invalid discount_mechanism",
    });
  }

  if (input.promoCode !== undefined && input.promoCode !== null) {
    if (
      typeof input.promoCode !== "string" ||
      input.promoCode.length < 3 ||
      input.promoCode.length > 30 ||
      !PROMO_CODE_REGEX.test(input.promoCode)
    ) {
      errors.push({
        field: "promo_code",
        message: "3–30 chars, A–Z 0–9 _ - only",
      });
    }
  }

  return errors;
}

// Re-export provider list for callers
export { INTEGRATION_PROVIDERS, isIntegrationProvider };
export type { IntegrationProvider };

// Keep session/sync validators reachable for tests without pulling enums alone
export {
  isSessionStatus,
  isSyncType,
  isIntegrationStatus,
};
