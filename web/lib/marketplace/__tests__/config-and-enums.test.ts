import { describe, it, expect } from "vitest";
import {
  PLATFORM_DEFAULTS,
  getPlatformConfig,
  platformConfig,
  MIN_DISCOUNT_PCT,
  MAX_LEAD_HOURS,
  MANUAL_ATTESTATION_HOURS,
  SYNC_STALE_MINUTES,
  CLICK_RECHECK,
  MANUAL_REVIEW_COUNT,
  LINK_CHECK_TIMEOUT_MS,
  CLICK_RECHECK_TIMEOUT_MS,
  CACHED_AVAILABILITY_MAX_AGE_MINUTES,
  ARCHIVE_AFTER_DAYS,
  ATTESTATION_REMINDER_HOURS,
  ENFORCE_COMPLIANCE_ON_PUBLISH,
  DEFAULT_TIMEZONE,
  DEFAULT_CURRENCY,
} from "@/lib/marketplace/config";
import {
  ALL_ENUMS,
  SOURCE_PROVIDERS,
  DEAL_TYPES,
  DEAL_STATUSES,
  PAUSE_REASONS,
  DISCOUNT_MECHANISMS,
  DISCOUNT_INPUT_MODES,
  CAPACITY_MODES,
  BOOKING_DESTINATION_TYPES,
  PRICE_OPTION_TYPES,
  RULE_TYPES,
  INTEGRATION_STATUSES,
  USER_ROLES,
  CANCELLATION_POLICY_TYPES,
  CATEGORIES,
  FITNESS_LEVELS,
  LINK_STATUSES,
  SESSION_STATUSES,
  ORIGINAL_PRICE_SOURCES,
  MEDIA_TYPES,
  MEDIA_SOURCES,
  ATTESTATION_METHODS,
  ACTOR_TYPES,
  RECHECK_RESULTS,
  AUTH_TYPES,
  SYNC_MODES,
  CONVERSION_TRACKING_METHODS,
  SYNC_TYPES,
  ACCOUNT_STATUSES,
  INVITE_STATUSES,
  COMPLIANCE_DOC_TYPES,
  REVIEW_STATUSES,
  BILLING_MODELS,
  INTEGRATED_DEAL_TYPES,
  MANUAL_DEAL_TYPES,
  INTEGRATED_MECHANISMS,
  MANUAL_MECHANISMS,
  AUTO_RESUME_REASONS,
  isSourceProvider,
  isDealType,
  isAutoResumeReason,
  isIntegratedDealType,
  isManualDealType,
} from "@/lib/marketplace/enums";

