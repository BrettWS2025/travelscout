-- ============================================================================
-- Deals platform Chunk 7: Integration, ExternalProduct, ExternalSession,
-- SyncLog, DealRule + encrypted secret store
-- ============================================================================
-- Provider connections and auto-deal rules for marketplace.operators.
-- credentials_ref / webhook_secret_ref point at marketplace.encrypted_secrets;
-- never store plaintext credentials on Integration. API serializers must omit
-- both refs (see web/lib/marketplace/integration.ts).
--
-- Also wires deferred FKs from Chunks 3–4:
--   operator_deals.integration_id / external_product_id / deal_rule_id
--   deal_sessions.external_session_id
-- Enum string values match web/lib/marketplace/enums.ts.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- encrypted_secrets (server-only; values are AES-GCM ciphertext)
-- ---------------------------------------------------------------------------
CREATE TABLE marketplace.encrypted_secrets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Opaque ciphertext blob produced by web/lib/marketplace/secrets.ts
  ciphertext TEXT NOT NULL,
  -- Optional label for ops (never the secret itself)
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_marketplace_encrypted_secrets_updated_at
  BEFORE UPDATE ON marketplace.encrypted_secrets
  FOR EACH ROW
  EXECUTE FUNCTION marketplace.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- integrations
-- ---------------------------------------------------------------------------
CREATE TABLE marketplace.integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  operator_id UUID NOT NULL
    REFERENCES marketplace.operators(id) ON DELETE CASCADE,

  -- source_provider minus 'manual'
  provider TEXT NOT NULL
    CHECK (provider IN ('rezdy', 'fareharbor', 'bokun', 'checkfront')),
  status TEXT NOT NULL DEFAULT 'not_connected'
    CHECK (status IN (
      'not_connected', 'connecting', 'connected', 'degraded', 'error', 'disconnected'
    )),
  auth_type TEXT
    CHECK (auth_type IS NULL OR auth_type IN ('api_key', 'oauth', 'marketplace')),

  -- Pointers into marketplace.encrypted_secrets — never the secret itself
  credentials_ref TEXT,
  webhook_secret_ref TEXT,

  external_account_id TEXT,
  external_account_name TEXT,

  sync_mode TEXT
    CHECK (sync_mode IS NULL OR sync_mode IN ('webhook', 'polling', 'hybrid')),
  poll_interval_seconds INTEGER
    CHECK (
      poll_interval_seconds IS NULL
      OR poll_interval_seconds >= 1
    ),
  webhook_last_received_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  last_successful_sync_at TIMESTAMPTZ,
  last_error_code TEXT,
  last_error_message TEXT,

  default_booking_destination_type TEXT
    CHECK (
      default_booking_destination_type IS NULL
      OR default_booking_destination_type IN (
        'provider_booking_page', 'operator_website', 'phone', 'email'
      )
    ),
  booking_base_url TEXT,
  conversion_tracking_method TEXT NOT NULL DEFAULT 'none'
    CHECK (conversion_tracking_method IN (
      'none', 'promo_code', 'booking_source', 'webhook'
    )),
  booking_source_label TEXT,
  auto_enable_new_products BOOLEAN NOT NULL DEFAULT false,

  connected_at TIMESTAMPTZ,
  connected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One active connection per provider per operator (disconnected rows may repeat)
CREATE UNIQUE INDEX idx_marketplace_integrations_operator_provider_active
  ON marketplace.integrations (operator_id, provider)
  WHERE status <> 'disconnected';

CREATE INDEX idx_marketplace_integrations_operator_id
  ON marketplace.integrations (operator_id);

CREATE INDEX idx_marketplace_integrations_status
  ON marketplace.integrations (status);

CREATE TRIGGER update_marketplace_integrations_updated_at
  BEFORE UPDATE ON marketplace.integrations
  FOR EACH ROW
  EXECUTE FUNCTION marketplace.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- external_products
