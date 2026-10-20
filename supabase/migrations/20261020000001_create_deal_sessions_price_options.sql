-- ============================================================================
-- Deals platform Chunk 4: DealSession, DealPriceOption, DiscountStep
-- ============================================================================
-- Child tables of marketplace.operator_deals (inventory Deal — not the legacy
-- marketplace.deals feed). external_session_id is a UUID column without FK
-- until Chunk 7 creates ExternalSession.
-- Enum string values match web/lib/marketplace/enums.ts.
-- seats_displayed is system-owned; app recomputes via computeSeatsDisplayed.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- deal_sessions
-- ---------------------------------------------------------------------------
CREATE TABLE marketplace.deal_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_id UUID NOT NULL
    REFERENCES marketplace.operator_deals(id) ON DELETE CASCADE,

  -- FK added in Chunk 7 when ExternalSession exists
  external_session_id UUID,

  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,

  provider_seats_available INTEGER
    CHECK (
      provider_seats_available IS NULL
      OR provider_seats_available >= 0
    ),
  manual_seats_available INTEGER
    CHECK (
      manual_seats_available IS NULL
      OR (
        manual_seats_available >= 0
        AND manual_seats_available <= 999
      )
    ),
  seat_cap INTEGER
    CHECK (seat_cap IS NULL OR (seat_cap >= 1 AND seat_cap <= 999)),
  seats_displayed INTEGER NOT NULL DEFAULT 0
    CHECK (seats_displayed >= 0),

  status TEXT NOT NULL DEFAULT 'live'
    CHECK (status IN ('live', 'sold_out', 'cancelled', 'expired')),

  last_synced_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_marketplace_deal_sessions_deal_id
  ON marketplace.deal_sessions (deal_id);

CREATE INDEX idx_marketplace_deal_sessions_deal_start
  ON marketplace.deal_sessions (deal_id, start_at);

CREATE TRIGGER update_marketplace_deal_sessions_updated_at
  BEFORE UPDATE ON marketplace.deal_sessions
  FOR EACH ROW
  EXECUTE FUNCTION marketplace.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- deal_price_options
-- ---------------------------------------------------------------------------
CREATE TABLE marketplace.deal_price_options (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_id UUID NOT NULL
    REFERENCES marketplace.operator_deals(id) ON DELETE CASCADE,

  label TEXT NOT NULL,
  type TEXT NOT NULL
    CHECK (type IN (
      'adult', 'child', 'infant', 'senior', 'student',
      'family', 'group', 'per_unit'
    )),

  external_price_option_id TEXT,
  external_deal_price_option_id TEXT,

  original_price_minor INTEGER NOT NULL
    CHECK (original_price_minor >= 0),
  original_price_source TEXT NOT NULL
    CHECK (original_price_source IN ('provider', 'operator_entered')),
  original_price_evidence_url TEXT,

  deal_price_minor INTEGER NOT NULL
    CHECK (deal_price_minor >= 0),
  -- System-computed (Chunk 10); stored as 1 decimal place (e.g. 50.0)
  discount_pct NUMERIC(5, 1),

  sort_order INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_marketplace_deal_price_options_deal_id
  ON marketplace.deal_price_options (deal_id, sort_order);

CREATE TRIGGER update_marketplace_deal_price_options_updated_at
  BEFORE UPDATE ON marketplace.deal_price_options
  FOR EACH ROW
  EXECUTE FUNCTION marketplace.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- discount_steps
-- ---------------------------------------------------------------------------
CREATE TABLE marketplace.discount_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_id UUID NOT NULL
    REFERENCES marketplace.operator_deals(id) ON DELETE CASCADE,
  price_option_id UUID NOT NULL
    REFERENCES marketplace.deal_price_options(id) ON DELETE CASCADE,

  -- App enforces ≤ MAX_LEAD_HOURS from config; DB upper bound matches default (72).
  hours_before_start INTEGER NOT NULL
    CHECK (hours_before_start >= 1 AND hours_before_start <= 72),
  deal_price_minor INTEGER NOT NULL
    CHECK (deal_price_minor >= 0),
  promo_code TEXT
    CHECK (
      promo_code IS NULL
      OR (
        char_length(promo_code) >= 3
        AND char_length(promo_code) <= 30
        AND promo_code ~ '^[A-Z0-9_-]+$'
      )
    ),
  external_deal_price_option_id TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_marketplace_discount_steps_deal_id
  ON marketplace.discount_steps (deal_id);

CREATE INDEX idx_marketplace_discount_steps_price_option_id
  ON marketplace.discount_steps (price_option_id, hours_before_start);

CREATE TRIGGER update_marketplace_discount_steps_updated_at
  BEFORE UPDATE ON marketplace.discount_steps
  FOR EACH ROW
  EXECUTE FUNCTION marketplace.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Row Level Security (via parent operator_deals.operator_id)
-- ---------------------------------------------------------------------------
ALTER TABLE marketplace.deal_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace.deal_price_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace.discount_steps ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION marketplace.operator_id_for_deal(p_deal_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = marketplace, public
AS $$
  SELECT d.operator_id
  FROM marketplace.operator_deals d
  WHERE d.id = p_deal_id
$$;

CREATE POLICY "Members can view deal sessions"
  ON marketplace.deal_sessions FOR SELECT
  USING (
    marketplace.is_operator_member(
      marketplace.operator_id_for_deal(deal_id)
    )
  );

CREATE POLICY "Public can view sessions for live deals"
  ON marketplace.deal_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM marketplace.operator_deals d
      WHERE d.id = deal_id AND d.status = 'live'
    )
  );

