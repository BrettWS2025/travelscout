-- ============================================================================
-- Security S9: Narrow public SELECT on live deals (hide promo codes / internals)
-- ============================================================================
-- Problem: policies "Public can view live deals" (+ child public policies) and
-- GRANT SELECT TO anon exposed full marketplace.operator_deals rows (promo_code,
-- pause_*, link_*, attestation, discount_verification, integration refs, etc.)
-- and promo_code on discount_steps via PostgREST.
--
-- Fix (same pattern as S8):
--   1. marketplace.operator_deals_public — traveller-safe columns for status=live
--   2. marketplace.deal_price_options_public — prices/labels for live parents
--      (no provider external option ids)
--   3. marketplace.discount_steps_public — step prices for live parents
--      (no promo_code / external_deal_price_option_id)
--   4. Drop wide public SELECT policies on those three base tables
--   5. REVOKE SELECT on those base tables from anon (and PUBLIC)
--   6. Members keep full-row SELECT via existing member policies
--      (authenticated GRANT SELECT unchanged)
--   7. SECURITY DEFINER marketplace.is_live_operator_deal(uuid) so remaining
--      public policies on deal_sessions / deal_media still work after anon
--      loses SELECT on operator_deals (EXISTS against the base table would
--      otherwise fail closed for travellers).
--
-- Promo codes: Book now applies the code server-side via buildBookingUrl /
-- bookingPromoForSession; travellers must not enumerate codes via PostgREST.
--
-- View ownership (default, NOT security_invoker): views run with the
-- privileges of their owner so anon can read safe columns without SELECT on
-- the base tables. Do not set security_invoker = true on these views.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper: live-deal check for child public policies (bypasses RLS on parent)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION marketplace.is_live_operator_deal(p_deal_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = marketplace, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM marketplace.operator_deals d
    WHERE d.id = p_deal_id
      AND d.status = 'live'
  );
$$;

COMMENT ON FUNCTION marketplace.is_live_operator_deal(UUID) IS
  'S9: SECURITY DEFINER live-deal check for public child-table RLS after anon SELECT is revoked on operator_deals.';

GRANT EXECUTE ON FUNCTION marketplace.is_live_operator_deal(UUID)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Public views
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW marketplace.operator_deals_public AS
SELECT
  id,
  operator_id,
  deal_type,
  source_provider,
  status,
  title,
  slug,
  summary,
  description,
  category,
  tags,
  highlights,
  inclusions,
  exclusions,
  what_to_bring,
  duration_minutes,
  duration_label,
  location_name,
  address,
  latitude,
  longitude,
  region,
  meeting_point_notes,
  pickup_available,
  pickup_notes,
  min_age,
  age_notes,
  fitness_level,
  wheelchair_accessible,
  accessibility_notes,
  languages,
  weather_dependent,
  weather_notes,
  cancellation_policy_type,
  cancellation_policy_text,
  important_info,
  currency,
  discount_mechanism,
  discount_input_mode,
  stepped_discount_enabled,
  capacity_mode,
  seat_cap,
  min_booking_qty,
  max_booking_qty,
  booking_destination_type,
  booking_url,
  booking_phone,
  booking_email,
  booking_instructions,
  append_tracking_params,
  sales_cutoff_minutes,
  published_at,
  first_published_at
FROM marketplace.operator_deals
WHERE status = 'live';

COMMENT ON VIEW marketplace.operator_deals_public IS
  'S9: public traveller fields for live inventory deals only; no promo_code / pause_* / link_* / attestation / discount_verification / integration refs. Prefer this (or Next.js Book now / listing APIs) over base-table SELECT.';

ALTER VIEW marketplace.operator_deals_public SET (security_invoker = false);

CREATE OR REPLACE VIEW marketplace.deal_price_options_public AS
SELECT
  p.id,
  p.deal_id,
  p.label,
  p.type,
  p.original_price_minor,
  p.original_price_source,
  p.original_price_evidence_url,
  p.deal_price_minor,
  p.discount_pct,
  p.sort_order
FROM marketplace.deal_price_options p
INNER JOIN marketplace.operator_deals d ON d.id = p.deal_id
WHERE d.status = 'live';

COMMENT ON VIEW marketplace.deal_price_options_public IS
  'S9: public price options for live deals; omits provider external_* option ids.';

ALTER VIEW marketplace.deal_price_options_public SET (security_invoker = false);

CREATE OR REPLACE VIEW marketplace.discount_steps_public AS
SELECT
  s.id,
  s.deal_id,
  s.price_option_id,
  s.hours_before_start,
  s.deal_price_minor
FROM marketplace.discount_steps s
INNER JOIN marketplace.operator_deals d ON d.id = s.deal_id
WHERE d.status = 'live';

COMMENT ON VIEW marketplace.discount_steps_public IS
  'S9: public stepped-discount prices for live deals; omits promo_code and external_deal_price_option_id.';

ALTER VIEW marketplace.discount_steps_public SET (security_invoker = false);

GRANT SELECT ON marketplace.operator_deals_public TO anon, authenticated, service_role;
GRANT SELECT ON marketplace.deal_price_options_public TO anon, authenticated, service_role;
GRANT SELECT ON marketplace.discount_steps_public TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Drop wide public policies; revoke anon SELECT on sensitive base tables
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can view live deals"
  ON marketplace.operator_deals;

DROP POLICY IF EXISTS "Public can view price options for live deals"
  ON marketplace.deal_price_options;

DROP POLICY IF EXISTS "Public can view discount steps for live deals"
  ON marketplace.discount_steps;

REVOKE SELECT ON TABLE marketplace.operator_deals FROM PUBLIC, anon;
REVOKE SELECT ON TABLE marketplace.deal_price_options FROM PUBLIC, anon;
REVOKE SELECT ON TABLE marketplace.discount_steps FROM PUBLIC, anon;

-- authenticated + service_role retain SELECT on base tables (member RLS /
-- service-role bypass). Re-assert in case PUBLIC revoke cascaded oddly.
GRANT SELECT ON TABLE marketplace.operator_deals TO authenticated, service_role;
GRANT SELECT ON TABLE marketplace.deal_price_options TO authenticated, service_role;
GRANT SELECT ON TABLE marketplace.discount_steps TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Keep sessions / media publicly readable for live deals via definer helper
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can view sessions for live deals"
  ON marketplace.deal_sessions;

CREATE POLICY "Public can view sessions for live deals"
  ON marketplace.deal_sessions FOR SELECT
  USING (marketplace.is_live_operator_deal(deal_id));

DROP POLICY IF EXISTS "Public can view media for live deals"
  ON marketplace.deal_media;

CREATE POLICY "Public can view media for live deals"
  ON marketplace.deal_media FOR SELECT
  USING (marketplace.is_live_operator_deal(deal_id));
