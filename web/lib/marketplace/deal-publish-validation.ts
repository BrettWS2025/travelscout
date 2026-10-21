/**
 * Publish validation engine (deals platform Chunk 16).
 *
 * `validateForPublish` → `{ ok, checks[], hasSessionWithinLeadHours? }` for the
 * editor checklist, publish actions and auto-resume.
 *
 * Spec: docs/deals-spec.md §4.1. Constants via getPlatformConfig().
 */

import {
  isE164Phone,
  isHttpsUrl,
  isUrlBookingDestination,
  isValidBookingEmail,
} from "./booking-destination";
import {
  checkLink,
  type EvidenceUrlCheckRecord,
  type FetchLike,
  type LinkCheckResult,
} from "./booking-link";
import { getPlatformConfig } from "./config";
import type { DealDraftStore } from "./deal-draft";
import {
  DEAL_FIELD_LIMITS,
  ISO_639_1_REGEX,
  PROMO_CODE_REGEX,
  plainTextFromHtml,
  type Deal,
} from "./deal";
import { parseProviderPriceOptions } from "./deal-integrated";
import {
  parseSeparateProductRef,
} from "./deal-integrated-pricing-shared";
import { listDealMedia, type DealMedia } from "./deal-media";
import type {
  DealPriceOption,
  DealSession,
  DiscountStep,
} from "./deal-session";
import type {
  PublishValidationCheck,
  PublishValidationResult,
  ValidateForPublishFn,
} from "./deal-status";
import type { ExternalProduct, ExternalSession, Integration } from "./integration";
import {
  isIntegratedDealType,
  isManualDealType,
} from "./enums";
import { meetsMinDiscount, validateSteps } from "./pricing";
import {
  isPlatformRegion,
  type ComplianceDocument,
} from "./settings";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const EDITOR_STEPS = [
  "type",
  "content",
  "images",
  "pricing",
  "availability",
  "destination",
  "review",
] as const;
export type EditorStep = (typeof EDITOR_STEPS)[number];

/** Re-check booking URL when link_status is unchecked or last check older than this. */
export const LINK_CHECK_STALE_MS = 6 * 60 * 60 * 1000;

/** Default required compliance docs when ENFORCE_COMPLIANCE_ON_PUBLISH. */
export const REQUIRED_COMPLIANCE_DOC_TYPES = [
  "public_liability_insurance",
] as const;

export type PublishValidationCheckKeyed = PublishValidationCheck & {
  key: string;
  label: string;
  passed: boolean;
  message?: string;
  editorStep: EditorStep;
};

export type PublishValidationOutcome = PublishValidationResult & {
  checks: PublishValidationCheckKeyed[];
  /**
   * True when at least one sellable session starts within MAX_LEAD_HOURS.
   * Used by Chunk 17 to choose live vs scheduled. Undefined if session_timing
   * could not evaluate (e.g. missing cutoff).
   */
  hasSessionWithinLeadHours?: boolean;
};

