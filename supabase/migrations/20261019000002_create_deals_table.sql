-- ============================================================================
-- Deals platform Chunk 3: Deal table
-- ============================================================================
-- Main inventory deal row. Publish-required content columns are nullable so
-- drafts can be saved incomplete; field-level validation lives in
-- web/lib/marketplace/deal.ts. Publish validation is Chunk 16.
--
-- integration_id / external_product_id / deal_rule_id are UUID columns without
-- FK constraints until Chunk 7 creates those tables.
-- Enum string values match web/lib/marketplace/enums.ts.
-- ============================================================================

CREATE TABLE marketplace.deals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  operator_id UUID NOT NULL
    REFERENCES marketplace.operators(id) ON DELETE CASCADE,

  deal_type TEXT NOT NULL
    CHECK (deal_type IN (
      'integrated_session',
      'integrated_multi_session',
      'manual_session',
      'manual_open_window'
    )),
  source_provider TEXT NOT NULL
    CHECK (source_provider IN (
      'rezdy', 'fareharbor', 'bokun', 'checkfront', 'manual'
    )),

  -- FKs added in Chunk 7 when Integration / ExternalProduct / DealRule exist
  integration_id UUID,
  external_product_id UUID,
  deal_rule_id UUID,

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft', 'pending_review', 'scheduled', 'live', 'paused',
      'auto_paused', 'sold_out', 'expired', 'ended', 'archived'
    )),
  pause_reason TEXT
    CHECK (pause_reason IS NULL OR pause_reason IN (
      'operator', 'admin', 'sync_failure', 'session_cancelled', 'capacity_zero',
      'price_below_threshold', 'attestation_expired', 'link_broken',
      'cutoff_passed', 'integration_disconnected'
    )),
  pause_detail TEXT,

  title TEXT
    CHECK (title IS NULL OR (char_length(title) >= 10 AND char_length(title) <= 80)),
  slug TEXT NOT NULL UNIQUE,
  summary TEXT
    CHECK (
      summary IS NULL
      OR (char_length(summary) >= 20 AND char_length(summary) <= 160)
    ),
  description TEXT
    CHECK (
      description IS NULL
      OR (char_length(description) >= 100 AND char_length(description) <= 5000)
    ),
  category TEXT
    CHECK (category IS NULL OR category IN (
      'tour', 'adventure', 'water', 'cruise', 'food_wine', 'attraction',
      'wellness', 'accommodation', 'rental', 'transport', 'other'
    )),
  tags TEXT[] NOT NULL DEFAULT '{}',
  highlights TEXT[] NOT NULL DEFAULT '{}',
  inclusions TEXT[] NOT NULL DEFAULT '{}',
  exclusions TEXT[] NOT NULL DEFAULT '{}',
  what_to_bring TEXT[] NOT NULL DEFAULT '{}',

  duration_minutes INTEGER
    CHECK (
      duration_minutes IS NULL
      OR (duration_minutes >= 15 AND duration_minutes <= 20160)
    ),
  duration_label TEXT,

  location_name TEXT,
  address TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  region TEXT,
  meeting_point_notes TEXT
    CHECK (
      meeting_point_notes IS NULL
      OR char_length(meeting_point_notes) <= 500
    ),
  pickup_available BOOLEAN NOT NULL DEFAULT false,
  pickup_notes TEXT
    CHECK (pickup_notes IS NULL OR char_length(pickup_notes) <= 500),

  min_age INTEGER
    CHECK (min_age IS NULL OR (min_age >= 0 AND min_age <= 99)),
  age_notes TEXT,
  fitness_level TEXT
    CHECK (fitness_level IS NULL OR fitness_level IN (
      'easy', 'moderate', 'challenging', 'extreme'
    )),
  wheelchair_accessible BOOLEAN,
  accessibility_notes TEXT
    CHECK (
      accessibility_notes IS NULL
      OR char_length(accessibility_notes) <= 500
    ),
  languages TEXT[] NOT NULL DEFAULT '{}',

  weather_dependent BOOLEAN,
  weather_notes TEXT,
  cancellation_policy_type TEXT
    CHECK (cancellation_policy_type IS NULL OR cancellation_policy_type IN (
      'non_refundable', 'operator_standard', 'custom'
    )),
  cancellation_policy_text TEXT
    CHECK (
      cancellation_policy_text IS NULL
      OR char_length(cancellation_policy_text) <= 1000
    ),
  important_info TEXT
    CHECK (important_info IS NULL OR char_length(important_info) <= 1000),

  overridden_fields TEXT[] NOT NULL DEFAULT '{}',

  currency TEXT
    CHECK (currency IS NULL OR char_length(currency) = 3),
  discount_mechanism TEXT
    CHECK (discount_mechanism IS NULL OR discount_mechanism IN (
      'promo_code', 'price_option', 'separate_product', 'manual_price', 'quote_code'
    )),
  promo_code TEXT
    CHECK (
      promo_code IS NULL
      OR (
        char_length(promo_code) >= 3
        AND char_length(promo_code) <= 30
        AND promo_code ~ '^[A-Z0-9_-]+$'
      )
    ),
  discount_input_mode TEXT NOT NULL DEFAULT 'deal_price'
    CHECK (discount_input_mode IN ('deal_price', 'percentage')),
  stepped_discount_enabled BOOLEAN NOT NULL DEFAULT false,

  capacity_mode TEXT
    CHECK (capacity_mode IS NULL OR capacity_mode IN (
      'live_provider', 'live_provider_capped', 'manual_count'
    )),
  seat_cap INTEGER
    CHECK (seat_cap IS NULL OR (seat_cap >= 1 AND seat_cap <= 999)),
  min_booking_qty INTEGER,
  max_booking_qty INTEGER,

  booking_destination_type TEXT
    CHECK (booking_destination_type IS NULL OR booking_destination_type IN (
      'provider_booking_page', 'operator_website', 'phone', 'email'
    )),
  booking_url TEXT,
  booking_phone TEXT,
  booking_email TEXT,
  booking_instructions TEXT
    CHECK (
      booking_instructions IS NULL
      OR char_length(booking_instructions) <= 300
    ),
  append_tracking_params BOOLEAN NOT NULL DEFAULT true,

  link_status TEXT NOT NULL DEFAULT 'unchecked'
    CHECK (link_status IN ('unchecked', 'ok', 'broken')),
  link_last_checked_at TIMESTAMPTZ,
  link_consecutive_failures INTEGER NOT NULL DEFAULT 0
    CHECK (link_consecutive_failures >= 0),

  publish_at TIMESTAMPTZ,
  sales_cutoff_minutes INTEGER
    CHECK (
      sales_cutoff_minutes IS NULL
      OR (sales_cutoff_minutes >= 0 AND sales_cutoff_minutes <= 1440)
    ),

  last_attested_at TIMESTAMPTZ,
  attestation_expires_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  first_published_at TIMESTAMPTZ,

  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT deals_tags_max CHECK (cardinality(tags) <= 10),
  CONSTRAINT deals_highlights_max CHECK (cardinality(highlights) <= 6),
  CONSTRAINT deals_highlights_item_len CHECK (
    NOT EXISTS (
      SELECT 1 FROM unnest(highlights) AS h(v) WHERE char_length(v) > 80
    )
  ),
  CONSTRAINT deals_inclusions_max CHECK (cardinality(inclusions) <= 15),
  CONSTRAINT deals_exclusions_max CHECK (cardinality(exclusions) <= 15),
  CONSTRAINT deals_what_to_bring_max CHECK (cardinality(what_to_bring) <= 15)
);

