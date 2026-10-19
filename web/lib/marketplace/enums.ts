/**
 * Validated string enums for the deals inventory & settings system.
 * Source of truth: docs/deals-spec.md §1.
 *
 * Pattern matches the rest of the codebase (`as const` arrays + derived types).
 * DB migrations in later chunks should use these same string values.
 */

function isOneOf<T extends readonly string[]>(
  values: T,
  value: unknown
): value is T[number] {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

export const SOURCE_PROVIDERS = [
  "rezdy",
  "fareharbor",
  "bokun",
  "checkfront",
  "manual",
] as const;
export type SourceProvider = (typeof SOURCE_PROVIDERS)[number];
export function isSourceProvider(value: unknown): value is SourceProvider {
  return isOneOf(SOURCE_PROVIDERS, value);
}

export const DEAL_TYPES = [
  "integrated_session",
  "integrated_multi_session",
  "manual_session",
  "manual_open_window",
] as const;
export type DealType = (typeof DEAL_TYPES)[number];
export function isDealType(value: unknown): value is DealType {
  return isOneOf(DEAL_TYPES, value);
}

export const DEAL_STATUSES = [
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
] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];
export function isDealStatus(value: unknown): value is DealStatus {
  return isOneOf(DEAL_STATUSES, value);
}

export const PAUSE_REASONS = [
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
] as const;
export type PauseReason = (typeof PAUSE_REASONS)[number];
export function isPauseReason(value: unknown): value is PauseReason {
  return isOneOf(PAUSE_REASONS, value);
}

export const DISCOUNT_MECHANISMS = [
  "promo_code",
  "price_option",
  "separate_product",
  "manual_price",
  "quote_code",
] as const;
export type DiscountMechanism = (typeof DISCOUNT_MECHANISMS)[number];
export function isDiscountMechanism(value: unknown): value is DiscountMechanism {
  return isOneOf(DISCOUNT_MECHANISMS, value);
}

export const DISCOUNT_INPUT_MODES = ["deal_price", "percentage"] as const;
export type DiscountInputMode = (typeof DISCOUNT_INPUT_MODES)[number];
export function isDiscountInputMode(value: unknown): value is DiscountInputMode {
  return isOneOf(DISCOUNT_INPUT_MODES, value);
}

export const CAPACITY_MODES = [
  "live_provider",
  "live_provider_capped",
  "manual_count",
] as const;
export type CapacityMode = (typeof CAPACITY_MODES)[number];
export function isCapacityMode(value: unknown): value is CapacityMode {
  return isOneOf(CAPACITY_MODES, value);
}

export const BOOKING_DESTINATION_TYPES = [
  "provider_booking_page",
  "operator_website",
  "phone",
  "email",
] as const;
export type BookingDestinationType = (typeof BOOKING_DESTINATION_TYPES)[number];
export function isBookingDestinationType(
  value: unknown
): value is BookingDestinationType {
  return isOneOf(BOOKING_DESTINATION_TYPES, value);
}

export const PRICE_OPTION_TYPES = [
  "adult",
  "child",
  "infant",
  "senior",
  "student",
  "family",
  "group",
  "per_unit",
] as const;
export type PriceOptionType = (typeof PRICE_OPTION_TYPES)[number];
export function isPriceOptionType(value: unknown): value is PriceOptionType {
  return isOneOf(PRICE_OPTION_TYPES, value);
}

export const RULE_TYPES = ["daily", "weekly", "specific_dates"] as const;
export type RuleType = (typeof RULE_TYPES)[number];
export function isRuleType(value: unknown): value is RuleType {
  return isOneOf(RULE_TYPES, value);
}

export const INTEGRATION_STATUSES = [
  "not_connected",
  "connecting",
  "connected",
  "degraded",
  "error",
  "disconnected",
] as const;
export type IntegrationStatus = (typeof INTEGRATION_STATUSES)[number];
export function isIntegrationStatus(value: unknown): value is IntegrationStatus {
  return isOneOf(INTEGRATION_STATUSES, value);
}

export const USER_ROLES = ["owner", "manager", "staff"] as const;
export type UserRole = (typeof USER_ROLES)[number];
export function isUserRole(value: unknown): value is UserRole {
  return isOneOf(USER_ROLES, value);
}

