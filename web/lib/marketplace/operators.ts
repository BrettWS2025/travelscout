/**
 * Operator, booking defaults and team membership (deals platform Chunk 2).
 * Tables: marketplace.operators, operator_booking_defaults, team_members.
 *
 * Status/owner rules that later chunks will call live here — never only in the UI.
 */

import {
  isE164Phone,
  isHttpsUrl,
  isValidBookingEmail,
  validateBookingDestinationFields,
} from "./booking-destination";
import {
  ATTESTATION_REMINDER_HOURS,
  DEFAULT_CURRENCY,
  DEFAULT_TIMEZONE,
  MIN_DISCOUNT_PCT,
  getPlatformConfig,
} from "./config";
import { ISO_639_1_REGEX } from "./deal";
import type {
  AccountStatus,
  BookingDestinationType,
  CancellationPolicyType,
  DiscountMechanism,
  InviteStatus,
  UserRole,
} from "./enums";
import {
  INTEGRATED_MECHANISMS,
  MANUAL_MECHANISMS,
  isAccountStatus,
  isBookingDestinationType,
  isCancellationPolicyType,
  isDiscountMechanism,
  isInviteStatus,
  isUserRole,
} from "./enums";
import { isPlatformRegion } from "./settings";

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type Operator = {
  id: string;
  legalName: string;
  tradingName: string;
  slug: string;
  logo?: string;
  coverImage?: string;
  shortDescription?: string;
  longDescription?: string;
  website?: string;
  publicEmail?: string;
  publicPhone?: string;
  internalEmail?: string;
  internalPhone?: string;
  address?: string;
  regionsServed: string[];
  timezone: string;
  currency: string;
  languages: string[];
  gstNumber?: string;
  nzbn?: string;
  socialLinks: Record<string, unknown>;
  accountStatus: AccountStatus;
  requiresManualReview: boolean;
  createdAt: string;
  updatedAt: string;
};

export type OperatorBookingDefaults = {
  id: string;
  operatorId: string;
  defaultSalesCutoffMinutes: number;
  defaultSeatCap: number | null;
  defaultDiscountPct: number;
  defaultDiscountMechanism: DiscountMechanism;
  defaultBookingDestinationType: BookingDestinationType;
  defaultBookingUrl?: string;
  defaultBookingPhone?: string;
  defaultBookingEmail?: string;
  defaultBookingInstructions?: string;
  defaultCancellationPolicyType: CancellationPolicyType;
  defaultCancellationPolicyText?: string;
  defaultAttestationReminderHours: number;
  createdAt: string;
  updatedAt: string;
};