CREATE POLICY "Owners and managers can insert deal sessions"
  ON marketplace.deal_sessions FOR INSERT
  WITH CHECK (
    marketplace.is_operator_owner_or_manager(
      marketplace.operator_id_for_deal(deal_id)
    )
  );

CREATE POLICY "Owners and managers can update deal sessions"
  ON marketplace.deal_sessions FOR UPDATE
  USING (
    marketplace.is_operator_owner_or_manager(
      marketplace.operator_id_for_deal(deal_id)
    )
  );

CREATE POLICY "Owners and managers can delete deal sessions"
  ON marketplace.deal_sessions FOR DELETE
  USING (
    marketplace.is_operator_owner_or_manager(
      marketplace.operator_id_for_deal(deal_id)
    )
  );

CREATE POLICY "Members can view deal price options"
  ON marketplace.deal_price_options FOR SELECT
  USING (
    marketplace.is_operator_member(
      marketplace.operator_id_for_deal(deal_id)
    )
  );

CREATE POLICY "Public can view price options for live deals"
  ON marketplace.deal_price_options FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM marketplace.operator_deals d
      WHERE d.id = deal_id AND d.status = 'live'
    )
  );

CREATE POLICY "Owners and managers can insert deal price options"
  ON marketplace.deal_price_options FOR INSERT
  WITH CHECK (
    marketplace.is_operator_owner_or_manager(
      marketplace.operator_id_for_deal(deal_id)
    )
  );

CREATE POLICY "Owners and managers can update deal price options"
  ON marketplace.deal_price_options FOR UPDATE
  USING (
    marketplace.is_operator_owner_or_manager(
      marketplace.operator_id_for_deal(deal_id)
    )
  );

CREATE POLICY "Owners and managers can delete deal price options"
  ON marketplace.deal_price_options FOR DELETE
  USING (
    marketplace.is_operator_owner_or_manager(
      marketplace.operator_id_for_deal(deal_id)
    )
  );

CREATE POLICY "Members can view discount steps"
  ON marketplace.discount_steps FOR SELECT
  USING (
    marketplace.is_operator_member(
      marketplace.operator_id_for_deal(deal_id)
    )
  );

CREATE POLICY "Public can view discount steps for live deals"
  ON marketplace.discount_steps FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM marketplace.operator_deals d
      WHERE d.id = deal_id AND d.status = 'live'
    )
  );

CREATE POLICY "Owners and managers can insert discount steps"
  ON marketplace.discount_steps FOR INSERT
  WITH CHECK (
    marketplace.is_operator_owner_or_manager(
      marketplace.operator_id_for_deal(deal_id)
    )
  );

CREATE POLICY "Owners and managers can update discount steps"
  ON marketplace.discount_steps FOR UPDATE
  USING (
    marketplace.is_operator_owner_or_manager(
      marketplace.operator_id_for_deal(deal_id)
    )
  );

CREATE POLICY "Owners and managers can delete discount steps"
  ON marketplace.discount_steps FOR DELETE
  USING (
    marketplace.is_operator_owner_or_manager(
      marketplace.operator_id_for_deal(deal_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
GRANT SELECT ON marketplace.deal_sessions TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON marketplace.deal_sessions
  TO authenticated, service_role;

GRANT SELECT ON marketplace.deal_price_options
  TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON marketplace.deal_price_options
  TO authenticated, service_role;

GRANT SELECT ON marketplace.discount_steps
  TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON marketplace.discount_steps
  TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION marketplace.operator_id_for_deal(UUID)
  TO anon, authenticated, service_role;
