/**
 * NotificationPreference, ComplianceDocument, BillingAccount
 * (deals platform Chunk 8).
 *
 * Tables: marketplace.notification_preferences, compliance_documents,
 * billing_accounts. Parent: marketplace.operators.
 *
 * Notification event types and defaults match docs/deals-spec.md §6.4.
 * payment_method_ref is a provider pointer — never card data; strip via
 * serializeBillingAccount for client responses.
 */

import type {
  BillingModel,
  ComplianceDocType,
  ReviewStatus,
} from "./enums";
import {
  isBillingModel,
  isComplianceDocType,
  isReviewStatus,
} from "./enums";

// ---------------------------------------------------------------------------
// Notification event types (spec §6.4 — not in the Chunk 1 enum table)
// ---------------------------------------------------------------------------

export const NOTIFICATION_EVENT_TYPES = [
  "integration_sync_failing",
  "deal_auto_paused",
  "attestation_due",
  "booking_link_broken",
  "deal_review_update",
  "deal_lifecycle",
  "auto_rule_created_deals",
  "daily_performance_summary",
  "compliance_expiring",
] as const;
export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

export function isNotificationEventType(
  value: unknown
): value is NotificationEventType {
  return (
    typeof value === "string" &&
    (NOTIFICATION_EVENT_TYPES as readonly string[]).includes(value)
  );
}

/** Starred events: at least one channel must stay on (enforced in Chunk 39). */
export const MANDATORY_NOTIFICATION_EVENTS = [
  "integration_sync_failing",
  "deal_auto_paused",
  "attestation_due",
  "booking_link_broken",
  "compliance_expiring",
] as const satisfies readonly NotificationEventType[];

export type NotificationChannels = {
  email: boolean;
  sms: boolean;
  inApp: boolean;
};

/** Defaults when a user joins an operator (spec §6.4 / Chunk 39). */
export const DEFAULT_NOTIFICATION_PREFERENCES: Record<
  NotificationEventType,
  NotificationChannels
> = {
  integration_sync_failing: { email: true, sms: true, inApp: true },
  deal_auto_paused: { email: true, sms: false, inApp: true },
  attestation_due: { email: true, sms: true, inApp: false },
  booking_link_broken: { email: true, sms: false, inApp: true },
  deal_review_update: { email: true, sms: false, inApp: true },
  deal_lifecycle: { email: false, sms: false, inApp: true },
  auto_rule_created_deals: { email: false, sms: false, inApp: true },
  daily_performance_summary: { email: true, sms: false, inApp: false },
  compliance_expiring: { email: true, sms: false, inApp: false },
};

// ---------------------------------------------------------------------------
// Platform deal regions (tourism destinations — deals Deal.region)
// Distinct from official NZ admin regions in web/lib/regions.ts.
// ---------------------------------------------------------------------------

export const PLATFORM_REGIONS = [
  "Auckland",
  "Northland",
  "Waikato",
  "Bay of Plenty",
  "Rotorua",
  "Taupō",
  "Hawke's Bay",
  "Wellington",
  "Nelson Tasman",
  "Marlborough",
  "Canterbury",
  "West Coast",
  "Otago",
  "Queenstown",
  "Southland",
] as const;
export type PlatformRegion = (typeof PLATFORM_REGIONS)[number];