-- ---------------------------------------------------------------------------
CREATE TABLE marketplace.external_products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  integration_id UUID NOT NULL
    REFERENCES marketplace.integrations(id) ON DELETE CASCADE,

  external_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  images JSONB NOT NULL DEFAULT '[]'::jsonb,
  duration_minutes INTEGER
    CHECK (
      duration_minutes IS NULL
      OR (duration_minutes >= 1 AND duration_minutes <= 20160)
    ),
  location JSONB NOT NULL DEFAULT '{}'::jsonb,
  price_options JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_enabled_for_deals BOOLEAN NOT NULL DEFAULT false,
  archived_in_provider BOOLEAN NOT NULL DEFAULT false,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (integration_id, external_id)
);

CREATE INDEX idx_marketplace_external_products_integration_id
  ON marketplace.external_products (integration_id);

CREATE INDEX idx_marketplace_external_products_enabled
  ON marketplace.external_products (integration_id)
  WHERE is_enabled_for_deals = true AND archived_in_provider = false;

CREATE TRIGGER update_marketplace_external_products_updated_at
  BEFORE UPDATE ON marketplace.external_products
  FOR EACH ROW
  EXECUTE FUNCTION marketplace.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- external_sessions
-- ---------------------------------------------------------------------------
CREATE TABLE marketplace.external_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_product_id UUID NOT NULL
    REFERENCES marketplace.external_products(id) ON DELETE CASCADE,

  external_id TEXT NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  seats_available INTEGER
    CHECK (seats_available IS NULL OR seats_available >= 0),
  total_capacity INTEGER
    CHECK (total_capacity IS NULL OR total_capacity >= 0),
  status TEXT NOT NULL DEFAULT 'live'
    CHECK (status IN ('live', 'sold_out', 'cancelled', 'expired')),
  prices JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_synced_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (external_product_id, external_id)
);

CREATE INDEX idx_marketplace_external_sessions_product_id
  ON marketplace.external_sessions (external_product_id);

CREATE INDEX idx_marketplace_external_sessions_start_at
  ON marketplace.external_sessions (external_product_id, start_at);

CREATE TRIGGER update_marketplace_external_sessions_updated_at
  BEFORE UPDATE ON marketplace.external_sessions
  FOR EACH ROW
  EXECUTE FUNCTION marketplace.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- sync_logs
