-- ============================================================================
-- Security S10: Align public deal RLS / views with fail-closed traveller visibility
-- ============================================================================
-- Problem (after S9): public views and sessions/media policies only required
-- status = 'live'. A deal that is live but outside the lead window or past
-- sales cutoff would still appear via PostgREST even though the product hides
-- it (isVisibleToTravellers in deal-status-ticker.ts).
--
-- Fix: SECURITY DEFINER marketplace.is_visible_to_travellers(uuid) mirrors
-- isVisibleToTravellers / hasSellableSessionWithinLeadHours /
-- isSessionSellableAt:
--   - deal.status = 'live'
--   - sales_cutoff_minutes IS NOT NULL
--   - at least one deal_session with
--       start_at - sales_cutoff_minutes > now()
--       AND start_at <= now() + MAX_LEAD_HOURS
-- MAX_LEAD_HOURS in SQL is the platform default 72 (same DB bound as
-- discount_steps.hours_before_start). App env overrides still apply in
-- Next.js APIs; PostgREST uses the default so the public DB surface fails
-- closed at least as tightly as the documented default.
--
-- Apply to:
--   1. operator_deals_public / deal_price_options_public / discount_steps_public
--   2. Public SELECT policies on deal_sessions / deal_media
--   3. is_live_operator_deal → delegates to is_visible_to_travellers (S9 name kept)
--
-- Preferred traveller path remains Next.js Book now / listing APIs, which
-- still enforce isVisibleToTravellers (and further fail-closed checks).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Fail-closed visibility (parity with isVisibleToTravellers)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION marketplace.is_visible_to_travellers(p_deal_id UUID)
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
      AND d.sales_cutoff_minutes IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM marketplace.deal_sessions s
        WHERE s.deal_id = d.id
          AND (s.start_at - (d.sales_cutoff_minutes * INTERVAL '1 minute')) > NOW()
          AND s.start_at <= NOW() + INTERVAL '72 hours'
      )
  );
$$;

COMMENT ON FUNCTION marketplace.is_visible_to_travellers(UUID) IS
  'S10: SECURITY DEFINER fail-closed traveller visibility (live + sellable session within MAX_LEAD_HOURS=72 default). Mirrors isVisibleToTravellers.';

GRANT EXECUTE ON FUNCTION marketplace.is_visible_to_travellers(UUID)
  TO anon, authenticated, service_role;

-- S9 helper: keep the name, tighten semantics to match product visibility.
CREATE OR REPLACE FUNCTION marketplace.is_live_operator_deal(p_deal_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = marketplace, public
AS $$
  SELECT marketplace.is_visible_to_travellers(p_deal_id);
$$;

COMMENT ON FUNCTION marketplace.is_live_operator_deal(UUID) IS
  'S9/S10: SECURITY DEFINER public child-table check; delegates to is_visible_to_travellers (fail-closed lead window + cutoff).';

-- ---------------------------------------------------------------------------
-- Public views: only deals visible to travellers (not merely status=live)
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
FROM marketplace.operator_deals d
WHERE marketplace.is_visible_to_travellers(d.id);

COMMENT ON VIEW marketplace.operator_deals_public IS
  'S9/S10: public traveller fields for deals that pass is_visible_to_travellers (not status=live alone); no promo_code / pause_* / link_* / attestation / discount_verification / integration refs.';

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
WHERE marketplace.is_visible_to_travellers(p.deal_id);

COMMENT ON VIEW marketplace.deal_price_options_public IS
  'S9/S10: public price options for traveller-visible deals; omits provider external_* option ids.';

ALTER VIEW marketplace.deal_price_options_public SET (security_invoker = false);

CREATE OR REPLACE VIEW marketplace.discount_steps_public AS
SELECT
  s.id,
  s.deal_id,
  s.price_option_id,
  s.hours_before_start,
  s.deal_price_minor
FROM marketplace.discount_steps s
WHERE marketplace.is_visible_to_travellers(s.deal_id);

COMMENT ON VIEW marketplace.discount_steps_public IS
  'S9/S10: public stepped-discount prices for traveller-visible deals; omits promo_code and external_deal_price_option_id.';

ALTER VIEW marketplace.discount_steps_public SET (security_invoker = false);

GRANT SELECT ON marketplace.operator_deals_public TO anon, authenticated, service_role;
GRANT SELECT ON marketplace.deal_price_options_public TO anon, authenticated, service_role;
GRANT SELECT ON marketplace.discount_steps_public TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Sessions / media: same fail-closed parent visibility
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can view sessions for live deals"
  ON marketplace.deal_sessions;

CREATE POLICY "Public can view sessions for live deals"
  ON marketplace.deal_sessions FOR SELECT
  USING (marketplace.is_visible_to_travellers(deal_id));

DROP POLICY IF EXISTS "Public can view media for live deals"
  ON marketplace.deal_media;

CREATE POLICY "Public can view media for live deals"
  ON marketplace.deal_media FOR SELECT
  USING (marketplace.is_visible_to_travellers(deal_id));