export type TeamMember = {
  id: string;
  operatorId: string;
  userId: string | null;
  role: UserRole;
  invitedEmail: string;
  inviteStatus: InviteStatus;
  invitedAt: string;
  lastActiveAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateOperatorInput = {
  legalName: string;
  tradingName: string;
  slug: string;
  logo?: string;
  coverImage?: string;
  shortDescription?: string;
  longDescription?: string;
  website?: string;
  publicEmail?: string;
  publicPhone?: string;
  internalEmail?: string;
  internalPhone?: string;
  address?: string;
  regionsServed?: string[];
  timezone?: string;
  currency?: string;
  languages?: string[];
  gstNumber?: string;
  nzbn?: string;
  socialLinks?: Record<string, unknown>;
  accountStatus?: AccountStatus;
  /** Admin-only; default false. */
  requiresManualReview?: boolean;
};

export type SeedOperatorWithOwnerInput = CreateOperatorInput & {
  ownerUserId: string;
  ownerEmail: string;
};

export type FieldError = { field: string; message: string };

export class OperatorValidationError extends Error {
  readonly errors: FieldError[];

  constructor(errors: FieldError[]) {
    super(errors.map((e) => `${e.field}: ${e.message}`).join("; "));
    this.name = "OperatorValidationError";
    this.errors = errors;
  }
}

export class LastOwnerError extends Error {
  constructor(message = "Operator must have at least one accepted owner") {
    super(message);
    this.name = "LastOwnerError";
  }
}

// ---------------------------------------------------------------------------
// Validation helpers (Chunk 38)
// ---------------------------------------------------------------------------

/** True when the string is a valid IANA timezone (Intl accepts it). */
export function isValidIanaTimezone(value: string): boolean {
  const tz = value.trim();
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/** ISO 4217: three uppercase letters (same rule as Deal.currency). */
export function isIso4217Currency(value: string): boolean {
  return /^[A-Z]{3}$/.test(value.trim());
}

/**
 * Discount mechanism must be usable for at least one deal type
 * (integrated or manual set).
 */
export function isMechanismValidForAnyDealType(
  mechanism: DiscountMechanism
): boolean {
  return (
    (INTEGRATED_MECHANISMS as readonly string[]).includes(mechanism) ||
    (MANUAL_MECHANISMS as readonly string[]).includes(mechanism)
  );
}

export const BOOKING_DEFAULTS_NOTE =
  "Changes apply to new deals only" as const;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateOperatorFields(input: CreateOperatorInput): FieldError[] {
  const errors: FieldError[] = [];

  if (!input.legalName?.trim()) {
    errors.push({ field: "legal_name", message: "required" });
  }
  if (!input.tradingName?.trim()) {
    errors.push({ field: "trading_name", message: "required" });
  }
  if (!input.slug?.trim()) {
    errors.push({ field: "slug", message: "required" });
  }
  if (
    input.shortDescription != null &&
    input.shortDescription.length > 160
  ) {
    errors.push({
      field: "short_description",
      message: "must be ≤ 160 characters",
    });
  }
  if (
    input.longDescription != null &&
    input.longDescription.length > 3000
  ) {
    errors.push({
      field: "long_description",
      message: "must be ≤ 3,000 characters",
    });
  }
  if (
    input.accountStatus != null &&
    !isAccountStatus(input.accountStatus)
  ) {
    errors.push({ field: "account_status", message: "invalid value" });
  }

  if (input.website != null && input.website !== "") {
    if (!isHttpsUrl(input.website)) {
      errors.push({ field: "website", message: "must be an https URL" });
    }
  }
  if (input.logo != null && input.logo !== "") {
    if (!isHttpsUrl(input.logo)) {
      errors.push({ field: "logo", message: "must be an https URL" });
    }
  }
  if (input.coverImage != null && input.coverImage !== "") {
    if (!isHttpsUrl(input.coverImage)) {
      errors.push({ field: "cover_image", message: "must be an https URL" });
    }
  }

  for (const [field, value] of [
    ["public_email", input.publicEmail],
    ["internal_email", input.internalEmail],
  ] as const) {
    if (value != null && value !== "") {
      if (!isValidBookingEmail(value)) {
        errors.push({ field, message: "must be a valid email" });
      }
    }
  }

  for (const [field, value] of [
    ["public_phone", input.publicPhone],
    ["internal_phone", input.internalPhone],
  ] as const) {
    if (value != null && value !== "") {
      if (!isE164Phone(value)) {
        errors.push({
          field,
          message: "must be E.164 (e.g. +6421234567)",
        });
      }
    }
  }

  if (input.timezone != null) {
    if (!isValidIanaTimezone(input.timezone)) {
      errors.push({
        field: "timezone",
        message: "must be a valid IANA timezone",
      });
    }
  }

  if (input.currency != null) {
    if (!isIso4217Currency(input.currency)) {
      errors.push({
        field: "currency",
        message: "must be a 3-letter ISO 4217 code",
      });
    }
  }

  if (input.languages != null) {
    input.languages.forEach((lang, i) => {
      if (typeof lang !== "string" || !ISO_639_1_REGEX.test(lang)) {
        errors.push({
          field: `languages[${i}]`,
          message: "must be an ISO 639-1 code (two lowercase letters)",
        });
      }
    });
  }

  if (input.regionsServed != null) {
    input.regionsServed.forEach((region, i) => {
      if (!isPlatformRegion(region)) {
        errors.push({
          field: `regions_served[${i}]`,
          message: "must be a platform region",
        });
      }
    });
  }

  if (input.socialLinks != null) {
    if (
      typeof input.socialLinks !== "object" ||
      Array.isArray(input.socialLinks)
    ) {
      errors.push({ field: "social_links", message: "must be an object" });
    } else {
      for (const [key, value] of Object.entries(input.socialLinks)) {
        if (value == null || value === "") continue;
        if (typeof value !== "string" || !isHttpsUrl(value)) {
          errors.push({
            field: `social_links.${key}`,
            message: "must be an https URL",
          });
        }
      }
    }
  }

  return errors;
}

export function validateBookingDefaultsPatch(
  patch: Partial<Omit<OperatorBookingDefaults, "id" | "operatorId" | "createdAt" | "updatedAt">>
): FieldError[] {
  const errors: FieldError[] = [];
  const { MIN_DISCOUNT_PCT: minDiscount } = getPlatformConfig();

  if (patch.defaultSalesCutoffMinutes != null) {
    const n = patch.defaultSalesCutoffMinutes;
    if (!Number.isInteger(n) || n < 0 || n > 1440) {
      errors.push({
        field: "default_sales_cutoff_minutes",
        message: "must be an integer 0–1440",
      });
    }
  }
  if (patch.defaultSeatCap !== undefined && patch.defaultSeatCap !== null) {
    const n = patch.defaultSeatCap;
    if (!Number.isInteger(n) || n < 1 || n > 999) {
      errors.push({
        field: "default_seat_cap",
        message: "must be an integer 1–999 or null",
      });
    }
  }
  if (patch.defaultDiscountPct != null) {
    if (
      typeof patch.defaultDiscountPct !== "number" ||
      Number.isNaN(patch.defaultDiscountPct) ||
      patch.defaultDiscountPct < minDiscount ||
      patch.defaultDiscountPct > 100
    ) {
      errors.push({
        field: "default_discount_pct",
        message: `must be ≥ ${minDiscount} and ≤ 100`,
      });
    }
  }
  if (patch.defaultDiscountMechanism != null) {
    if (!isDiscountMechanism(patch.defaultDiscountMechanism)) {
      errors.push({
        field: "default_discount_mechanism",
        message: "invalid value",
      });
    } else if (
      !isMechanismValidForAnyDealType(patch.defaultDiscountMechanism)
    ) {
      errors.push({
        field: "default_discount_mechanism",
        message: "must be valid for at least one deal type",
      });
    }
  }
  if (
    patch.defaultBookingDestinationType != null &&
    !isBookingDestinationType(patch.defaultBookingDestinationType)
  ) {
    errors.push({
      field: "default_booking_destination_type",
      message: "invalid value",
    });
  }
  if (
    patch.defaultCancellationPolicyType != null &&
    !isCancellationPolicyType(patch.defaultCancellationPolicyType)
  ) {
    errors.push({
      field: "default_cancellation_policy_type",
      message: "invalid value",
    });
  }
  if (
    patch.defaultBookingInstructions != null &&
    patch.defaultBookingInstructions.length > 300
  ) {
    errors.push({
      field: "default_booking_instructions",
      message: "must be ≤ 300 characters",
    });
  }
  if (
    patch.defaultCancellationPolicyText != null &&
    patch.defaultCancellationPolicyText.length > 1000
  ) {
    errors.push({
      field: "default_cancellation_policy_text",
      message: "must be ≤ 1,000 characters",
    });
  }

  if (patch.defaultAttestationReminderHours != null) {
    const n = patch.defaultAttestationReminderHours;
    if (!Number.isInteger(n) || n < 1 || n > 24) {
      errors.push({
        field: "default_attestation_reminder_hours",
        message: "must be an integer 1–24",
      });
    }
  }

  errors.push(
    ...validateBookingDestinationFields({
      bookingDestinationType: patch.defaultBookingDestinationType,
      bookingUrl: patch.defaultBookingUrl,
      bookingPhone: patch.defaultBookingPhone,
      bookingEmail: patch.defaultBookingEmail,
    }).map((e) => ({
      field:
        e.field === "booking_destination_type"
          ? "default_booking_destination_type"
          : e.field === "booking_url"
            ? "default_booking_url"
            : e.field === "booking_phone"
              ? "default_booking_phone"
              : e.field === "booking_email"
                ? "default_booking_email"
                : e.field,
      message: e.message,
    }))
  );

  return errors;
}

// ---------------------------------------------------------------------------
// Owner rule (used by later team/settings chunks)
// ---------------------------------------------------------------------------

/** True when the set includes at least one accepted owner. */
export function hasAcceptedOwner(members: readonly TeamMember[]): boolean {
  return members.some(
    (m) => m.role === "owner" && m.inviteStatus === "accepted"
  );
}

/**
 * Enforce: an operator must always have at least one accepted owner.
 * Call after any team mutation that could remove or demote an owner.
 */
export function ensureAcceptedOwner(members: readonly TeamMember[]): void {
  if (!hasAcceptedOwner(members)) {
    throw new LastOwnerError();
  }
}

/**
 * Apply a role/status change in memory and enforce the owner rule.
 * Returns the next member list when the change is allowed.
 */
export function applyTeamMemberChange(
  members: readonly TeamMember[],
  memberId: string,
  change: Partial<Pick<TeamMember, "role" | "inviteStatus">>
): TeamMember[] {
  const idx = members.findIndex((m) => m.id === memberId);
  if (idx < 0) {
    throw new Error(`Team member not found: ${memberId}`);
  }
  if (change.role != null && !isUserRole(change.role)) {
    throw new OperatorValidationError([
      { field: "role", message: "invalid value" },
    ]);
  }
  if (change.inviteStatus != null && !isInviteStatus(change.inviteStatus)) {
    throw new OperatorValidationError([
      { field: "invite_status", message: "invalid value" },
    ]);
  }

  const next = members.map((m, i) =>
    i === idx ? { ...m, ...change, updatedAt: new Date().toISOString() } : m
  );
  ensureAcceptedOwner(next);
  return next;
}

export function removeTeamMember(
  members: readonly TeamMember[],
  memberId: string
): TeamMember[] {
  const next = members.filter((m) => m.id !== memberId);
  if (next.length === members.length) {
    throw new Error(`Team member not found: ${memberId}`);
  }
  ensureAcceptedOwner(next);
  return next;
}

// ---------------------------------------------------------------------------
// Defaults factory (mirrors DB trigger marketplace.create_operator_booking_defaults)
// ---------------------------------------------------------------------------

export function buildDefaultBookingDefaults(
  operatorId: string,
  now: string = new Date().toISOString(),
  id: string = crypto.randomUUID()
): OperatorBookingDefaults {
  const config = getPlatformConfig();
  return {
    id,
    operatorId,
    defaultSalesCutoffMinutes: 0,
    defaultSeatCap: null,
    defaultDiscountPct: config.MIN_DISCOUNT_PCT,
    defaultDiscountMechanism: "manual_price",
    defaultBookingDestinationType: "operator_website",
    defaultCancellationPolicyType: "operator_standard",
    defaultAttestationReminderHours: config.ATTESTATION_REMINDER_HOURS,
    createdAt: now,
    updatedAt: now,
  };
}

function buildOperator(
  input: CreateOperatorInput,
  now: string,
  id: string
): Operator {
  const config = getPlatformConfig();
  return {
    id,
    legalName: input.legalName.trim(),
    tradingName: input.tradingName.trim(),
    slug: input.slug.trim(),
    logo: input.logo,
    coverImage: input.coverImage,
    shortDescription: input.shortDescription,
    longDescription: input.longDescription,
    website: input.website,
    publicEmail: input.publicEmail,
    publicPhone: input.publicPhone,
    internalEmail: input.internalEmail,
    internalPhone: input.internalPhone,
    address: input.address,
    regionsServed: input.regionsServed ?? [],
    timezone: input.timezone ?? config.DEFAULT_TIMEZONE,
    currency: input.currency ?? config.DEFAULT_CURRENCY,
    languages: input.languages ?? [],
    gstNumber: input.gstNumber,
    nzbn: input.nzbn,
    socialLinks: input.socialLinks ?? {},
    accountStatus: input.accountStatus ?? "pending_verification",
    requiresManualReview: input.requiresManualReview ?? false,
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// In-memory store (unit tests / seed helpers; DB path comes in later chunks)
// ---------------------------------------------------------------------------

export type OperatorStore = {
  operators: Map<string, Operator>;
  bookingDefaults: Map<string, OperatorBookingDefaults>;
  teamMembers: Map<string, TeamMember>;
};

export function createOperatorStore(): OperatorStore {
  return {
    operators: new Map(),
    bookingDefaults: new Map(),
    teamMembers: new Map(),
  };
}

/**
 * Create an operator and automatically insert OperatorBookingDefaults
 * (same behaviour as the DB AFTER INSERT trigger).
 */
export function createOperator(
  store: OperatorStore,
  input: CreateOperatorInput,
  options?: { id?: string; now?: string }
): { operator: Operator; defaults: OperatorBookingDefaults } {
  const errors = validateOperatorFields(input);
  if (errors.length) throw new OperatorValidationError(errors);

  const slug = input.slug.trim();
  for (const existing of store.operators.values()) {
    if (existing.slug === slug) {
      throw new OperatorValidationError([
        { field: "slug", message: "must be unique" },
      ]);
    }
  }

  const now = options?.now ?? new Date().toISOString();
  const id = options?.id ?? crypto.randomUUID();
  const operator = buildOperator(input, now, id);
  const defaults = buildDefaultBookingDefaults(id, now);

  store.operators.set(id, operator);
  store.bookingDefaults.set(id, defaults);

  return { operator, defaults };
}

/**
 * Seed helper: create operator + auto defaults + accepted owner.
 * Matches Chunk 2 "Test it" / Chunk 8 seed shape.
 */
export function seedOperatorWithOwner(
  store: OperatorStore,
  input: SeedOperatorWithOwnerInput,
  options?: { id?: string; now?: string; memberId?: string }
): {
  operator: Operator;
  defaults: OperatorBookingDefaults;
  owner: TeamMember;
} {
  const { ownerUserId, ownerEmail, ...operatorInput } = input;
  const { operator, defaults } = createOperator(store, operatorInput, options);

  const now = options?.now ?? operator.createdAt;
  const owner: TeamMember = {
    id: options?.memberId ?? crypto.randomUUID(),
    operatorId: operator.id,
    userId: ownerUserId,
    role: "owner",
    invitedEmail: ownerEmail.trim().toLowerCase(),
    inviteStatus: "accepted",
    invitedAt: now,
    lastActiveAt: now,
    createdAt: now,
    updatedAt: now,
  };

  store.teamMembers.set(owner.id, owner);
  ensureAcceptedOwner([owner]);

  return { operator, defaults, owner };
}

export function listTeamMembers(
  store: OperatorStore,
  operatorId: string
): TeamMember[] {
  return [...store.teamMembers.values()].filter(
    (m) => m.operatorId === operatorId
  );
}

export function getBookingDefaults(
  store: OperatorStore,
  operatorId: string
): OperatorBookingDefaults | null {
  return store.bookingDefaults.get(operatorId) ?? null;
}

/**
 * Admin-only toggle: when true, every publish goes to pending_review (Chunk 17).
 */
export function setOperatorRequiresManualReview(
  store: OperatorStore,
  operatorId: string,
  on: boolean,
  options?: { now?: string }
): Operator {
  const existing = store.operators.get(operatorId);
  if (!existing) {
    throw new OperatorValidationError([
      { field: "operator_id", message: "not found" },
    ]);
  }
  const now = options?.now ?? new Date().toISOString();
  const updated: Operator = {
    ...existing,
    requiresManualReview: on,
    updatedAt: now,
  };
  store.operators.set(operatorId, updated);
  return updated;
}

/** Compile-time / docs anchor: platform defaults used when building booking defaults. */
export const OPERATOR_PLATFORM_DEFAULTS = {
  MIN_DISCOUNT_PCT,
  DEFAULT_TIMEZONE,
  DEFAULT_CURRENCY,
  ATTESTATION_REMINDER_HOURS,
} as const;