-- ---------------------------------------------------------------------------
CREATE TABLE marketplace.sync_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  integration_id UUID NOT NULL
    REFERENCES marketplace.integrations(id) ON DELETE CASCADE,

  sync_type TEXT NOT NULL
    CHECK (sync_type IN (
      'full', 'incremental', 'webhook', 'click_recheck', 'manual'
    )),
  status TEXT NOT NULL
    CHECK (status IN ('running', 'success', 'failed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  items_processed INTEGER NOT NULL DEFAULT 0
    CHECK (items_processed >= 0),
  error_code TEXT,
  error_message TEXT,
  affected_deal_ids UUID[] NOT NULL DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_marketplace_sync_logs_integration_id
  ON marketplace.sync_logs (integration_id, started_at DESC);

CREATE INDEX idx_marketplace_sync_logs_status
  ON marketplace.sync_logs (integration_id, status);

CREATE TRIGGER update_marketplace_sync_logs_updated_at
  BEFORE UPDATE ON marketplace.sync_logs
  FOR EACH ROW
  EXECUTE FUNCTION marketplace.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- deal_rules (auto-deal rules; integrated products only)
-- ---------------------------------------------------------------------------
CREATE TABLE marketplace.deal_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  operator_id UUID NOT NULL
    REFERENCES marketplace.operators(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL
    REFERENCES marketplace.integrations(id) ON DELETE CASCADE,
  external_product_id UUID NOT NULL
    REFERENCES marketplace.external_products(id) ON DELETE CASCADE,

  name TEXT NOT NULL
    CHECK (char_length(name) >= 1 AND char_length(name) <= 120),
  is_active BOOLEAN NOT NULL DEFAULT true,
  rule_type TEXT NOT NULL
    CHECK (rule_type IN ('daily', 'weekly', 'specific_dates')),

  days_of_week INTEGER[] NOT NULL DEFAULT '{}',
  specific_dates DATE[] NOT NULL DEFAULT '{}',
  session_times TEXT[] NOT NULL DEFAULT '{}',

  -- App enforces ≤ MAX_LEAD_HOURS from config; DB floor matches default (72).
  list_hours_before_start INTEGER NOT NULL
    CHECK (list_hours_before_start >= 1 AND list_hours_before_start <= 72),
  min_unsold_seats INTEGER NOT NULL
    CHECK (min_unsold_seats >= 1),
  seat_cap INTEGER
    CHECK (seat_cap IS NULL OR (seat_cap >= 1 AND seat_cap <= 999)),

  price_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  discount_mechanism TEXT NOT NULL
    CHECK (discount_mechanism IN (
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

  template_deal_id UUID NOT NULL
    REFERENCES marketplace.operator_deals(id) ON DELETE RESTRICT,
  auto_publish BOOLEAN NOT NULL DEFAULT false,

  start_date DATE NOT NULL,
  end_date DATE,

  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- days_of_week (0–6) and session_times ("HH:MM") validated in
  -- web/lib/marketplace/integration.ts (Postgres CHECK cannot use subqueries).
);

CREATE INDEX idx_marketplace_deal_rules_operator_id
  ON marketplace.deal_rules (operator_id);

CREATE INDEX idx_marketplace_deal_rules_integration_id
  ON marketplace.deal_rules (integration_id);

CREATE INDEX idx_marketplace_deal_rules_active
  ON marketplace.deal_rules (operator_id)
  WHERE is_active = true;

CREATE TRIGGER update_marketplace_deal_rules_updated_at
  BEFORE UPDATE ON marketplace.deal_rules
  FOR EACH ROW
  EXECUTE FUNCTION marketplace.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Deferred FKs from Chunks 3–4
-- ---------------------------------------------------------------------------
ALTER TABLE marketplace.operator_deals
  ADD CONSTRAINT operator_deals_integration_id_fkey
    FOREIGN KEY (integration_id)
    REFERENCES marketplace.integrations(id)
    ON DELETE SET NULL;

ALTER TABLE marketplace.operator_deals
  ADD CONSTRAINT operator_deals_external_product_id_fkey
    FOREIGN KEY (external_product_id)
    REFERENCES marketplace.external_products(id)
    ON DELETE SET NULL;

ALTER TABLE marketplace.operator_deals
  ADD CONSTRAINT operator_deals_deal_rule_id_fkey
    FOREIGN KEY (deal_rule_id)
    REFERENCES marketplace.deal_rules(id)
    ON DELETE SET NULL;

ALTER TABLE marketplace.deal_sessions
  ADD CONSTRAINT deal_sessions_external_session_id_fkey
    FOREIGN KEY (external_session_id)
    REFERENCES marketplace.external_sessions(id)
    ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Helpers for RLS (integration → operator)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION marketplace.operator_id_for_integration(integ_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = marketplace, public
AS $$
  SELECT operator_id
  FROM marketplace.integrations
  WHERE id = integ_id;
$$;

CREATE OR REPLACE FUNCTION marketplace.operator_id_for_external_product(prod_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = marketplace, public
AS $$
  SELECT i.operator_id
  FROM marketplace.external_products p
  JOIN marketplace.integrations i ON i.id = p.integration_id
  WHERE p.id = prod_id;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE marketplace.encrypted_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace.integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace.external_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace.external_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace.sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace.deal_rules ENABLE ROW LEVEL SECURITY;

-- encrypted_secrets: no client policies — service_role / SECURITY DEFINER only
-- (RLS on + no policies = deny for authenticated/anon)

-- integrations
CREATE POLICY "Members can view integrations"
  ON marketplace.integrations FOR SELECT
  USING (marketplace.is_operator_member(operator_id));

CREATE POLICY "Owners and managers can insert integrations"
  ON marketplace.integrations FOR INSERT
  WITH CHECK (marketplace.is_operator_owner_or_manager(operator_id));

CREATE POLICY "Owners and managers can update integrations"
  ON marketplace.integrations FOR UPDATE
  USING (marketplace.is_operator_owner_or_manager(operator_id));

CREATE POLICY "Owners and managers can delete integrations"
  ON marketplace.integrations FOR DELETE
  USING (marketplace.is_operator_owner_or_manager(operator_id));

-- external_products
CREATE POLICY "Members can view external products"
  ON marketplace.external_products FOR SELECT
  USING (
    marketplace.is_operator_member(
      marketplace.operator_id_for_integration(integration_id)
    )
  );

CREATE POLICY "Owners and managers can insert external products"
  ON marketplace.external_products FOR INSERT
  WITH CHECK (
    marketplace.is_operator_owner_or_manager(
      marketplace.operator_id_for_integration(integration_id)
    )
  );

CREATE POLICY "Owners and managers can update external products"
  ON marketplace.external_products FOR UPDATE
  USING (
    marketplace.is_operator_owner_or_manager(
      marketplace.operator_id_for_integration(integration_id)
    )
  );

CREATE POLICY "Owners and managers can delete external products"
  ON marketplace.external_products FOR DELETE
  USING (
    marketplace.is_operator_owner_or_manager(
      marketplace.operator_id_for_integration(integration_id)
    )
  );

-- external_sessions
CREATE POLICY "Members can view external sessions"
  ON marketplace.external_sessions FOR SELECT
  USING (
    marketplace.is_operator_member(
      marketplace.operator_id_for_external_product(external_product_id)
    )
  );

CREATE POLICY "Owners and managers can insert external sessions"
  ON marketplace.external_sessions FOR INSERT
  WITH CHECK (
    marketplace.is_operator_owner_or_manager(
      marketplace.operator_id_for_external_product(external_product_id)
    )
  );

CREATE POLICY "Owners and managers can update external sessions"
  ON marketplace.external_sessions FOR UPDATE
  USING (
    marketplace.is_operator_owner_or_manager(
      marketplace.operator_id_for_external_product(external_product_id)
    )
  );

CREATE POLICY "Owners and managers can delete external sessions"
  ON marketplace.external_sessions FOR DELETE
  USING (
    marketplace.is_operator_owner_or_manager(
      marketplace.operator_id_for_external_product(external_product_id)
    )
  );

-- sync_logs
CREATE POLICY "Members can view sync logs"
  ON marketplace.sync_logs FOR SELECT
  USING (
    marketplace.is_operator_member(
      marketplace.operator_id_for_integration(integration_id)
    )
  );

CREATE POLICY "Owners and managers can insert sync logs"
  ON marketplace.sync_logs FOR INSERT
  WITH CHECK (
    marketplace.is_operator_owner_or_manager(
      marketplace.operator_id_for_integration(integration_id)
    )
  );

CREATE POLICY "Owners and managers can update sync logs"
  ON marketplace.sync_logs FOR UPDATE
  USING (
    marketplace.is_operator_owner_or_manager(
      marketplace.operator_id_for_integration(integration_id)
    )
  );

-- deal_rules
CREATE POLICY "Members can view deal rules"
  ON marketplace.deal_rules FOR SELECT
  USING (marketplace.is_operator_member(operator_id));

CREATE POLICY "Owners and managers can insert deal rules"
  ON marketplace.deal_rules FOR INSERT
  WITH CHECK (marketplace.is_operator_owner_or_manager(operator_id));

CREATE POLICY "Owners and managers can update deal rules"
  ON marketplace.deal_rules FOR UPDATE
  USING (marketplace.is_operator_owner_or_manager(operator_id));

CREATE POLICY "Owners and managers can delete deal rules"
  ON marketplace.deal_rules FOR DELETE
  USING (marketplace.is_operator_owner_or_manager(operator_id));

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- Secrets: service_role only (never expose ciphertext to clients)
GRANT SELECT, INSERT, UPDATE, DELETE ON marketplace.encrypted_secrets
  TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON marketplace.integrations
  TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON marketplace.external_products
  TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON marketplace.external_sessions
  TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE ON marketplace.sync_logs
  TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON marketplace.deal_rules
  TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION marketplace.operator_id_for_integration(UUID)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION marketplace.operator_id_for_external_product(UUID)
  TO anon, authenticated, service_role;