export const CANCELLATION_POLICY_TYPES = [
  "non_refundable",
  "operator_standard",
  "custom",
] as const;
export type CancellationPolicyType = (typeof CANCELLATION_POLICY_TYPES)[number];
export function isCancellationPolicyType(
  value: unknown
): value is CancellationPolicyType {
  return isOneOf(CANCELLATION_POLICY_TYPES, value);
}

export const CATEGORIES = [
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
] as const;
export type Category = (typeof CATEGORIES)[number];
export function isCategory(value: unknown): value is Category {
  return isOneOf(CATEGORIES, value);
}

export const FITNESS_LEVELS = [
  "easy",
  "moderate",
  "challenging",
  "extreme",
] as const;
export type FitnessLevel = (typeof FITNESS_LEVELS)[number];
export function isFitnessLevel(value: unknown): value is FitnessLevel {
  return isOneOf(FITNESS_LEVELS, value);
}

export const LINK_STATUSES = ["unchecked", "ok", "broken"] as const;
export type LinkStatus = (typeof LINK_STATUSES)[number];
export function isLinkStatus(value: unknown): value is LinkStatus {
  return isOneOf(LINK_STATUSES, value);
}

export const SESSION_STATUSES = [
  "live",
  "sold_out",
  "cancelled",
  "expired",
] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];
export function isSessionStatus(value: unknown): value is SessionStatus {
  return isOneOf(SESSION_STATUSES, value);
}

export const ORIGINAL_PRICE_SOURCES = ["provider", "operator_entered"] as const;
export type OriginalPriceSource = (typeof ORIGINAL_PRICE_SOURCES)[number];
export function isOriginalPriceSource(
  value: unknown
): value is OriginalPriceSource {
  return isOneOf(ORIGINAL_PRICE_SOURCES, value);
}

export const MEDIA_TYPES = ["image", "video_embed"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];
export function isMediaType(value: unknown): value is MediaType {
  return isOneOf(MEDIA_TYPES, value);
}

export const MEDIA_SOURCES = ["upload", "provider"] as const;
export type MediaSource = (typeof MEDIA_SOURCES)[number];
export function isMediaSource(value: unknown): value is MediaSource {
  return isOneOf(MEDIA_SOURCES, value);
}

export const ATTESTATION_METHODS = [
  "dashboard",
  "email_link",
  "sms_link",
] as const;
export type AttestationMethod = (typeof ATTESTATION_METHODS)[number];
export function isAttestationMethod(value: unknown): value is AttestationMethod {
  return isOneOf(ATTESTATION_METHODS, value);
}

export const ACTOR_TYPES = ["user", "system", "admin"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];
export function isActorType(value: unknown): value is ActorType {
  return isOneOf(ACTOR_TYPES, value);
}

export const RECHECK_RESULTS = ["available", "sold_out", "error"] as const;
export type RecheckResult = (typeof RECHECK_RESULTS)[number];
export function isRecheckResult(value: unknown): value is RecheckResult {
  return isOneOf(RECHECK_RESULTS, value);
}

export const AUTH_TYPES = ["api_key", "oauth", "marketplace"] as const;
export type AuthType = (typeof AUTH_TYPES)[number];
export function isAuthType(value: unknown): value is AuthType {
  return isOneOf(AUTH_TYPES, value);
}

export const SYNC_MODES = ["webhook", "polling", "hybrid"] as const;
export type SyncMode = (typeof SYNC_MODES)[number];
export function isSyncMode(value: unknown): value is SyncMode {
  return isOneOf(SYNC_MODES, value);
}

export const CONVERSION_TRACKING_METHODS = [
  "none",
  "promo_code",
  "booking_source",
  "webhook",
] as const;
export type ConversionTrackingMethod =
  (typeof CONVERSION_TRACKING_METHODS)[number];
export function isConversionTrackingMethod(
  value: unknown
): value is ConversionTrackingMethod {
  return isOneOf(CONVERSION_TRACKING_METHODS, value);
}

export const SYNC_TYPES = [
  "full",
  "incremental",
  "webhook",
  "click_recheck",
  "manual",
] as const;
export type SyncType = (typeof SYNC_TYPES)[number];
export function isSyncType(value: unknown): value is SyncType {
  return isOneOf(SYNC_TYPES, value);
}

