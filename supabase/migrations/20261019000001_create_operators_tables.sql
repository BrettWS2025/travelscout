-- ============================================================================
-- Deals platform Chunk 2: Operator, OperatorBookingDefaults, TeamMember
-- ============================================================================
-- New inventory/settings tables (separate from marketplace.organizations /
-- organization_members used by the current lightweight deals UI).
-- Enum string values match web/lib/marketplace/enums.ts.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- operators
-- ---------------------------------------------------------------------------
CREATE TABLE marketplace.operators (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  legal_name TEXT NOT NULL,
  trading_name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo TEXT,
  cover_image TEXT,
  short_description TEXT
    CHECK (short_description IS NULL OR char_length(short_description) <= 160),
  long_description TEXT
    CHECK (long_description IS NULL OR char_length(long_description) <= 3000),
  website TEXT,
  public_email TEXT,
  public_phone TEXT,
  internal_email TEXT,
  internal_phone TEXT,
  address TEXT,
  regions_served TEXT[] NOT NULL DEFAULT '{}',
  timezone TEXT NOT NULL DEFAULT 'Pacific/Auckland',
  currency TEXT NOT NULL DEFAULT 'NZD',
  languages TEXT[] NOT NULL DEFAULT '{}',
  gst_number TEXT,
  nzbn TEXT,
  social_links JSONB NOT NULL DEFAULT '{}'::jsonb,
  account_status TEXT NOT NULL DEFAULT 'pending_verification'
    CHECK (account_status IN ('pending_verification', 'active', 'suspended')),
  requires_manual_review BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_marketplace_operators_account_status
  ON marketplace.operators (account_status);

CREATE TRIGGER update_marketplace_operators_updated_at
  BEFORE UPDATE ON marketplace.operators
  FOR EACH ROW
  EXECUTE FUNCTION marketplace.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- operator_booking_defaults (exactly one row per operator)
-- ---------------------------------------------------------------------------
CREATE TABLE marketplace.operator_booking_defaults (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  operator_id UUID NOT NULL UNIQUE
    REFERENCES marketplace.operators(id) ON DELETE CASCADE,
  default_sales_cutoff_minutes INTEGER NOT NULL DEFAULT 0
    CHECK (default_sales_cutoff_minutes >= 0 AND default_sales_cutoff_minutes <= 1440),
  default_seat_cap INTEGER
    CHECK (default_seat_cap IS NULL OR (default_seat_cap >= 1 AND default_seat_cap <= 999)),
  -- App enforces ≥ MIN_DISCOUNT_PCT from config; DB floor matches platform default (50).
  default_discount_pct NUMERIC(5, 2) NOT NULL DEFAULT 50
    CHECK (default_discount_pct >= 50 AND default_discount_pct <= 100),
  default_discount_mechanism TEXT NOT NULL DEFAULT 'manual_price'
    CHECK (default_discount_mechanism IN (
      'promo_code', 'price_option', 'separate_product', 'manual_price', 'quote_code'
    )),
  default_booking_destination_type TEXT NOT NULL DEFAULT 'operator_website'
    CHECK (default_booking_destination_type IN (
      'provider_booking_page', 'operator_website', 'phone', 'email'
    )),
  default_booking_url TEXT,
  default_booking_phone TEXT,
  default_booking_email TEXT,
  default_booking_instructions TEXT
    CHECK (
      default_booking_instructions IS NULL
      OR char_length(default_booking_instructions) <= 300
    ),
  default_cancellation_policy_type TEXT NOT NULL DEFAULT 'operator_standard'
    CHECK (default_cancellation_policy_type IN (
      'non_refundable', 'operator_standard', 'custom'
    )),
  default_cancellation_policy_text TEXT
    CHECK (
      default_cancellation_policy_text IS NULL
      OR char_length(default_cancellation_policy_text) <= 1000
    ),
  -- Matches ATTESTATION_REMINDER_HOURS platform default (2).
  default_attestation_reminder_hours INTEGER NOT NULL DEFAULT 2
    CHECK (default_attestation_reminder_hours >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_marketplace_operator_booking_defaults_updated_at
  BEFORE UPDATE ON marketplace.operator_booking_defaults
  FOR EACH ROW
  EXECUTE FUNCTION marketplace.update_updated_at_column();

-- Auto-create booking defaults when an operator is inserted
CREATE OR REPLACE FUNCTION marketplace.create_operator_booking_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = marketplace, public
AS $$
BEGIN
  INSERT INTO marketplace.operator_booking_defaults (operator_id)
  VALUES (NEW.id)
  ON CONFLICT (operator_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER marketplace_operators_create_booking_defaults
  AFTER INSERT ON marketplace.operators
  FOR EACH ROW
  EXECUTE FUNCTION marketplace.create_operator_booking_defaults();

-- ---------------------------------------------------------------------------
-- team_members
-- ---------------------------------------------------------------------------
CREATE TABLE marketplace.team_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  operator_id UUID NOT NULL
    REFERENCES marketplace.operators(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  role TEXT NOT NULL
    CHECK (role IN ('owner', 'manager', 'staff')),
  invited_email TEXT NOT NULL,
  invite_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (invite_status IN ('pending', 'accepted', 'revoked')),
  invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (operator_id, user_id)
);

CREATE INDEX idx_marketplace_team_members_operator_id
  ON marketplace.team_members (operator_id);

CREATE INDEX idx_marketplace_team_members_user_id
  ON marketplace.team_members (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX idx_marketplace_team_members_invited_email
  ON marketplace.team_members (operator_id, lower(invited_email));

CREATE TRIGGER update_marketplace_team_members_updated_at
  BEFORE UPDATE ON marketplace.team_members
  FOR EACH ROW
  EXECUTE FUNCTION marketplace.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Membership helpers (SECURITY DEFINER to avoid RLS recursion)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION marketplace.is_operator_member(op_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = marketplace, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM marketplace.team_members m
    WHERE m.operator_id = op_id
      AND m.user_id = (SELECT auth.uid())
      AND m.invite_status = 'accepted'
  );
$$;

CREATE OR REPLACE FUNCTION marketplace.is_operator_owner_or_manager(op_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = marketplace, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM marketplace.team_members m
    WHERE m.operator_id = op_id
      AND m.user_id = (SELECT auth.uid())
      AND m.invite_status = 'accepted'
      AND m.role IN ('owner', 'manager')
  );
$$;

CREATE OR REPLACE FUNCTION marketplace.is_operator_owner(op_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = marketplace, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM marketplace.team_members m
    WHERE m.operator_id = op_id
      AND m.user_id = (SELECT auth.uid())
      AND m.invite_status = 'accepted'
      AND m.role = 'owner'
  );
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE marketplace.operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace.operator_booking_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace.team_members ENABLE ROW LEVEL SECURITY;

-- operators
CREATE POLICY "Members can view their operators"
  ON marketplace.operators FOR SELECT
  USING (marketplace.is_operator_member(id));

CREATE POLICY "Public can view active operators"
  ON marketplace.operators FOR SELECT
  USING (account_status = 'active');

CREATE POLICY "Authenticated users can create operators"
  ON marketplace.operators FOR INSERT
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "Owners and managers can update operators"
  ON marketplace.operators FOR UPDATE
  USING (marketplace.is_operator_owner_or_manager(id));

CREATE POLICY "Owners can delete operators"
  ON marketplace.operators FOR DELETE
  USING (marketplace.is_operator_owner(id));

-- operator_booking_defaults
CREATE POLICY "Members can view booking defaults"
  ON marketplace.operator_booking_defaults FOR SELECT
  USING (marketplace.is_operator_member(operator_id));

CREATE POLICY "Owners and managers can update booking defaults"
  ON marketplace.operator_booking_defaults FOR UPDATE
  USING (marketplace.is_operator_owner_or_manager(operator_id));

-- Inserts come from the SECURITY DEFINER trigger; allow service_role / definer path.
CREATE POLICY "System can insert booking defaults"
  ON marketplace.operator_booking_defaults FOR INSERT
  WITH CHECK (true);

-- team_members
CREATE POLICY "Members can view team"
  ON marketplace.team_members FOR SELECT
  USING (marketplace.is_operator_member(operator_id));

CREATE POLICY "Owners and managers can add team members"
  ON marketplace.team_members FOR INSERT
  WITH CHECK (marketplace.is_operator_owner_or_manager(operator_id));

CREATE POLICY "Owners and managers can update team members"
  ON marketplace.team_members FOR UPDATE
  USING (marketplace.is_operator_owner_or_manager(operator_id));

CREATE POLICY "Owners and managers can remove team members"
  ON marketplace.team_members FOR DELETE
  USING (marketplace.is_operator_owner_or_manager(operator_id));

-- Bootstrap: first accepted owner may insert themselves when creating an operator
-- (no members yet, so is_operator_owner_or_manager would be false).
CREATE POLICY "Creator can add first owner"
  ON marketplace.team_members FOR INSERT
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND user_id = (SELECT auth.uid())
    AND role = 'owner'
    AND invite_status = 'accepted'
    AND NOT EXISTS (
      SELECT 1 FROM marketplace.team_members m
      WHERE m.operator_id = team_members.operator_id
        AND m.invite_status = 'accepted'
    )
  );

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
GRANT SELECT ON marketplace.operators TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON marketplace.operators TO authenticated, service_role;

GRANT SELECT ON marketplace.operator_booking_defaults
  TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON marketplace.operator_booking_defaults
  TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON marketplace.team_members
  TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION marketplace.is_operator_member(UUID)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION marketplace.is_operator_owner_or_manager(UUID)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION marketplace.is_operator_owner(UUID)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION marketplace.create_operator_booking_defaults()
  TO authenticated, service_role;