export function isPlatformRegion(value: unknown): value is PlatformRegion {
  return (
    typeof value === "string" &&
    (PLATFORM_REGIONS as readonly string[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// Billing account status (Chunk 8 table; not in Chunk 1 enum list)
// ---------------------------------------------------------------------------

export const BILLING_ACCOUNT_STATUSES = [
  "active",
  "past_due",
  "cancelled",
  "none",
] as const;
export type BillingAccountStatus = (typeof BILLING_ACCOUNT_STATUSES)[number];

export function isBillingAccountStatus(
  value: unknown
): value is BillingAccountStatus {
  return (
    typeof value === "string" &&
    (BILLING_ACCOUNT_STATUSES as readonly string[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type NotificationPreference = {
  id: string;
  userId: string;
  operatorId: string;
  eventType: NotificationEventType;
  email: boolean;
  sms: boolean;
  inApp: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ComplianceDocument = {
  id: string;
  operatorId: string;
  docType: ComplianceDocType;
  file: string;
  issuer: string | null;
  referenceNumber: string | null;
  issuedOn: string | null;
  expiresOn: string | null;
  reviewStatus: ReviewStatus;
  reviewerNotes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BillingAccount = {
  id: string;
  operatorId: string;
  plan: string;
  billingModel: BillingModel;
  commissionPct: number | null;
  billingEmail: string | null;
  /** Provider payment-method pointer — never card data; strip for clients */
  paymentMethodRef: string | null;
  status: BillingAccountStatus;
  createdAt: string;
  updatedAt: string;
};

/** Public API shape — payment_method_ref omitted. */
export type PublicBillingAccount = Omit<BillingAccount, "paymentMethodRef">;

export const BILLING_SECRET_FIELDS = [
  "paymentMethodRef",
  "payment_method_ref",
] as const;

// ---------------------------------------------------------------------------
// Serializers
// ---------------------------------------------------------------------------

export function serializeBillingAccount(
  account: BillingAccount
): PublicBillingAccount {
  const { paymentMethodRef: _ref, ...safe } = account;
  return safe;
}

export function stripBillingSecrets<T extends Record<string, unknown>>(
  row: T
): Omit<T, "payment_method_ref" | "paymentMethodRef"> {
  const {
    payment_method_ref: _a,
    paymentMethodRef: _b,
    ...rest
  } = row as T & {
    payment_method_ref?: unknown;
    paymentMethodRef?: unknown;
  };
  return rest;
}

// ---------------------------------------------------------------------------
// Field validation
// ---------------------------------------------------------------------------

export type SettingsFieldError = { field: string; message: string };

export function validateNotificationPreferenceFields(
  input: Partial<{
    eventType: unknown;
    email: unknown;
    sms: unknown;
    inApp: unknown;
  }>
): SettingsFieldError[] {
  const errors: SettingsFieldError[] = [];

  if (
    input.eventType !== undefined &&
    !isNotificationEventType(input.eventType)
  ) {
    errors.push({
      field: "event_type",
      message: `must be one of: ${NOTIFICATION_EVENT_TYPES.join(", ")}`,
    });
  }
  for (const [field, value] of [
    ["email", input.email],
    ["sms", input.sms],
    ["in_app", input.inApp],
  ] as const) {
    if (value !== undefined && typeof value !== "boolean") {
      errors.push({ field, message: "must be a boolean" });
    }
  }
  return errors;
}

export function validateComplianceDocumentFields(
  input: Partial<{
    docType: unknown;
    file: unknown;
    issuer: unknown;
    referenceNumber: unknown;
    issuedOn: unknown;
    expiresOn: unknown;
    reviewStatus: unknown;
    reviewerNotes: unknown;
  }>
): SettingsFieldError[] {
  const errors: SettingsFieldError[] = [];

  if (input.docType !== undefined && !isComplianceDocType(input.docType)) {
    errors.push({ field: "doc_type", message: "invalid compliance_doc_type" });
  }
  if (input.file !== undefined) {
    if (typeof input.file !== "string" || input.file.trim().length < 1) {
      errors.push({ field: "file", message: "storage key required" });
    }
  }
  if (
    input.reviewStatus !== undefined &&
    !isReviewStatus(input.reviewStatus)
  ) {
    errors.push({ field: "review_status", message: "invalid review_status" });
  }
  return errors;
}

export function validateBillingAccountFields(
  input: Partial<{
    plan: unknown;
    billingModel: unknown;
    commissionPct: unknown;
    billingEmail: unknown;
    status: unknown;
  }>
): SettingsFieldError[] {
  const errors: SettingsFieldError[] = [];

  if (input.plan !== undefined) {
    if (typeof input.plan !== "string" || input.plan.trim().length < 1) {
      errors.push({ field: "plan", message: "required" });
    } else if (input.plan.length > 80) {
      errors.push({ field: "plan", message: "max 80 characters" });
    }
  }
  if (
    input.billingModel !== undefined &&
    !isBillingModel(input.billingModel)
  ) {
    errors.push({ field: "billing_model", message: "invalid billing_model" });
  }
  if (input.commissionPct !== undefined && input.commissionPct !== null) {
    const n = input.commissionPct;
    if (typeof n !== "number" || Number.isNaN(n) || n < 0 || n > 100) {
      errors.push({
        field: "commission_pct",
        message: "must be 0–100",
      });
    }
  }
  if (
    input.status !== undefined &&
    !isBillingAccountStatus(input.status)
  ) {
    errors.push({ field: "status", message: "invalid billing account status" });
  }
  if (input.billingEmail !== undefined && input.billingEmail !== null) {
    if (
      typeof input.billingEmail !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.billingEmail)
    ) {
      errors.push({ field: "billing_email", message: "invalid email" });
    }
  }
  return errors;
}

/**
 * Build default NotificationPreference rows for a user joining an operator.
 */
export function buildDefaultNotificationPreferences(
  userId: string,
  operatorId: string,
  options?: { now?: string; idFor?: (eventType: NotificationEventType) => string }
): NotificationPreference[] {
  const now = options?.now ?? new Date().toISOString();
  return NOTIFICATION_EVENT_TYPES.map((eventType) => {
    const channels = DEFAULT_NOTIFICATION_PREFERENCES[eventType];
    return {
      id: options?.idFor?.(eventType) ?? crypto.randomUUID(),
      userId,
      operatorId,
      eventType,
      email: channels.email,
      sms: channels.sms,
      inApp: channels.inApp,
      createdAt: now,
      updatedAt: now,
    };
  });
}