CREATE INDEX idx_marketplace_deals_operator_status
  ON marketplace.deals (operator_id, status);

CREATE INDEX idx_marketplace_deals_integration_status
  ON marketplace.deals (integration_id, status)
  WHERE integration_id IS NOT NULL;

CREATE TRIGGER update_marketplace_deals_updated_at
  BEFORE UPDATE ON marketplace.deals
  FOR EACH ROW
  EXECUTE FUNCTION marketplace.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE marketplace.deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view operator deals"
  ON marketplace.deals FOR SELECT
  USING (marketplace.is_operator_member(operator_id));

CREATE POLICY "Public can view live deals"
  ON marketplace.deals FOR SELECT
  USING (status = 'live');

CREATE POLICY "Owners and managers can create deals"
  ON marketplace.deals FOR INSERT
  WITH CHECK (marketplace.is_operator_owner_or_manager(operator_id));

CREATE POLICY "Owners and managers can update deals"
  ON marketplace.deals FOR UPDATE
  USING (marketplace.is_operator_owner_or_manager(operator_id));

CREATE POLICY "Owners and managers can delete deals"
  ON marketplace.deals FOR DELETE
  USING (marketplace.is_operator_owner_or_manager(operator_id));

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
GRANT SELECT ON marketplace.deals TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON marketplace.deals TO authenticated, service_role;
