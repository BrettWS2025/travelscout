-- ============================================================================
-- Deals platform Chunk 6: DealEvent, DealAttestation, ClickEvent,
-- DealMetricDaily, DealTemplate
-- ============================================================================
-- Child / supporting tables for marketplace.operator_deals (inventory Deal —
-- not the legacy marketplace.deals feed). DealEvent is append-only: UPDATE and
-- DELETE are blocked by triggers and not granted to roles.
-- Enum string values match web/lib/marketplace/enums.ts.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- deal_events (append-only audit trail)
-- ---------------------------------------------------------------------------
CREATE TABLE marketplace.deal_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_id UUID NOT NULL
    REFERENCES marketplace.operator_deals(id) ON DELETE CASCADE,

  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'created', 'updated', 'published', 'scheduled', 'submitted_for_review',
      'approved', 'rejected', 'paused', 'auto_paused', 'resumed', 'auto_resumed',
      'sold_out', 'expired', 'ended', 'archived', 'price_changed', 'seats_changed',
      'session_added', 'session_removed', 'attested', 'link_broken', 'link_ok'
    )),
  actor_type TEXT NOT NULL
    CHECK (actor_type IN ('user', 'system', 'admin')),
  actor_id UUID,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_marketplace_deal_events_deal_id
  ON marketplace.deal_events (deal_id, created_at DESC);

CREATE INDEX idx_marketplace_deal_events_event_type
  ON marketplace.deal_events (deal_id, event_type);

-- Append-only: block UPDATE and DELETE at the database level
CREATE OR REPLACE FUNCTION marketplace.prevent_deal_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = marketplace, public
AS $$
BEGIN
  RAISE EXCEPTION 'deal_events is append-only: % not allowed', TG_OP
    USING ERRCODE = 'raise_exception';
END;
$$;

CREATE TRIGGER marketplace_deal_events_no_update
  BEFORE UPDATE ON marketplace.deal_events
  FOR EACH ROW
  EXECUTE FUNCTION marketplace.prevent_deal_event_mutation();

CREATE TRIGGER marketplace_deal_events_no_delete
  BEFORE DELETE ON marketplace.deal_events
  FOR EACH ROW
  EXECUTE FUNCTION marketplace.prevent_deal_event_mutation();

-- ---------------------------------------------------------------------------
-- deal_attestations
-- ---------------------------------------------------------------------------
CREATE TABLE marketplace.deal_attestations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_id UUID NOT NULL
    REFERENCES marketplace.operator_deals(id) ON DELETE CASCADE,

  -- Nullable for token-based (email/sms) attestations before a user is linked
  attested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  attested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  method TEXT NOT NULL
    CHECK (method IN ('dashboard', 'email_link', 'sms_link')),
  seats_by_session JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_marketplace_deal_attestations_deal_id
  ON marketplace.deal_attestations (deal_id, attested_at DESC);

CREATE TRIGGER update_marketplace_deal_attestations_updated_at
  BEFORE UPDATE ON marketplace.deal_attestations
  FOR EACH ROW
  EXECUTE FUNCTION marketplace.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- click_events
-- ---------------------------------------------------------------------------
CREATE TABLE marketplace.click_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_id UUID NOT NULL
    REFERENCES marketplace.operator_deals(id) ON DELETE CASCADE,
  deal_session_id UUID
    REFERENCES marketplace.deal_sessions(id) ON DELETE SET NULL,

  click_id TEXT NOT NULL UNIQUE,
  visitor_id TEXT,
  recheck_result TEXT
    CHECK (
      recheck_result IS NULL
      OR recheck_result IN ('available', 'sold_out', 'error')
    ),
  redirect_url TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_marketplace_click_events_deal_id
  ON marketplace.click_events (deal_id, created_at DESC);

CREATE INDEX idx_marketplace_click_events_visitor_id
  ON marketplace.click_events (visitor_id)
  WHERE visitor_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- deal_metric_daily
-- ---------------------------------------------------------------------------
CREATE TABLE marketplace.deal_metric_daily (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_id UUID NOT NULL
    REFERENCES marketplace.operator_deals(id) ON DELETE CASCADE,

  -- Local calendar date for the operator (rollup job converts from UTC)
  date DATE NOT NULL,
  impressions INTEGER NOT NULL DEFAULT 0
    CHECK (impressions >= 0),
  detail_views INTEGER NOT NULL DEFAULT 0
    CHECK (detail_views >= 0),
  booking_clicks INTEGER NOT NULL DEFAULT 0
    CHECK (booking_clicks >= 0),
  sold_out_on_click INTEGER NOT NULL DEFAULT 0
    CHECK (sold_out_on_click >= 0),
  attributed_bookings INTEGER NOT NULL DEFAULT 0
    CHECK (attributed_bookings >= 0),
  attributed_revenue_minor INTEGER NOT NULL DEFAULT 0
    CHECK (attributed_revenue_minor >= 0),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (deal_id, date)
);

CREATE INDEX idx_marketplace_deal_metric_daily_deal_date
  ON marketplace.deal_metric_daily (deal_id, date DESC);

