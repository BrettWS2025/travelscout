/**
 * Inventory Deal (deals platform Chunk 3).
 * Table: marketplace.operator_deals
 * (not marketplace.deals — that is the legacy org-scoped lightweight feed).
 *
 * Field-level validation runs on every save. Publish required-ness is Chunk 16.
 * Status / pause_* are system-owned — only transitionDeal / applyAutoPause /
 * clearAutoPause may change them (see deal-status.ts). Client PATCH paths must
 * call stripSystemOwnedDealFields / applyClientDealFieldPatch so status,
 * pause_reason and pause_detail are ignored.
 */

import { validateBookingDestinationFields } from "./booking-destination";
import type {
  BookingDestinationType,
  CancellationPolicyType,
  CapacityMode,
  Category,
  DealStatus,
  DealType,
  DiscountInputMode,
  DiscountMechanism,
  FitnessLevel,
  LinkStatus,
  PauseReason,
  SourceProvider,
} from "./enums";
import {
  isBookingDestinationType,
  isCancellationPolicyType,
  isCapacityMode,
  isCategory,
  isDealStatus,
  isDealType,
  isDiscountInputMode,
  isDiscountMechanism,
  isFitnessLevel,
  isLinkStatus,
  isPauseReason,
  isSourceProvider,
} from "./enums";

// ---------------------------------------------------------------------------
// Domain type
// ---------------------------------------------------------------------------

