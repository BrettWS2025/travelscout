/**
 * Public / traveller-safe inventory deal surfaces (security S9 + S10).
 *
 * Anon must not read promo codes or internal fields via PostgREST on
 * marketplace.operator_deals / deal_price_options / discount_steps.
 * Prefer marketplace.*_public views (migrations
 * 20261032000001_narrow_public_deals_select.sql and
 * 20261033000001_align_public_deal_visibility.sql) or Next.js Book now /
 * listing APIs. Book now applies promo_code server-side via
 * bookingPromoForSession → buildBookingUrl; it is not returned in the
 * Book now JSON response.
 *
 * S10: public views / sessions / media only expose deals that pass
 * marketplace.is_visible_to_travellers (parity with isVisibleToTravellers:
 * live + sellable session within MAX_LEAD_HOURS, not past sales cutoff).
 */

import { PLATFORM_DEFAULTS } from "./config";

/**
 * Lead window used by marketplace.is_visible_to_travellers in SQL (S10).
 * Matches PLATFORM_DEFAULTS.MAX_LEAD_HOURS; keep the migration INTERVAL in sync.
 */
export const PUBLIC_DEAL_VISIBILITY_MAX_LEAD_HOURS =
  PLATFORM_DEFAULTS.MAX_LEAD_HOURS;

/**
 * Columns on `marketplace.operator_deals_public` (traveller-visible deals).
 * Must stay aligned with the S9/S10 migration view SELECT list.
 */
export const OPERATOR_DEAL_PUBLIC_COLUMNS = [
  "id",
  "operator_id",
  "deal_type",
  "source_provider",
  "status",
  "title",
  "slug",
  "summary",
  "description",
  "category",
  "tags",
  "highlights",
  "inclusions",
  "exclusions",
  "what_to_bring",
  "duration_minutes",
  "duration_label",
  "location_name",
  "address",
  "latitude",
  "longitude",
  "region",
  "meeting_point_notes",
  "pickup_available",
  "pickup_notes",
  "min_age",
  "age_notes",
  "fitness_level",
  "wheelchair_accessible",
  "accessibility_notes",
  "languages",
  "weather_dependent",
  "weather_notes",
  "cancellation_policy_type",
  "cancellation_policy_text",
  "important_info",
  "currency",
  "discount_mechanism",
  "discount_input_mode",
  "stepped_discount_enabled",
  "capacity_mode",
  "seat_cap",
  "min_booking_qty",
  "max_booking_qty",
  "booking_destination_type",
  "booking_url",
  "booking_phone",
  "booking_email",
  "booking_instructions",
  "append_tracking_params",
  "sales_cutoff_minutes",
  "published_at",
  "first_published_at",
] as const;

/**
 * Base-table columns that must not be readable by anon via PostgREST
 * (revoked SELECT on base; omitted from operator_deals_public).
 * `status` appears in the public view only because the view filters to live;
 * pause_* and other system fields stay internal.
 */
export const OPERATOR_DEAL_INTERNAL_COLUMNS = [
  "integration_id",
  "external_product_id",
  "deal_rule_id",
  "pause_reason",
  "pause_detail",
  "overridden_fields",
  "promo_code",
  "promo_code_confirmed_by_operator",
  "discount_verification",
  "link_status",
  "link_last_checked_at",
  "link_consecutive_failures",
  "publish_at",
  "last_attested_at",
  "attestation_expires_at",
  "ended_at",
  "created_by",
  "updated_by",
  "created_at",
  "updated_at",
] as const;

/** Columns on `marketplace.deal_price_options_public`. */
export const DEAL_PRICE_OPTION_PUBLIC_COLUMNS = [
  "id",
  "deal_id",
  "label",
  "type",
  "original_price_minor",
  "original_price_source",
  "original_price_evidence_url",
  "deal_price_minor",
  "discount_pct",
  "sort_order",
] as const;

/** Sensitive price-option columns omitted from the public view. */
export const DEAL_PRICE_OPTION_INTERNAL_COLUMNS = [
  "external_price_option_id",
  "external_deal_price_option_id",
  "created_at",
  "updated_at",
] as const;

/** Columns on `marketplace.discount_steps_public`. */
export const DISCOUNT_STEP_PUBLIC_COLUMNS = [
  "id",
  "deal_id",
  "price_option_id",
  "hours_before_start",
  "deal_price_minor",
] as const;

/** Sensitive discount-step columns omitted from the public view. */
export const DISCOUNT_STEP_INTERNAL_COLUMNS = [
  "promo_code",
  "external_deal_price_option_id",
  "created_at",
  "updated_at",
] as const;