CREATE TRIGGER update_marketplace_deal_metric_daily_updated_at
  BEFORE UPDATE ON marketplace.deal_metric_daily
  FOR EACH ROW
  EXECUTE FUNCTION marketplace.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- deal_templates
-- ---------------------------------------------------------------------------
CREATE TABLE marketplace.deal_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  operator_id UUID NOT NULL
    REFERENCES marketplace.operators(id) ON DELETE CASCADE,

  name TEXT NOT NULL
    CHECK (char_length(name) >= 1 AND char_length(name) <= 120),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_marketplace_deal_templates_operator_id
  ON marketplace.deal_templates (operator_id);

CREATE TRIGGER update_marketplace_deal_templates_updated_at
  BEFORE UPDATE ON marketplace.deal_templates
  FOR EACH ROW
  EXECUTE FUNCTION marketplace.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE marketplace.deal_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace.deal_attestations ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace.click_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace.deal_metric_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace.deal_templates ENABLE ROW LEVEL SECURITY;

-- deal_events: members read; owners/managers insert; no update/delete policies
CREATE POLICY "Members can view deal events"
  ON marketplace.deal_events FOR SELECT
  USING (
    marketplace.is_operator_member(
      marketplace.operator_id_for_deal(deal_id)
    )
  );

CREATE POLICY "Owners and managers can insert deal events"
  ON marketplace.deal_events FOR INSERT
  WITH CHECK (
    marketplace.is_operator_owner_or_manager(
      marketplace.operator_id_for_deal(deal_id)
    )
  );

-- deal_attestations
CREATE POLICY "Members can view deal attestations"
  ON marketplace.deal_attestations FOR SELECT
  USING (
    marketplace.is_operator_member(
      marketplace.operator_id_for_deal(deal_id)
    )
  );

CREATE POLICY "Owners and managers can insert deal attestations"
  ON marketplace.deal_attestations FOR INSERT
  WITH CHECK (
    marketplace.is_operator_owner_or_manager(
      marketplace.operator_id_for_deal(deal_id)
    )
  );

-- click_events (Book now writes land via service_role / later public path)
CREATE POLICY "Members can view click events"
  ON marketplace.click_events FOR SELECT
  USING (
    marketplace.is_operator_member(
      marketplace.operator_id_for_deal(deal_id)
    )
  );

CREATE POLICY "Service and members can insert click events"
  ON marketplace.click_events FOR INSERT
  WITH CHECK (
    marketplace.is_operator_member(
      marketplace.operator_id_for_deal(deal_id)
    )
    OR marketplace.is_operator_owner_or_manager(
      marketplace.operator_id_for_deal(deal_id)
    )
  );

-- deal_metric_daily
CREATE POLICY "Members can view deal metrics"
  ON marketplace.deal_metric_daily FOR SELECT
  USING (
    marketplace.is_operator_member(
      marketplace.operator_id_for_deal(deal_id)
    )
  );

CREATE POLICY "Owners and managers can upsert deal metrics"
  ON marketplace.deal_metric_daily FOR INSERT
  WITH CHECK (
    marketplace.is_operator_owner_or_manager(
      marketplace.operator_id_for_deal(deal_id)
    )
  );

CREATE POLICY "Owners and managers can update deal metrics"
  ON marketplace.deal_metric_daily FOR UPDATE
  USING (
    marketplace.is_operator_owner_or_manager(
      marketplace.operator_id_for_deal(deal_id)
    )
  );

-- deal_templates (operator-scoped)
CREATE POLICY "Members can view deal templates"
  ON marketplace.deal_templates FOR SELECT
  USING (marketplace.is_operator_member(operator_id));

CREATE POLICY "Owners and managers can insert deal templates"
  ON marketplace.deal_templates FOR INSERT
  WITH CHECK (marketplace.is_operator_owner_or_manager(operator_id));

CREATE POLICY "Owners and managers can update deal templates"
  ON marketplace.deal_templates FOR UPDATE
  USING (marketplace.is_operator_owner_or_manager(operator_id));

CREATE POLICY "Owners and managers can delete deal templates"
  ON marketplace.deal_templates FOR DELETE
  USING (marketplace.is_operator_owner_or_manager(operator_id));

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- deal_events: SELECT + INSERT only (append-only)
GRANT SELECT, INSERT ON marketplace.deal_events
  TO authenticated, service_role;
GRANT SELECT ON marketplace.deal_events TO anon;

GRANT SELECT ON marketplace.deal_attestations
  TO authenticated, service_role;
GRANT INSERT ON marketplace.deal_attestations
  TO authenticated, service_role;

GRANT SELECT ON marketplace.click_events
  TO authenticated, service_role;
GRANT INSERT ON marketplace.click_events
  TO anon, authenticated, service_role;

GRANT SELECT ON marketplace.deal_metric_daily
  TO authenticated, service_role;
GRANT INSERT, UPDATE ON marketplace.deal_metric_daily
  TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON marketplace.deal_templates
  TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION marketplace.prevent_deal_event_mutation()
  TO authenticated, service_role;