export const ACCOUNT_STATUSES = [
  "pending_verification",
  "active",
  "suspended",
] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];
export function isAccountStatus(value: unknown): value is AccountStatus {
  return isOneOf(ACCOUNT_STATUSES, value);
}

export const INVITE_STATUSES = ["pending", "accepted", "revoked"] as const;
export type InviteStatus = (typeof INVITE_STATUSES)[number];
export function isInviteStatus(value: unknown): value is InviteStatus {
  return isOneOf(INVITE_STATUSES, value);
}

export const COMPLIANCE_DOC_TYPES = [
  "public_liability_insurance",
  "adventure_activities_certificate",
  "maritime_licence",
  "business_licence",
  "food_licence",
  "other",
] as const;
export type ComplianceDocType = (typeof COMPLIANCE_DOC_TYPES)[number];
export function isComplianceDocType(value: unknown): value is ComplianceDocType {
  return isOneOf(COMPLIANCE_DOC_TYPES, value);
}

export const REVIEW_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "expired",
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
export function isReviewStatus(value: unknown): value is ReviewStatus {
  return isOneOf(REVIEW_STATUSES, value);
}

export const BILLING_MODELS = [
  "subscription",
  "per_click",
  "commission",
] as const;
export type BillingModel = (typeof BILLING_MODELS)[number];
export function isBillingModel(value: unknown): value is BillingModel {
  return isOneOf(BILLING_MODELS, value);
}

/** Helper groupings used by deal creation and auto-resume rules. */
export const INTEGRATED_DEAL_TYPES = [
  "integrated_session",
  "integrated_multi_session",
] as const satisfies readonly DealType[];

export const MANUAL_DEAL_TYPES = [
  "manual_session",
  "manual_open_window",
] as const satisfies readonly DealType[];

export const INTEGRATED_MECHANISMS = [
  "promo_code",
  "price_option",
  "separate_product",
] as const satisfies readonly DiscountMechanism[];

export const MANUAL_MECHANISMS = [
  "manual_price",
  "quote_code",
] as const satisfies readonly DiscountMechanism[];

export const AUTO_RESUME_REASONS = [
  "sync_failure",
  "integration_disconnected",
  "attestation_expired",
  "link_broken",
] as const satisfies readonly PauseReason[];

export function isIntegratedDealType(value: unknown): boolean {
  return isOneOf(INTEGRATED_DEAL_TYPES, value);
}

export function isManualDealType(value: unknown): boolean {
  return isOneOf(MANUAL_DEAL_TYPES, value);
}

export function isAutoResumeReason(value: unknown): value is PauseReason {
  return isOneOf(AUTO_RESUME_REASONS, value);
}

/** All enum value arrays for exhaustive tests / serializers. */
export const ALL_ENUMS = {
  source_provider: SOURCE_PROVIDERS,
  deal_type: DEAL_TYPES,
  deal_status: DEAL_STATUSES,
  pause_reason: PAUSE_REASONS,
  discount_mechanism: DISCOUNT_MECHANISMS,
  discount_input_mode: DISCOUNT_INPUT_MODES,
  capacity_mode: CAPACITY_MODES,
  booking_destination_type: BOOKING_DESTINATION_TYPES,
  price_option_type: PRICE_OPTION_TYPES,
  rule_type: RULE_TYPES,
  integration_status: INTEGRATION_STATUSES,
  user_role: USER_ROLES,
  cancellation_policy_type: CANCELLATION_POLICY_TYPES,
  category: CATEGORIES,
  fitness_level: FITNESS_LEVELS,
  link_status: LINK_STATUSES,
  session_status: SESSION_STATUSES,
  original_price_source: ORIGINAL_PRICE_SOURCES,
  media_type: MEDIA_TYPES,
  media_source: MEDIA_SOURCES,
  attestation_method: ATTESTATION_METHODS,
  actor_type: ACTOR_TYPES,
  recheck_result: RECHECK_RESULTS,
  auth_type: AUTH_TYPES,
  sync_mode: SYNC_MODES,
  conversion_tracking_method: CONVERSION_TRACKING_METHODS,
  sync_type: SYNC_TYPES,
  account_status: ACCOUNT_STATUSES,
  invite_status: INVITE_STATUSES,
  compliance_doc_type: COMPLIANCE_DOC_TYPES,
  review_status: REVIEW_STATUSES,
  billing_model: BILLING_MODELS,
} as const;