describe("platform config defaults", () => {
  it("exports every constant with the spec default", () => {
    expect(MIN_DISCOUNT_PCT).toBe(50);
    expect(MAX_LEAD_HOURS).toBe(72);
    expect(MANUAL_ATTESTATION_HOURS).toBe(12);
    expect(SYNC_STALE_MINUTES).toBe(15);
    expect(CLICK_RECHECK).toBe(true);
    expect(MANUAL_REVIEW_COUNT).toBe(3);
    expect(LINK_CHECK_TIMEOUT_MS).toBe(5000);
    expect(CLICK_RECHECK_TIMEOUT_MS).toBe(2000);
    expect(CACHED_AVAILABILITY_MAX_AGE_MINUTES).toBe(5);
    expect(ARCHIVE_AFTER_DAYS).toBe(30);
    expect(ATTESTATION_REMINDER_HOURS).toBe(2);
    expect(ENFORCE_COMPLIANCE_ON_PUBLISH).toBe(false);
    expect(DEFAULT_TIMEZONE).toBe("Pacific/Auckland");
    expect(DEFAULT_CURRENCY).toBe("NZD");

    expect(PLATFORM_DEFAULTS).toEqual({
      MIN_DISCOUNT_PCT: 50,
      MAX_LEAD_HOURS: 72,
      MANUAL_ATTESTATION_HOURS: 12,
      SYNC_STALE_MINUTES: 15,
      CLICK_RECHECK: true,
      MANUAL_REVIEW_COUNT: 3,
      LINK_CHECK_TIMEOUT_MS: 5000,
      CLICK_RECHECK_TIMEOUT_MS: 2000,
      CACHED_AVAILABILITY_MAX_AGE_MINUTES: 5,
      ARCHIVE_AFTER_DAYS: 30,
      ATTESTATION_REMINDER_HOURS: 2,
      ENFORCE_COMPLIANCE_ON_PUBLISH: false,
      DEFAULT_TIMEZONE: "Pacific/Auckland",
      DEFAULT_CURRENCY: "NZD",
    });
  });

  it("getPlatformConfig returns defaults when env is empty", () => {
    expect(getPlatformConfig({})).toEqual(PLATFORM_DEFAULTS);
  });

  it("getPlatformConfig respects env overrides", () => {
    const cfg = getPlatformConfig({
      MIN_DISCOUNT_PCT: "60",
      MAX_LEAD_HOURS: "48",
      MANUAL_ATTESTATION_HOURS: "6",
      SYNC_STALE_MINUTES: "10",
      CLICK_RECHECK: "false",
      MANUAL_REVIEW_COUNT: "5",
      LINK_CHECK_TIMEOUT_MS: "3000",
      CLICK_RECHECK_TIMEOUT_MS: "1500",
      CACHED_AVAILABILITY_MAX_AGE_MINUTES: "3",
      ARCHIVE_AFTER_DAYS: "14",
      ATTESTATION_REMINDER_HOURS: "1",
      ENFORCE_COMPLIANCE_ON_PUBLISH: "true",
      DEFAULT_TIMEZONE: "Pacific/Chatham",
      DEFAULT_CURRENCY: "AUD",
    });

    expect(cfg.MIN_DISCOUNT_PCT).toBe(60);
    expect(cfg.MAX_LEAD_HOURS).toBe(48);
    expect(cfg.MANUAL_ATTESTATION_HOURS).toBe(6);
    expect(cfg.SYNC_STALE_MINUTES).toBe(10);
    expect(cfg.CLICK_RECHECK).toBe(false);
    expect(cfg.MANUAL_REVIEW_COUNT).toBe(5);
    expect(cfg.LINK_CHECK_TIMEOUT_MS).toBe(3000);
    expect(cfg.CLICK_RECHECK_TIMEOUT_MS).toBe(1500);
    expect(cfg.CACHED_AVAILABILITY_MAX_AGE_MINUTES).toBe(3);
    expect(cfg.ARCHIVE_AFTER_DAYS).toBe(14);
    expect(cfg.ATTESTATION_REMINDER_HOURS).toBe(1);
    expect(cfg.ENFORCE_COMPLIANCE_ON_PUBLISH).toBe(true);
    expect(cfg.DEFAULT_TIMEZONE).toBe("Pacific/Chatham");
    expect(cfg.DEFAULT_CURRENCY).toBe("AUD");
  });

  it("platformConfig getters match getPlatformConfig()", () => {
    expect(platformConfig.MIN_DISCOUNT_PCT).toBe(
      getPlatformConfig().MIN_DISCOUNT_PCT
    );
    expect(platformConfig.DEFAULT_CURRENCY).toBe(
      getPlatformConfig().DEFAULT_CURRENCY
    );
  });
});