export type ValidateForPublishContext = {
  sessions: DealSession[];
  priceOptions: DealPriceOption[];
  discountSteps: DiscountStep[];
  media: DealMedia[];
  now?: string;
  /**
   * Operator confirmed seats for this publish (Chunk 17 `{attest:true}`).
   * Also passes when a current attestation_expires_at is still in the future.
   */
  attested?: boolean;
  /** Cached evidence URL reachability from booking-link store. */
  evidenceUrlChecks?:
    | Map<string, EvidenceUrlCheckRecord>
    | Iterable<EvidenceUrlCheckRecord>;
  /** Operator compliance docs (optional ENFORCE_COMPLIANCE_ON_PUBLISH check). */
  complianceDocuments?: ComplianceDocument[];
  /**
   * When booking link is unchecked/stale, call to refresh. Return the check
   * result; callers may also update deal.link_* on the store.
   */
  refreshBookingLink?: (deal: Deal) => Promise<LinkCheckResult | null>;
  /**
   * When evidence URL has no cached ok result, probe reachability.
   * Defaults to checkLink when fetchFn is provided via store helper.
   */
  checkEvidenceUrl?: (url: string) => Promise<LinkCheckResult>;
  fetchFn?: FetchLike;
  /** Chunk 35: integration row for integrated publish checks. */
  integration?: Integration | null;
  /** Chunk 35: linked ExternalProduct for integrated publish checks. */
  externalProduct?: ExternalProduct | null;
  /** Chunk 35: ExternalSession rows keyed by id (for session_available). */
  externalSessionsById?: Map<string, ExternalSession>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function check(
  key: string,
  label: string,
  passed: boolean,
  editorStep: EditorStep,
  message?: string
): PublishValidationCheckKeyed {
  return {
    key,
    label,
    passed,
    editorStep,
    ...(message != null ? { message } : {}),
  };
}

function nonEmptyString(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function evidenceMapFromContext(
  checks: ValidateForPublishContext["evidenceUrlChecks"]
): Map<string, EvidenceUrlCheckRecord> {
  const map = new Map<string, EvidenceUrlCheckRecord>();
  if (!checks) return map;
  if (checks instanceof Map) return checks;
  for (const row of checks) map.set(row.priceOptionId, row);
  return map;
}

function descriptionPlainLength(description: string | null): number {
  if (description == null) return 0;
  return plainTextFromHtml(description).trim().length;
}

/**
 * Session is still sellable when start_at − sales_cutoff_minutes is in the future.
 */
export function isSessionSellableAt(
  session: Pick<DealSession, "startAt">,
  salesCutoffMinutes: number,
  nowMs: number
): boolean {
  const startMs = Date.parse(session.startAt);
  if (!Number.isFinite(startMs)) return false;
  const cutoffMs = startMs - salesCutoffMinutes * 60_000;
  return cutoffMs > nowMs;
}

/**
 * True when a sellable session starts within MAX_LEAD_HOURS from now.
 */
export function hasSellableSessionWithinLeadHours(
  sessions: DealSession[],
  salesCutoffMinutes: number,
  nowIso: string,
  maxLeadHours: number = getPlatformConfig().MAX_LEAD_HOURS
): boolean {
  const nowMs = Date.parse(nowIso);
  const leadMs = maxLeadHours * 60 * 60 * 1000;
  for (const session of sessions) {
    if (!isSessionSellableAt(session, salesCutoffMinutes, nowMs)) continue;
    const startMs = Date.parse(session.startAt);
    if (startMs - nowMs <= leadMs) return true;
  }
  return false;
}

function isLinkFresh(
  deal: Deal,
  nowMs: number
): boolean {
  if (deal.linkStatus !== "ok") return false;
  if (!deal.linkLastCheckedAt) return false;
  const checkedMs = Date.parse(deal.linkLastCheckedAt);
  if (!Number.isFinite(checkedMs)) return false;
  return nowMs - checkedMs <= LINK_CHECK_STALE_MS;
}

function docNotExpired(
  doc: ComplianceDocument,
  nowMs: number
): boolean {
  if (!doc.expiresOn) return true;
  const exp = Date.parse(doc.expiresOn);
  if (!Number.isFinite(exp)) return false;
  // expires_on is a date; treat end of that UTC day as still valid
  return exp + 24 * 60 * 60 * 1000 - 1 >= nowMs;
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

function checkRequiredFields(
  deal: Deal,
  priceOptions: DealPriceOption[]
): PublishValidationCheckKeyed {
  const missing: string[] = [];
  const L = DEAL_FIELD_LIMITS;

  if (
    !nonEmptyString(deal.title) ||
    (deal.title?.length ?? 0) < L.titleMin ||
    (deal.title?.length ?? 0) > L.titleMax
  ) {
    missing.push("title");
  }
  if (
    !nonEmptyString(deal.summary) ||
    (deal.summary?.length ?? 0) < L.summaryMin ||
    (deal.summary?.length ?? 0) > L.summaryMax
  ) {
    missing.push("summary");
  }
  const descLen = descriptionPlainLength(deal.description);
  if (descLen < L.descriptionMin || descLen > L.descriptionMax) {
    missing.push("description");
  }
  if (deal.category == null) missing.push("category");
  if (!nonEmptyString(deal.locationName)) missing.push("location_name");
  if (!nonEmptyString(deal.address)) missing.push("address");
  if (deal.latitude == null || deal.longitude == null) {
    missing.push("latitude/longitude");
  }
  if (!nonEmptyString(deal.region) || !isPlatformRegion(deal.region)) {
    missing.push("region");
  }
  if (
    !deal.languages?.length ||
    !deal.languages.every((l) => ISO_639_1_REGEX.test(l))
  ) {
    missing.push("languages");
  }
  if (deal.cancellationPolicyType == null) {
    missing.push("cancellation_policy_type");
  } else if (
    deal.cancellationPolicyType === "custom" &&
    !nonEmptyString(deal.cancellationPolicyText)
  ) {
    missing.push("cancellation_policy_text");
  }
  if (
    !nonEmptyString(deal.currency) ||
    deal.currency!.length !== L.currencyLength
  ) {
    missing.push("currency");
  }
  if (deal.discountMechanism == null) missing.push("discount_mechanism");
  if (deal.discountInputMode == null) missing.push("discount_input_mode");
  if (deal.capacityMode == null) missing.push("capacity_mode");
  if (deal.bookingDestinationType == null) {
    missing.push("booking_destination_type");
  } else if (isUrlBookingDestination(deal.bookingDestinationType)) {
    if (!nonEmptyString(deal.bookingUrl) || !isHttpsUrl(deal.bookingUrl!)) {
      missing.push("booking_url");
    }
  } else if (deal.bookingDestinationType === "phone") {
    if (!nonEmptyString(deal.bookingPhone) || !isE164Phone(deal.bookingPhone!)) {
      missing.push("booking_phone");
    }
  } else if (deal.bookingDestinationType === "email") {
    if (
      !nonEmptyString(deal.bookingEmail) ||
      !isValidBookingEmail(deal.bookingEmail!)
    ) {
      missing.push("booking_email");
    }
  }
  if (deal.salesCutoffMinutes == null) missing.push("sales_cutoff_minutes");
  if (priceOptions.length < 1) missing.push("price_options");

  if (deal.dealType !== "manual_open_window") {
    if (
      deal.durationMinutes == null ||
      deal.durationMinutes < L.durationMinutesMin ||
      deal.durationMinutes > L.durationMinutesMax
    ) {
      missing.push("duration_minutes");
    }
  }
  if (deal.pickupAvailable && !nonEmptyString(deal.pickupNotes)) {
    missing.push("pickup_notes");
  }
  if (
    deal.discountMechanism === "promo_code" ||
    deal.discountMechanism === "quote_code"
  ) {
    if (
      !nonEmptyString(deal.promoCode) ||
      (deal.promoCode?.length ?? 0) < L.promoCodeMin ||
      (deal.promoCode?.length ?? 0) > L.promoCodeMax ||
      !PROMO_CODE_REGEX.test(deal.promoCode ?? "")
    ) {
      missing.push("promo_code");
    }
  }
  if (deal.capacityMode === "live_provider_capped") {
    if (
      deal.seatCap == null ||
      deal.seatCap < L.seatCapMin ||
      deal.seatCap > L.seatCapMax
    ) {
      missing.push("seat_cap");
    }
  }

  const passed = missing.length === 0;
  const step: EditorStep = (() => {
    if (!passed) {
      const destFields = [
        "booking_destination_type",
        "booking_url",
        "booking_phone",
        "booking_email",
      ];
      if (missing.some((f) => destFields.includes(f))) return "destination";
      if (
        missing.some((f) =>
          ["price_options", "discount_mechanism", "discount_input_mode", "promo_code", "currency"].includes(
            f
          )
        )
      ) {
        return "pricing";
      }
      if (
        missing.some((f) =>
          ["sales_cutoff_minutes", "duration_minutes", "seat_cap", "capacity_mode"].includes(
            f
          )
        )
      ) {
        return "availability";
      }
    }
    return "content";
  })();

  return check(
    "required_fields",
    "Required fields",
    passed,
    step,
    passed
      ? "All required fields are present"
      : `Missing or invalid: ${missing.join(", ")}`
  );
}

function checkMinDiscount(
  priceOptions: DealPriceOption[],
  discountSteps: DiscountStep[]
): PublishValidationCheckKeyed {
  if (priceOptions.length === 0) {
    return check(
      "min_discount",
      "Minimum discount",
      false,
      "pricing",
      "Add at least one price option"
    );
  }

  const problems: string[] = [];
  const { MIN_DISCOUNT_PCT } = getPlatformConfig();

  for (const opt of priceOptions) {
    if (!meetsMinDiscount(opt.originalPriceMinor, opt.dealPriceMinor)) {
      problems.push(
        `${opt.label || opt.id}: deal price must meet ${MIN_DISCOUNT_PCT}% off`
      );
    }
    const steps = discountSteps
      .filter((s) => s.priceOptionId === opt.id)
      .map((s) => ({
        hoursBeforeStart: s.hoursBeforeStart,
        dealPriceMinor: s.dealPriceMinor,
        promoCode: s.promoCode,
      }))
      .sort((a, b) => b.hoursBeforeStart - a.hoursBeforeStart);
    if (steps.length > 0) {
      const stepErrors = validateSteps(steps, {
        originalPriceMinor: opt.originalPriceMinor,
        dealPriceMinor: opt.dealPriceMinor,
      });
      for (const err of stepErrors) {
        problems.push(`${opt.label || opt.id}: ${err.message}`);
      }
    }
  }

  const passed = problems.length === 0;
  return check(
    "min_discount",
    "Minimum discount",
    passed,
    "pricing",
    passed
      ? `All prices meet the ${MIN_DISCOUNT_PCT}% minimum`
      : problems.slice(0, 5).join("; ")
  );
}

function checkImages(media: DealMedia[]): PublishValidationCheckKeyed {
  const images = media.filter((m) => m.mediaType === "image");
  const problems: string[] = [];

  if (images.length < 1) {
    problems.push("at least one image is required");
  }
  const covers = images.filter((m) => m.isCover);
  if (images.length > 0 && covers.length !== 1) {
    problems.push(
      covers.length === 0
        ? "exactly one cover image is required"
        : "only one cover image is allowed"
    );
  }
  for (const img of images) {
    if (!nonEmptyString(img.altText) || img.altText.trim().length < 5) {
      problems.push(`image ${img.id} needs alt text (5–150 chars)`);
      break;
    }
  }

  const passed = problems.length === 0;
  return check(
    "images",
    "Images",
    passed,
    "images",
    passed ? "Cover image and alt text look good" : problems.join("; ")
  );
}

function checkSessionTiming(
  deal: Deal,
  sessions: DealSession[],
  nowIso: string
): {
  check: PublishValidationCheckKeyed;
  hasSessionWithinLeadHours?: boolean;
} {
  const cutoff = deal.salesCutoffMinutes;
  if (cutoff == null) {
    return {
      check: check(
        "session_timing",
        "Session timing",
        false,
        "availability",
        "Set sales cutoff minutes first"
      ),
    };
  }

  const nowMs = Date.parse(nowIso);
  const sellable = sessions.filter((s) =>
    isSessionSellableAt(s, cutoff, nowMs)
  );

  if (sellable.length < 1) {
    return {
      check: check(
        "session_timing",
        "Session timing",
        false,
        "availability",
        "Need at least one session with start − sales cutoff still in the future"
      ),
      hasSessionWithinLeadHours: false,
    };
  }

  const withinLead = hasSellableSessionWithinLeadHours(
    sessions,
    cutoff,
    nowIso
  );
  const { MAX_LEAD_HOURS } = getPlatformConfig();
  return {
    check: check(
      "session_timing",
      "Session timing",
      true,
      "availability",
      withinLead
        ? `At least one session starts within ${MAX_LEAD_HOURS} h (can go live)`
        : `Sessions are beyond ${MAX_LEAD_HOURS} h (will schedule)`
    ),
    hasSessionWithinLeadHours: withinLead,
  };
}

async function checkBookingDestination(
  deal: Deal,
  ctx: ValidateForPublishContext,
  nowIso: string
): Promise<PublishValidationCheckKeyed> {
  const type = deal.bookingDestinationType;
  if (type == null) {
    return check(
      "booking_destination",
      "Booking destination",
      false,
      "destination",
      "Choose a booking destination type"
    );
  }

  if (type === "phone") {
    const ok =
      nonEmptyString(deal.bookingPhone) && isE164Phone(deal.bookingPhone!);
    return check(
      "booking_destination",
      "Booking destination",
      ok,
      "destination",
      ok ? "Phone number is valid" : "booking_phone must be E.164 (e.g. +6421234567)"
    );
  }

  if (type === "email") {
    const ok =
      nonEmptyString(deal.bookingEmail) &&
      isValidBookingEmail(deal.bookingEmail!);
    return check(
      "booking_destination",
      "Booking destination",
      ok,
      "destination",
      ok ? "Email is valid" : "booking_email must be a valid email"
    );
  }

  if (!isUrlBookingDestination(type)) {
    return check(
      "booking_destination",
      "Booking destination",
      false,
      "destination",
      "Unknown booking destination type"
    );
  }

  if (!nonEmptyString(deal.bookingUrl) || !isHttpsUrl(deal.bookingUrl!)) {
    return check(
      "booking_destination",
      "Booking destination",
      false,
      "destination",
      "booking_url must be an https URL"
    );
  }

  const nowMs = Date.parse(nowIso);

  if (isLinkFresh(deal, nowMs)) {
    return check(
      "booking_destination",
      "Booking destination",
      true,
      "destination",
      "Booking URL is reachable"
    );
  }

  // Unchecked, broken, or stale — refresh when a probe is available
  let probed: LinkCheckResult | null = null;
  if (ctx.refreshBookingLink) {
    probed = await ctx.refreshBookingLink(deal);
  } else if (ctx.fetchFn) {
    probed = await checkLink(deal.bookingUrl!, { fetchFn: ctx.fetchFn });
  }

  if (probed?.ok) {
    return check(
      "booking_destination",
      "Booking destination",
      true,
      "destination",
      "Booking URL is reachable"
    );
  }

  if (probed && !probed.ok) {
    return check(
      "booking_destination",
      "Booking destination",
      false,
      "destination",
      probed.error
        ? `Booking URL unreachable: ${probed.error}`
        : "Booking URL is broken — fix the link and use Test link"
    );
  }

  // No probe available — use stored status
  if (deal.linkStatus === "ok") {
    return check(
      "booking_destination",
      "Booking destination",
      true,
      "destination",
      "Booking URL previously checked ok"
    );
  }

  return check(
    "booking_destination",
    "Booking destination",
    false,
    "destination",
    deal.linkStatus === "broken"
      ? "Booking URL is broken — fix the link and use Test link"
      : "Booking URL has not been checked (or check is stale) — use Test link"
  );
}

async function checkPriceEvidence(
  priceOptions: DealPriceOption[],
  ctx: ValidateForPublishContext
): Promise<PublishValidationCheckKeyed> {
  if (priceOptions.length === 0) {
    return check(
      "price_evidence",
      "Price evidence",
      false,
      "pricing",
      "Add price options with evidence URLs"
    );
  }

  const evidence = evidenceMapFromContext(ctx.evidenceUrlChecks);
  const problems: string[] = [];

  for (const opt of priceOptions) {
    const url = opt.originalPriceEvidenceUrl;
    if (!nonEmptyString(url) || !isHttpsUrl(url!)) {
      problems.push(`${opt.label || opt.id}: evidence URL required (https)`);
      continue;
    }

    let record = evidence.get(opt.id);
    if (
      !record ||
      record.url !== url ||
      !record.ok
    ) {
      if (ctx.checkEvidenceUrl) {
        const result = await ctx.checkEvidenceUrl(url!);
        record = {
          priceOptionId: opt.id,
          dealId: opt.dealId,
          url: url!,
          checkedAt: ctx.now ?? new Date().toISOString(),
          ok: result.ok,
          status: result.status,
          error: result.error,
        };
      } else if (ctx.fetchFn) {
        const result = await checkLink(url!, { fetchFn: ctx.fetchFn });
        record = {
          priceOptionId: opt.id,
          dealId: opt.dealId,
          url: url!,
          checkedAt: ctx.now ?? new Date().toISOString(),
          ok: result.ok,
          status: result.status,
          error: result.error,
        };
      }
    }

    if (!record?.ok) {
      problems.push(
        `${opt.label || opt.id}: evidence URL not reachable` +
          (record?.error ? ` (${record.error})` : "")
      );
    }
  }

  const passed = problems.length === 0;
  return check(
    "price_evidence",
    "Price evidence",
    passed,
    "pricing",
    passed
      ? "Original price evidence URLs are reachable"
      : problems.slice(0, 5).join("; ")
  );
}

function checkSeatsEntered(
  sessions: DealSession[]
): PublishValidationCheckKeyed {
  const anySeats = sessions.some(
    (s) =>
      s.manualSeatsAvailable != null &&
      Number.isFinite(s.manualSeatsAvailable) &&
      s.manualSeatsAvailable > 0
  );
  return check(
    "seats_entered",
    "Seats entered",
    anySeats,
    "availability",
    anySeats
      ? "At least one session has seats available"
      : "Enter manual seats (> 0) on at least one session"
  );
}

function checkAttestation(
  deal: Deal,
  ctx: ValidateForPublishContext,
  nowIso: string
): PublishValidationCheckKeyed {
  const nowMs = Date.parse(nowIso);
  const expiresMs =
    deal.attestationExpiresAt != null
      ? Date.parse(deal.attestationExpiresAt)
      : NaN;
  const currentAttestation =
    Number.isFinite(expiresMs) && expiresMs > nowMs;

  const passed = ctx.attested === true || currentAttestation;
  return check(
    "attestation",
    "Attestation",
    passed,
    "review",
    passed
      ? currentAttestation && ctx.attested !== true
        ? "Current attestation is still valid"
        : "Seats attested for publish"
      : "Confirm seats are available and you will honour this price (required at publish)"
  );
}

// ---------------------------------------------------------------------------
// Integrated checks (Chunk 35)
// ---------------------------------------------------------------------------

function checkIntegrationHealthy(
  deal: Deal,
  ctx: ValidateForPublishContext,
  nowIso: string
): PublishValidationCheckKeyed {
  const integration = ctx.integration;
  if (!integration) {
    return check(
      "integration_healthy",
      "Integration healthy",
      false,
      "type",
      deal.integrationId
        ? "Integration not found"
        : "Deal has no linked integration"
    );
  }

  const staleMinutes = getPlatformConfig().SYNC_STALE_MINUTES;
  const nowMs = Date.parse(nowIso);
  const lastOkMs =
    integration.lastSuccessfulSyncAt != null
      ? Date.parse(integration.lastSuccessfulSyncAt)
      : NaN;
  const syncFresh =
    Number.isFinite(lastOkMs) &&
    nowMs - lastOkMs <= staleMinutes * 60_000;

  const connected = integration.status === "connected";
  const passed = connected && syncFresh;

  let message: string;
  if (passed) {
    message = "Integration connected and sync is fresh";
  } else if (!connected) {
    message = `Integration status is ${integration.status} (must be connected)`;
  } else if (!Number.isFinite(lastOkMs)) {
    message = "Integration has never synced successfully";
  } else {
    message = `Last successful sync is older than ${staleMinutes} minutes`;
  }

  return check(
    "integration_healthy",
    "Integration healthy",
    passed,
    "type",
    message
  );
}

function checkProductActive(
  deal: Deal,
  ctx: ValidateForPublishContext
): PublishValidationCheckKeyed {
  const product = ctx.externalProduct;
  if (!product) {
    return check(
      "product_active",
      "Product active",
      false,
      "type",
      deal.externalProductId
        ? "External product not found"
        : "Deal has no linked product"
    );
  }

  const enabled = product.isEnabledForDeals;
  const archived = product.archivedInProvider;
  const passed = enabled && !archived;

  let message: string;
  if (passed) {
    message = "Product is enabled and not archived";
  } else if (archived) {
    message = "Product is archived in the provider";
  } else {
    message = "Product is not enabled for deals";
  }

  return check("product_active", "Product active", passed, "type", message);
}

function checkOriginalPriceLocked(
  ctx: ValidateForPublishContext,
  priceOptions: DealPriceOption[]
): PublishValidationCheckKeyed {
  const product = ctx.externalProduct;
  if (!product) {
    return check(
      "original_price_locked",
      "Original price locked",
      false,
      "pricing",
      "Cannot verify originals without a linked product"
    );
  }

  const byExternalId = new Map(
    parseProviderPriceOptions(product).map(
      (p) => [p.external_id, p] as const
    )
  );
  const problems: string[] = [];

  for (const opt of priceOptions) {
    const label = opt.label || opt.id;
    if (!opt.externalPriceOptionId) {
      problems.push(`${label}: missing provider price option id`);
      continue;
    }
    const provider = byExternalId.get(opt.externalPriceOptionId);
    if (!provider) {
      problems.push(
        `${label}: provider option ${opt.externalPriceOptionId} not found`
      );
      continue;
    }
    if (provider.price_minor !== opt.originalPriceMinor) {
      problems.push(
        `${label}: original ${opt.originalPriceMinor} ≠ provider ${provider.price_minor}`
      );
    }
  }

  if (priceOptions.length === 0) {
    problems.push("No price options");
  }

  const passed = problems.length === 0;
  return check(
    "original_price_locked",
    "Original price locked",
    passed,
    "pricing",
    passed
      ? "Each original price matches the provider catalogue"
      : problems.slice(0, 5).join("; ")
  );
}

function checkDiscountInProvider(
  deal: Deal,
  ctx: ValidateForPublishContext,
  priceOptions: DealPriceOption[]
): PublishValidationCheckKeyed {
  if (deal.discountMechanism !== "price_option") {
    return check(
      "discount_in_provider",
      "Discount in provider",
      true,
      "pricing",
      "Not using price_option mechanism"
    );
  }

  const product = ctx.externalProduct;
  if (!product) {
    return check(
      "discount_in_provider",
      "Discount in provider",
      false,
      "pricing",
      "Cannot verify discount without a linked product"
    );
  }

  const byExternalId = new Map(
    parseProviderPriceOptions(product).map(
      (p) => [p.external_id, p] as const
    )
  );
  const problems: string[] = [];

  for (const opt of priceOptions) {
    const label = opt.label || opt.id;
    const dealOptId = opt.externalDealPriceOptionId;
    if (!dealOptId || parseSeparateProductRef(dealOptId)) {
      problems.push(`${label}: select a provider discounted price option`);
      continue;
    }
    const discounted = byExternalId.get(dealOptId);
    if (!discounted) {
      problems.push(
        `${label}: discounted option ${dealOptId} not found in provider`
      );
      continue;
    }
    if (discounted.price_minor !== opt.dealPriceMinor) {
      problems.push(
        `${label}: provider discount ${discounted.price_minor} ≠ deal price ${opt.dealPriceMinor}`
      );
    }
  }

  if (priceOptions.length === 0) {
    problems.push("No price options");
  }

  const passed = problems.length === 0;
  return check(
    "discount_in_provider",
    "Discount in provider",
    passed,
    "pricing",
    passed
      ? "Discounted provider options match deal prices"
      : problems.slice(0, 5).join("; ")
  );
}

function checkPromoCodeConfirmed(
  deal: Deal
): PublishValidationCheckKeyed {
  const mechanism = deal.discountMechanism;

  if (mechanism === "price_option") {
    return check(
      "promo_code_confirmed",
      "Promo code confirmed",
      true,
      "pricing",
      "Not using promo_code mechanism"
    );
  }

  if (mechanism !== "promo_code" && mechanism !== "separate_product") {
    return check(
      "promo_code_confirmed",
      "Promo code confirmed",
      false,
      "pricing",
      "Set an integrated discount mechanism"
    );
  }

  const verification = deal.discountVerification;
  const verified = verification?.status === "verified";
  const cannotVerify = verification?.status === "cannot_verify";
  const linkOk = deal.linkStatus === "ok";
  const operatorConfirmed = deal.promoCodeConfirmedByOperator === true;

  // Verified via provider API
  if (verified) {
    return check(
      "promo_code_confirmed",
      "Promo code confirmed",
      true,
      "pricing",
      "Discount verified in provider"
    );
  }

  // cannot_verify (or separate_product): operator confirm + Test link
  // Also allow confirm+link when status is not yet verified (Chunk 35).
  if (operatorConfirmed && linkOk) {
    return check(
      "promo_code_confirmed",
      "Promo code confirmed",
      true,
      "pricing",
      cannotVerify || mechanism === "separate_product"
        ? "Operator confirmed discount; booking link tested"
        : "Operator confirmed promo code; booking link tested"
    );
  }

  const problems: string[] = [];
  if (!verified) {
    if (verification == null) {
      problems.push("Run verify discount");
    } else if (verification.status === "not_found") {
      problems.push("Discount not found in provider");
    } else if (verification.status === "failed") {
      problems.push("Discount verification failed");
    } else if (cannotVerify || mechanism === "separate_product") {
      problems.push("Provider cannot verify — confirm manually");
    } else {
      problems.push(`Verification status is ${verification.status}`);
    }
  }
  if (!operatorConfirmed && (cannotVerify || mechanism === "separate_product" || !verified)) {
    if (!problems.some((p) => /confirm/i.test(p))) {
      problems.push("Tick promo code / discount confirmation");
    }
  }
  if (!linkOk) {
    problems.push("Run Test link successfully (link_status must be ok)");
  }

  return check(
    "promo_code_confirmed",
    "Promo code confirmed",
    false,
    "pricing",
    problems.slice(0, 4).join("; ")
  );
}

function sessionHasProviderSeats(session: DealSession): boolean {
  const seats =
    session.providerSeatsAvailable != null &&
    Number.isFinite(session.providerSeatsAvailable)
      ? session.providerSeatsAvailable
      : session.seatsDisplayed;
  return seats > 0;
}

function checkSessionAvailable(
  deal: Deal,
  ctx: ValidateForPublishContext,
  sessions: DealSession[]
): PublishValidationCheckKeyed {
  if (sessions.length === 0) {
    return check(
      "session_available",
      "Session available",
      false,
      "availability",
      "Select at least one provider session"
    );
  }

  const extMap = ctx.externalSessionsById ?? new Map<string, ExternalSession>();
  const available: DealSession[] = [];
  const problems: string[] = [];

  for (const session of sessions) {
    if (!session.externalSessionId) {
      problems.push(`Session ${session.id}: missing external_session_id`);
      continue;
    }
    const ext = extMap.get(session.externalSessionId);
    if (!ext) {
      problems.push(`Session ${session.id}: provider session not found`);
      continue;
    }
    if (ext.status === "cancelled" || session.status === "cancelled") {
      problems.push(`Session ${session.id}: cancelled in provider`);
      continue;
    }
    if (!sessionHasProviderSeats(session) && (ext.seatsAvailable ?? 0) <= 0) {
      problems.push(`Session ${session.id}: no seats available`);
      continue;
    }
    available.push(session);
  }

  const needAll = deal.dealType === "integrated_session";
  const passed = needAll
    ? available.length === sessions.length && available.length >= 1
    : available.length >= 1;

  let message: string;
  if (passed) {
    message =
      available.length === 1
        ? "Selected provider session is available"
        : `${available.length} selected provider sessions are available`;
  } else if (needAll) {
    message =
      problems[0] ??
      "The selected provider session must exist, not be cancelled, and have seats";
  } else {
    message =
      problems.length > 0
        ? `No sellable sessions; ${problems.slice(0, 3).join("; ")}`
        : "At least one selected provider session must have seats";
  }

  return check(
    "session_available",
    "Session available",
    passed,
    "availability",
    message
  );
}

function integratedPublishChecks(
  deal: Deal,
  ctx: ValidateForPublishContext,
  nowIso: string
): PublishValidationCheckKeyed[] {
  return [
    checkIntegrationHealthy(deal, ctx, nowIso),
    checkProductActive(deal, ctx),
    checkOriginalPriceLocked(ctx, ctx.priceOptions),
    checkDiscountInProvider(deal, ctx, ctx.priceOptions),
    checkPromoCodeConfirmed(deal),
    checkSessionAvailable(deal, ctx, ctx.sessions),
  ];
}

function checkCompliance(
  docs: ComplianceDocument[] | undefined,
  nowIso: string
): PublishValidationCheckKeyed | null {
  if (!getPlatformConfig().ENFORCE_COMPLIANCE_ON_PUBLISH) return null;

  const nowMs = Date.parse(nowIso);
  const problems: string[] = [];
  for (const docType of REQUIRED_COMPLIANCE_DOC_TYPES) {
    const match = (docs ?? []).find(
      (d) => d.docType === docType && docNotExpired(d, nowMs)
    );
    if (!match) {
      problems.push(`${docType} missing or expired`);
    }
  }

  const passed = problems.length === 0;
  return check(
    "compliance",
    "Compliance documents",
    passed,
    "review",
    passed
      ? "Required compliance documents are on file"
      : problems.join("; ")
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Run all publish checks for a deal and related children.
 * Does not mutate status; may call refreshBookingLink / checkEvidenceUrl.
 */
export async function validateForPublish(
  deal: Deal,
  ctx: ValidateForPublishContext
): Promise<PublishValidationOutcome> {
  const now = ctx.now ?? new Date().toISOString();
  const checks: PublishValidationCheckKeyed[] = [];

  checks.push(checkRequiredFields(deal, ctx.priceOptions));
  checks.push(checkMinDiscount(ctx.priceOptions, ctx.discountSteps));
  checks.push(checkImages(ctx.media));

  const timing = checkSessionTiming(deal, ctx.sessions, now);
  checks.push(timing.check);

  checks.push(await checkBookingDestination(deal, ctx, now));

  if (isManualDealType(deal.dealType)) {
    checks.push(await checkPriceEvidence(ctx.priceOptions, ctx));
    checks.push(checkSeatsEntered(ctx.sessions));
    checks.push(checkAttestation(deal, ctx, now));
  }

  if (isIntegratedDealType(deal.dealType)) {
    checks.push(...integratedPublishChecks(deal, ctx, now));
  }

  const compliance = checkCompliance(ctx.complianceDocuments, now);
  if (compliance) checks.push(compliance);

  const ok = checks.every((c) => c.passed);
  return {
    ok,
    checks,
    hasSessionWithinLeadHours: timing.hasSessionWithinLeadHours,
  };
}

/**
 * Gather children from a draft store and run validateForPublish.
 * Optionally refreshes stale booking links via checkLink (updates link_* only;
 * does not auto-pause — that stays in runLinkCheck).
 */
export async function validateDealInStore(
  store: DealDraftStore & {
    evidenceUrlChecks?: Map<string, EvidenceUrlCheckRecord>;
  },
  dealId: string,
  options?: {
    now?: string;
    attested?: boolean;
    fetchFn?: FetchLike;
    complianceDocuments?: ComplianceDocument[];
    /** When true (default), probe unchecked/stale booking URLs. */
    refreshStaleLinks?: boolean;
  }
): Promise<PublishValidationOutcome> {
  const deal = store.deals.get(dealId);
  if (!deal) {
    return {
      ok: false,
      checks: [
        check(
          "required_fields",
          "Required fields",
          false,
          "content",
          `Deal ${dealId} not found`
        ),
      ],
    };
  }

  const now = options?.now ?? new Date().toISOString();
  const sessions = [...store.sessions.values()]
    .filter((s) => s.dealId === dealId)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  const priceOptions = [...store.priceOptions.values()]
    .filter((p) => p.dealId === dealId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const discountSteps = [...store.discountSteps.values()].filter(
    (s) => s.dealId === dealId
  );
  const media = listDealMedia(store.media, dealId);

  const refreshStale = options?.refreshStaleLinks !== false;

  const integration =
    deal.integrationId && store.integrations
      ? (store.integrations.get(deal.integrationId) ?? null)
      : null;
  const externalProduct =
    deal.externalProductId && store.externalProducts
      ? (store.externalProducts.get(deal.externalProductId) ?? null)
      : null;
  const externalSessionsById = store.externalSessions
    ? new Map(store.externalSessions)
    : new Map();

  const ctx: ValidateForPublishContext = {
    sessions,
    priceOptions,
    discountSteps,
    media,
    now,
    attested: options?.attested,
    evidenceUrlChecks: store.evidenceUrlChecks,
    complianceDocuments: options?.complianceDocuments,
    fetchFn: options?.fetchFn,
    integration,
    externalProduct,
    externalSessionsById,
    refreshBookingLink: refreshStale
      ? async (d) => {
          if (!d.bookingUrl) return null;
          const result = await checkLink(d.bookingUrl, {
            fetchFn: options?.fetchFn,
          });
          const updated: Deal = {
            ...d,
            linkStatus: result.ok ? "ok" : "broken",
            linkLastCheckedAt: now,
            linkConsecutiveFailures: result.ok
              ? 0
              : d.linkConsecutiveFailures + 1,
            updatedAt: now,
          };
          store.deals.set(d.id, updated);
          return result;
        }
      : undefined,
    checkEvidenceUrl: options?.fetchFn
      ? (url) => checkLink(url, { fetchFn: options.fetchFn })
      : undefined,
  };

  return validateForPublish(deal, ctx);
}

/**
 * Build a ValidateForPublishFn closed over a store (for clearAutoPause /
 * inventory live-confirm injection).
 */
export function createValidateForPublishFromStore(
  store: DealDraftStore & {
    evidenceUrlChecks?: Map<string, EvidenceUrlCheckRecord>;
  },
  options?: {
    now?: string;
    attested?: boolean;
    fetchFn?: FetchLike;
    complianceDocuments?: ComplianceDocument[];
    refreshStaleLinks?: boolean;
  }
): ValidateForPublishFn {
  return async (deal: Deal) =>
    validateDealInStore(store, deal.id, {
      ...options,
      now: options?.now,
    });
}