export type Deal = {
  id: string;
  operatorId: string;
  dealType: DealType;
  sourceProvider: SourceProvider;
  integrationId: string | null;
  externalProductId: string | null;
  dealRuleId: string | null;
  status: DealStatus;
  pauseReason: PauseReason | null;
  pauseDetail: string | null;
  title: string | null;
  slug: string;
  summary: string | null;
  description: string | null;
  category: Category | null;
  tags: string[];
  highlights: string[];
  inclusions: string[];
  exclusions: string[];
  whatToBring: string[];
  durationMinutes: number | null;
  durationLabel: string | null;
  locationName: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  region: string | null;
  meetingPointNotes: string | null;
  pickupAvailable: boolean;
  pickupNotes: string | null;
  minAge: number | null;
  ageNotes: string | null;
  fitnessLevel: FitnessLevel | null;
  wheelchairAccessible: boolean | null;
  accessibilityNotes: string | null;
  languages: string[];
  weatherDependent: boolean | null;
  weatherNotes: string | null;
  cancellationPolicyType: CancellationPolicyType | null;
  cancellationPolicyText: string | null;
  importantInfo: string | null;
  overriddenFields: string[];
  currency: string | null;
  discountMechanism: DiscountMechanism | null;
  promoCode: string | null;
  discountInputMode: DiscountInputMode;
  steppedDiscountEnabled: boolean;
  capacityMode: CapacityMode | null;
  seatCap: number | null;
  minBookingQty: number | null;
  maxBookingQty: number | null;
  bookingDestinationType: BookingDestinationType | null;
  bookingUrl: string | null;
  bookingPhone: string | null;
  bookingEmail: string | null;
  bookingInstructions: string | null;
  appendTrackingParams: boolean;
  linkStatus: LinkStatus;
  linkLastCheckedAt: string | null;
  linkConsecutiveFailures: number;
  publishAt: string | null;
  salesCutoffMinutes: number | null;
  lastAttestedAt: string | null;
  attestationExpiresAt: string | null;
  publishedAt: string | null;
  endedAt: string | null;
  firstPublishedAt: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Partial input accepted by the field-level validator / save path. */
export type DealFieldInput = {
  dealType?: DealType | null;
  sourceProvider?: SourceProvider | null;
  integrationId?: string | null;
  externalProductId?: string | null;
  dealRuleId?: string | null;
  /** System-owned; validated if present but clients must not set (Chunk 11). */
  status?: DealStatus | null;
  pauseReason?: PauseReason | null;
  pauseDetail?: string | null;
  title?: string | null;
  slug?: string | null;
  summary?: string | null;
  description?: string | null;
  category?: Category | null;
  tags?: string[] | null;
  highlights?: string[] | null;
  inclusions?: string[] | null;
  exclusions?: string[] | null;
  whatToBring?: string[] | null;
  durationMinutes?: number | null;
  durationLabel?: string | null;
  locationName?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  region?: string | null;
  meetingPointNotes?: string | null;
  pickupAvailable?: boolean | null;
  pickupNotes?: string | null;
  minAge?: number | null;
  ageNotes?: string | null;
  fitnessLevel?: FitnessLevel | null;
  wheelchairAccessible?: boolean | null;
  accessibilityNotes?: string | null;
  languages?: string[] | null;
  weatherDependent?: boolean | null;
  weatherNotes?: string | null;
  cancellationPolicyType?: CancellationPolicyType | null;
  cancellationPolicyText?: string | null;
  importantInfo?: string | null;
  overriddenFields?: string[] | null;
  currency?: string | null;
  discountMechanism?: DiscountMechanism | null;
  promoCode?: string | null;
  discountInputMode?: DiscountInputMode | null;
  steppedDiscountEnabled?: boolean | null;
  capacityMode?: CapacityMode | null;
  seatCap?: number | null;
  minBookingQty?: number | null;
  maxBookingQty?: number | null;
  bookingDestinationType?: BookingDestinationType | null;
  bookingUrl?: string | null;
  bookingPhone?: string | null;
  bookingEmail?: string | null;
  bookingInstructions?: string | null;
  appendTrackingParams?: boolean | null;
  linkStatus?: LinkStatus | null;
  /** Schedule publish for later (null = immediate when approved). */
  publishAt?: string | null;
  salesCutoffMinutes?: number | null;
};

export type FieldError = { field: string; message: string };

export class DealValidationError extends Error {
  readonly errors: FieldError[];

  constructor(errors: FieldError[]) {
    super(errors.map((e) => `${e.field}: ${e.message}`).join("; "));
    this.name = "DealValidationError";
    this.errors = errors;
  }
}

// ---------------------------------------------------------------------------
// Constants (field limits — not platform config)
// ---------------------------------------------------------------------------

export const DEAL_FIELD_LIMITS = {
  titleMin: 10,
  titleMax: 80,
  summaryMin: 20,
  summaryMax: 160,
  descriptionMin: 100,
  descriptionMax: 5000,
  tagsMax: 10,
  highlightsMax: 6,
  highlightItemMax: 80,
  listItemMax: 15,
  durationMinutesMin: 15,
  durationMinutesMax: 20160,
  meetingPointNotesMax: 500,
  pickupNotesMax: 500,
  accessibilityNotesMax: 500,
  minAgeMin: 0,
  minAgeMax: 99,
  cancellationPolicyTextMax: 1000,
  importantInfoMax: 1000,
  promoCodeMin: 3,
  promoCodeMax: 30,
  currencyLength: 3,
  seatCapMin: 1,
  seatCapMax: 999,
  bookingInstructionsMax: 300,
  salesCutoffMinutesMin: 0,
  salesCutoffMinutesMax: 1440,
} as const;

/** Promo / quote codes: 3–30 chars, A–Z 0–9 _ - only. */
export const PROMO_CODE_REGEX = /^[A-Z0-9_-]+$/;

/** ISO 639-1 language code. */
export const ISO_639_1_REGEX = /^[a-z]{2}$/;

/** Tags allowed in deal description rich text (bold, lists, links, paragraphs). */
const ALLOWED_DESCRIPTION_TAGS = new Set([
  "b",
  "strong",
  "ul",
  "ol",
  "li",
  "a",
  "p",
  "br",
]);

// ---------------------------------------------------------------------------
// Description: sanitize + plain-text length
// ---------------------------------------------------------------------------

/**
 * Strip HTML to plain text for length checks.
 */
export function plainTextFromHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|div|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Allow only bold, lists, links (and p/br). Strips other tags/attributes
 * except safe href on <a>. Call on every save before persisting.
 */
export function sanitizeDealDescription(html: string): string {
  // Normalize void/self-closing br
  let out = html.replace(/<br\s*\/?>/gi, "<br>");

  // Remove disallowed tags, keep allowed ones (rewrite to drop attrs except a.href)
  out = out.replace(
    /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g,
    (full, rawName: string, attrs: string) => {
      const name = rawName.toLowerCase();
      const closing = full.startsWith("</");

      if (!ALLOWED_DESCRIPTION_TAGS.has(name)) {
        return "";
      }

      if (name === "br") {
        return closing ? "" : "<br>";
      }

      if (closing) {
        return `</${name}>`;
      }

      if (name === "a") {
        const hrefMatch = attrs.match(
          /\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i
        );
        const href = (hrefMatch?.[2] ?? hrefMatch?.[3] ?? hrefMatch?.[4] ?? "")
          .trim();
        if (!isSafeHref(href)) {
          return "";
        }
        const escaped = href.replace(/"/g, "&quot;");
        return `<a href="${escaped}">`;
      }

      return `<${name}>`;
    }
  );

  return out;
}

function isSafeHref(href: string): boolean {
  if (!href) return false;
  const lower = href.trim().toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("data:")) {
    return false;
  }
  return (
    lower.startsWith("https://") ||
    lower.startsWith("http://") ||
    lower.startsWith("mailto:") ||
    lower.startsWith("/") ||
    lower.startsWith("#")
  );
}

// ---------------------------------------------------------------------------
// Field-level validator
// ---------------------------------------------------------------------------

function pushLength(
  errors: FieldError[],
  field: string,
  value: string | null | undefined,
  min: number,
  max: number,
  opts?: { plainText?: boolean }
): void {
  if (value == null) return;
  const measured = opts?.plainText ? plainTextFromHtml(value) : value;
  if (measured.length < min || measured.length > max) {
    errors.push({
      field,
      message: `must be ${min}–${max} characters`,
    });
  }
}

function pushMaxLength(
  errors: FieldError[],
  field: string,
  value: string | null | undefined,
  max: number
): void {
  if (value == null) return;
  if (value.length > max) {
    errors.push({ field, message: `must be ≤ ${max} characters` });
  }
}

function pushStringArray(
  errors: FieldError[],
  field: string,
  values: string[] | null | undefined,
  maxItems: number,
  itemMaxLength?: number
): void {
  if (values == null) return;
  if (values.length > maxItems) {
    errors.push({ field, message: `must have at most ${maxItems} items` });
  }
  if (itemMaxLength != null) {
    values.forEach((item, i) => {
      if (item.length > itemMaxLength) {
        errors.push({
          field: `${field}[${i}]`,
          message: `must be ≤ ${itemMaxLength} characters`,
        });
      }
    });
  }
}

function pushIntRange(
  errors: FieldError[],
  field: string,
  value: number | null | undefined,
  min: number,
  max: number
): void {
  if (value == null) return;
  if (!Number.isInteger(value) || value < min || value > max) {
    errors.push({
      field,
      message: `must be an integer ${min}–${max}`,
    });
  }
}

/**
 * Field-level validator for Deal saves (create/update).
 * Null/omitted publish-required fields are allowed (drafts).
 * Returns `{ field, message }` errors; does not throw.
 */
export function validateDealFields(input: DealFieldInput): FieldError[] {
  const errors: FieldError[] = [];
  const L = DEAL_FIELD_LIMITS;

  if (input.dealType !== undefined && input.dealType !== null) {
    if (!isDealType(input.dealType)) {
      errors.push({ field: "deal_type", message: "invalid value" });
    }
  }
  if (input.sourceProvider !== undefined && input.sourceProvider !== null) {
    if (!isSourceProvider(input.sourceProvider)) {
      errors.push({ field: "source_provider", message: "invalid value" });
    }
  }
  if (input.status !== undefined && input.status !== null) {
    if (!isDealStatus(input.status)) {
      errors.push({ field: "status", message: "invalid value" });
    }
  }
  if (input.pauseReason !== undefined && input.pauseReason !== null) {
    if (!isPauseReason(input.pauseReason)) {
      errors.push({ field: "pause_reason", message: "invalid value" });
    }
  }

  pushLength(errors, "title", input.title, L.titleMin, L.titleMax);
  pushLength(errors, "summary", input.summary, L.summaryMin, L.summaryMax);

  if (input.description != null) {
    const sanitized = sanitizeDealDescription(input.description);
    pushLength(errors, "description", sanitized, L.descriptionMin, L.descriptionMax, {
      plainText: true,
    });
  }

  if (input.category !== undefined && input.category !== null) {
    if (!isCategory(input.category)) {
      errors.push({ field: "category", message: "invalid value" });
    }
  }

  pushStringArray(errors, "tags", input.tags, L.tagsMax);
  pushStringArray(
    errors,
    "highlights",
    input.highlights,
    L.highlightsMax,
    L.highlightItemMax
  );
  pushStringArray(errors, "inclusions", input.inclusions, L.listItemMax);
  pushStringArray(errors, "exclusions", input.exclusions, L.listItemMax);
  pushStringArray(errors, "what_to_bring", input.whatToBring, L.listItemMax);

  pushIntRange(
    errors,
    "duration_minutes",
    input.durationMinutes,
    L.durationMinutesMin,
    L.durationMinutesMax
  );

  pushMaxLength(
    errors,
    "meeting_point_notes",
    input.meetingPointNotes,
    L.meetingPointNotesMax
  );
  pushMaxLength(errors, "pickup_notes", input.pickupNotes, L.pickupNotesMax);
  pushMaxLength(
    errors,
    "accessibility_notes",
    input.accessibilityNotes,
    L.accessibilityNotesMax
  );
  pushMaxLength(
    errors,
    "cancellation_policy_text",
    input.cancellationPolicyText,
    L.cancellationPolicyTextMax
  );
  pushMaxLength(
    errors,
    "important_info",
    input.importantInfo,
    L.importantInfoMax
  );
  pushMaxLength(
    errors,
    "booking_instructions",
    input.bookingInstructions,
    L.bookingInstructionsMax
  );

  pushIntRange(errors, "min_age", input.minAge, L.minAgeMin, L.minAgeMax);
  pushIntRange(errors, "seat_cap", input.seatCap, L.seatCapMin, L.seatCapMax);
  pushIntRange(
    errors,
    "sales_cutoff_minutes",
    input.salesCutoffMinutes,
    L.salesCutoffMinutesMin,
    L.salesCutoffMinutesMax
  );

  if (input.latitude != null) {
    if (
      typeof input.latitude !== "number" ||
      Number.isNaN(input.latitude) ||
      input.latitude < -90 ||
      input.latitude > 90
    ) {
      errors.push({ field: "latitude", message: "must be between -90 and 90" });
    }
  }
  if (input.longitude != null) {
    if (
      typeof input.longitude !== "number" ||
      Number.isNaN(input.longitude) ||
      input.longitude < -180 ||
      input.longitude > 180
    ) {
      errors.push({
        field: "longitude",
        message: "must be between -180 and 180",
      });
    }
  }

  if (input.fitnessLevel !== undefined && input.fitnessLevel !== null) {
    if (!isFitnessLevel(input.fitnessLevel)) {
      errors.push({ field: "fitness_level", message: "invalid value" });
    }
  }
  if (
    input.cancellationPolicyType !== undefined &&
    input.cancellationPolicyType !== null
  ) {
    if (!isCancellationPolicyType(input.cancellationPolicyType)) {
      errors.push({
        field: "cancellation_policy_type",
        message: "invalid value",
      });
    }
  }
  if (
    input.discountMechanism !== undefined &&
    input.discountMechanism !== null
  ) {
    if (!isDiscountMechanism(input.discountMechanism)) {
      errors.push({ field: "discount_mechanism", message: "invalid value" });
    }
  }
  if (
    input.discountInputMode !== undefined &&
    input.discountInputMode !== null
  ) {
    if (!isDiscountInputMode(input.discountInputMode)) {
      errors.push({ field: "discount_input_mode", message: "invalid value" });
    }
  }
  if (input.capacityMode !== undefined && input.capacityMode !== null) {
    if (!isCapacityMode(input.capacityMode)) {
      errors.push({ field: "capacity_mode", message: "invalid value" });
    }
  }
  if (
    input.bookingDestinationType !== undefined &&
    input.bookingDestinationType !== null
  ) {
    if (!isBookingDestinationType(input.bookingDestinationType)) {
      errors.push({
        field: "booking_destination_type",
        message: "invalid value",
      });
    }
  }

  // Chunk 15: booking_url https; booking_phone E.164; booking_email format
  errors.push(
    ...validateBookingDestinationFields({
      bookingDestinationType: input.bookingDestinationType,
      bookingUrl: input.bookingUrl,
      bookingPhone: input.bookingPhone,
      bookingEmail: input.bookingEmail,
    }).filter((e) => e.field !== "booking_destination_type")
  );

  if (input.linkStatus !== undefined && input.linkStatus !== null) {
    if (!isLinkStatus(input.linkStatus)) {
      errors.push({ field: "link_status", message: "invalid value" });
    }
  }

  if (input.currency != null) {
    if (
      typeof input.currency !== "string" ||
      input.currency.length !== L.currencyLength ||
      !/^[A-Z]{3}$/.test(input.currency)
    ) {
      errors.push({
        field: "currency",
        message: "must be a 3-letter ISO 4217 code",
      });
    }
  }

  if (input.promoCode != null) {
    if (
      input.promoCode.length < L.promoCodeMin ||
      input.promoCode.length > L.promoCodeMax
    ) {
      errors.push({
        field: "promo_code",
        message: `must be ${L.promoCodeMin}–${L.promoCodeMax} characters`,
      });
    } else if (!PROMO_CODE_REGEX.test(input.promoCode)) {
      errors.push({
        field: "promo_code",
        message: "must match ^[A-Z0-9_-]+$",
      });
    }
  }

  if (input.languages != null) {
    input.languages.forEach((lang, i) => {
      if (!ISO_639_1_REGEX.test(lang)) {
        errors.push({
          field: `languages[${i}]`,
          message: "must be an ISO 639-1 code (two lowercase letters)",
        });
      }
    });
  }

  if (
    input.minBookingQty != null &&
    (!Number.isInteger(input.minBookingQty) || input.minBookingQty < 1)
  ) {
    errors.push({
      field: "min_booking_qty",
      message: "must be an integer ≥ 1",
    });
  }
  if (
    input.maxBookingQty != null &&
    (!Number.isInteger(input.maxBookingQty) || input.maxBookingQty < 1)
  ) {
    errors.push({
      field: "max_booking_qty",
      message: "must be an integer ≥ 1",
    });
  }
  if (
    input.minBookingQty != null &&
    input.maxBookingQty != null &&
    Number.isInteger(input.minBookingQty) &&
    Number.isInteger(input.maxBookingQty) &&
    input.maxBookingQty < input.minBookingQty
  ) {
    errors.push({
      field: "max_booking_qty",
      message: "must be ≥ min_booking_qty",
    });
  }

  return errors;
}

/**
 * Sanitize description (when present) then run field validation.
 * Throws DealValidationError when invalid.
 */
export function assertValidDealFields(input: DealFieldInput): DealFieldInput {
  const next: DealFieldInput = { ...input };
  if (typeof next.description === "string") {
    next.description = sanitizeDealDescription(next.description);
  }
  const errors = validateDealFields(next);
  if (errors.length) throw new DealValidationError(errors);
  return next;
}