describe("enums", () => {
  const expected: Record<keyof typeof ALL_ENUMS, readonly string[]> = {
    source_provider: ["rezdy", "fareharbor", "bokun", "checkfront", "manual"],
    deal_type: [
      "integrated_session",
      "integrated_multi_session",
      "manual_session",
      "manual_open_window",
    ],
    deal_status: [
      "draft",
      "pending_review",
      "scheduled",
      "live",
      "paused",
      "auto_paused",
      "sold_out",
      "expired",
      "ended",
      "archived",
    ],
    pause_reason: [
      "operator",
      "admin",
      "sync_failure",
      "session_cancelled",
      "capacity_zero",
      "price_below_threshold",
      "attestation_expired",
      "link_broken",
      "cutoff_passed",
      "integration_disconnected",
    ],
    discount_mechanism: [
      "promo_code",
      "price_option",
      "separate_product",
      "manual_price",
      "quote_code",
    ],
    discount_input_mode: ["deal_price", "percentage"],
    capacity_mode: ["live_provider", "live_provider_capped", "manual_count"],
    booking_destination_type: [
      "provider_booking_page",
      "operator_website",
      "phone",
      "email",
    ],
    price_option_type: [
      "adult",
      "child",
      "infant",
      "senior",
      "student",
      "family",
      "group",
      "per_unit",
    ],
    rule_type: ["daily", "weekly", "specific_dates"],
    integration_status: [
      "not_connected",
      "connecting",
      "connected",
      "degraded",
      "error",
      "disconnected",
    ],
    user_role: ["owner", "manager", "staff"],
    cancellation_policy_type: [
      "non_refundable",
      "operator_standard",
      "custom",
    ],
    category: [
      "tour",
      "adventure",
      "water",
      "cruise",
      "food_wine",
      "attraction",
      "wellness",
      "accommodation",
      "rental",
      "transport",
      "other",
    ],
    fitness_level: ["easy", "moderate", "challenging", "extreme"],
    link_status: ["unchecked", "ok", "broken"],
    session_status: ["live", "sold_out", "cancelled", "expired"],
    original_price_source: ["provider", "operator_entered"],
    media_type: ["image", "video_embed"],
    media_source: ["upload", "provider"],
    attestation_method: ["dashboard", "email_link", "sms_link"],
    actor_type: ["user", "system", "admin"],
    recheck_result: ["available", "sold_out", "error"],
    auth_type: ["api_key", "oauth", "marketplace"],
    sync_mode: ["webhook", "polling", "hybrid"],
    conversion_tracking_method: [
      "none",
      "promo_code",
      "booking_source",
      "webhook",
    ],
    sync_type: ["full", "incremental", "webhook", "click_recheck", "manual"],
    account_status: ["pending_verification", "active", "suspended"],
    invite_status: ["pending", "accepted", "revoked"],
    compliance_doc_type: [
      "public_liability_insurance",
      "adventure_activities_certificate",
      "maritime_licence",
      "business_licence",
      "food_licence",
      "other",
    ],
    review_status: ["pending", "approved", "rejected", "expired"],
    billing_model: ["subscription", "per_click", "commission"],
  };

  it("exports every enum with the exact spec values", () => {
    for (const [name, values] of Object.entries(expected)) {
      expect(ALL_ENUMS[name as keyof typeof ALL_ENUMS]).toEqual(values);
    }
  });

  it("imports every enum array", () => {
    expect(SOURCE_PROVIDERS.length).toBeGreaterThan(0);
    expect(DEAL_TYPES.length).toBeGreaterThan(0);
    expect(DEAL_STATUSES.length).toBeGreaterThan(0);
    expect(PAUSE_REASONS.length).toBeGreaterThan(0);
    expect(DISCOUNT_MECHANISMS.length).toBeGreaterThan(0);
    expect(DISCOUNT_INPUT_MODES.length).toBeGreaterThan(0);
    expect(CAPACITY_MODES.length).toBeGreaterThan(0);
    expect(BOOKING_DESTINATION_TYPES.length).toBeGreaterThan(0);
    expect(PRICE_OPTION_TYPES.length).toBeGreaterThan(0);
    expect(RULE_TYPES.length).toBeGreaterThan(0);
    expect(INTEGRATION_STATUSES.length).toBeGreaterThan(0);
    expect(USER_ROLES.length).toBeGreaterThan(0);
    expect(CANCELLATION_POLICY_TYPES.length).toBeGreaterThan(0);
    expect(CATEGORIES.length).toBeGreaterThan(0);
    expect(FITNESS_LEVELS.length).toBeGreaterThan(0);
    expect(LINK_STATUSES.length).toBeGreaterThan(0);
    expect(SESSION_STATUSES.length).toBeGreaterThan(0);
    expect(ORIGINAL_PRICE_SOURCES.length).toBeGreaterThan(0);
    expect(MEDIA_TYPES.length).toBeGreaterThan(0);
    expect(MEDIA_SOURCES.length).toBeGreaterThan(0);
    expect(ATTESTATION_METHODS.length).toBeGreaterThan(0);
    expect(ACTOR_TYPES.length).toBeGreaterThan(0);
    expect(RECHECK_RESULTS.length).toBeGreaterThan(0);
    expect(AUTH_TYPES.length).toBeGreaterThan(0);
    expect(SYNC_MODES.length).toBeGreaterThan(0);
    expect(CONVERSION_TRACKING_METHODS.length).toBeGreaterThan(0);
    expect(SYNC_TYPES.length).toBeGreaterThan(0);
    expect(ACCOUNT_STATUSES.length).toBeGreaterThan(0);
    expect(INVITE_STATUSES.length).toBeGreaterThan(0);
    expect(COMPLIANCE_DOC_TYPES.length).toBeGreaterThan(0);
    expect(REVIEW_STATUSES.length).toBeGreaterThan(0);
    expect(BILLING_MODELS.length).toBeGreaterThan(0);
  });

  it("exports helper groupings", () => {
    expect([...INTEGRATED_DEAL_TYPES]).toEqual([
      "integrated_session",
      "integrated_multi_session",
    ]);
    expect([...MANUAL_DEAL_TYPES]).toEqual([
      "manual_session",
      "manual_open_window",
    ]);
    expect([...INTEGRATED_MECHANISMS]).toEqual([
      "promo_code",
      "price_option",
      "separate_product",
    ]);
    expect([...MANUAL_MECHANISMS]).toEqual(["manual_price", "quote_code"]);
    expect([...AUTO_RESUME_REASONS]).toEqual([
      "sync_failure",
      "integration_disconnected",
      "attestation_expired",
      "link_broken",
    ]);
  });

  it("validates membership helpers", () => {
    expect(isSourceProvider("rezdy")).toBe(true);
    expect(isSourceProvider("manual")).toBe(true);
    expect(isSourceProvider("other")).toBe(false);
    expect(isDealType("manual_session")).toBe(true);
    expect(isDealType("unknown")).toBe(false);
    expect(isIntegratedDealType("integrated_session")).toBe(true);
    expect(isIntegratedDealType("manual_session")).toBe(false);
    expect(isManualDealType("manual_open_window")).toBe(true);
    expect(isAutoResumeReason("sync_failure")).toBe(true);
    expect(isAutoResumeReason("admin")).toBe(false);
  });
});
