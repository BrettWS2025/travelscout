-- ============================================================================
-- MARKETPLACE SCHEMA
-- ============================================================================
-- Last-minute deals product, intentionally separate from the itinerary
-- planner tables in public (trips, trip_days, activities, itineraries).
--
-- Tables:
--   marketplace.organizations
--   marketplace.organization_members
--   marketplace.deals
--   marketplace.deal_clicks
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS marketplace;

-- ---------------------------------------------------------------------------
-- Helper: updated_at trigger (schema-local)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION marketplace.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------
CREATE TABLE marketplace.organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  website TEXT,
  region TEXT,
  default_booking_provider TEXT NOT NULL DEFAULT 'manual'
    CHECK (default_booking_provider IN ('manual', 'rezdy', 'fareharbor', 'other')),
  -- Optional FareHarbor / Rezdy defaults for affiliate URL building later
  fareharbor_shortname TEXT,
  fareharbor_asn TEXT,
  rezdy_affiliate_code TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_marketplace_organizations_created_by
  ON marketplace.organizations (created_by);

CREATE TRIGGER update_marketplace_organizations_updated_at
  BEFORE UPDATE ON marketplace.organizations
  FOR EACH ROW
  EXECUTE FUNCTION marketplace.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- organization_members
-- ---------------------------------------------------------------------------
CREATE TABLE marketplace.organization_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL
    REFERENCES marketplace.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'owner'
    CHECK (role IN ('owner', 'admin', 'staff')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, user_id)
);

CREATE INDEX idx_marketplace_org_members_user_id
  ON marketplace.organization_members (user_id);

CREATE INDEX idx_marketplace_org_members_organization_id
  ON marketplace.organization_members (organization_id);

CREATE TRIGGER update_marketplace_organization_members_updated_at
  BEFORE UPDATE ON marketplace.organization_members
  FOR EACH ROW
  EXECUTE FUNCTION marketplace.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Membership helpers (SECURITY DEFINER to avoid RLS recursion)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION marketplace.is_org_member(org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = marketplace, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM marketplace.organization_members m
    WHERE m.organization_id = org_id
      AND m.user_id = (SELECT auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION marketplace.is_org_owner_or_admin(org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = marketplace, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM marketplace.organization_members m
    WHERE m.organization_id = org_id
      AND m.user_id = (SELECT auth.uid())
      AND m.role IN ('owner', 'admin')
  );
$$;

-- Bootstrap: when an org is created, add the creator as owner
CREATE OR REPLACE FUNCTION marketplace.add_creator_as_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = marketplace, public
AS $$
BEGIN
  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO marketplace.organization_members (organization_id, user_id, role)
    VALUES (NEW.id, NEW.created_by, 'owner')
    ON CONFLICT (organization_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER marketplace_organizations_add_creator_as_owner
  AFTER INSERT ON marketplace.organizations
  FOR EACH ROW
  EXECUTE FUNCTION marketplace.add_creator_as_owner();

-- ---------------------------------------------------------------------------
-- deals
-- ---------------------------------------------------------------------------
CREATE TABLE marketplace.deals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL
    REFERENCES marketplace.organizations(id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  description TEXT,
  category TEXT,

  -- Location (soft reference to public.places; no hard FK so custom locations work)
  place_id TEXT,
  location_name TEXT,
  latitude DOUBLE PRECISION
    CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  longitude DOUBLE PRECISION
    CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180)),

  -- Last-minute window: departure must be within 3 days when status = live
  departure_at TIMESTAMPTZ NOT NULL,
  spots_left INTEGER CHECK (spots_left IS NULL OR spots_left >= 0),

  original_price NUMERIC(10, 2) CHECK (original_price IS NULL OR original_price >= 0),
  deal_price NUMERIC(10, 2) NOT NULL CHECK (deal_price >= 0),
  currency TEXT NOT NULL DEFAULT 'NZD',

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'live', 'expired', 'sold_out')),

  booking_provider TEXT NOT NULL DEFAULT 'manual'
    CHECK (booking_provider IN ('manual', 'rezdy', 'fareharbor', 'other')),
  booking_url TEXT,
  -- Affiliate / attribution fields for redirect booking (Rezdy / FareHarbor later)
  affiliate_tracking_url TEXT,
  affiliate_asn TEXT,
  affiliate_asn_ref TEXT,
  affiliate_ref TEXT,

  image_url TEXT,
  published_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT deals_live_requires_booking_url CHECK (
    status <> 'live'
    OR (
      booking_url IS NOT NULL
      AND length(trim(booking_url)) > 0
    )
  ),
  CONSTRAINT deals_price_discount CHECK (
    original_price IS NULL OR deal_price <= original_price
  )
);

CREATE INDEX idx_marketplace_deals_organization_id
  ON marketplace.deals (organization_id);

CREATE INDEX idx_marketplace_deals_status_departure
  ON marketplace.deals (status, departure_at);

CREATE INDEX idx_marketplace_deals_place_id
  ON marketplace.deals (place_id)
  WHERE place_id IS NOT NULL;

CREATE INDEX idx_marketplace_deals_live_feed
  ON marketplace.deals (departure_at ASC)
  WHERE status = 'live';

CREATE TRIGGER update_marketplace_deals_updated_at
  BEFORE UPDATE ON marketplace.deals
  FOR EACH ROW
  EXECUTE FUNCTION marketplace.update_updated_at_column();

-- Enforce last-minute window when publishing / keeping a deal live
CREATE OR REPLACE FUNCTION marketplace.enforce_live_deal_window()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'live' THEN
    IF NEW.departure_at < NOW() THEN
      RAISE EXCEPTION 'Live deals require departure_at in the future';
    END IF;
    IF NEW.departure_at > NOW() + INTERVAL '3 days' THEN
      RAISE EXCEPTION 'Live deals require departure_at within 3 days of now';
    END IF;
    IF NEW.published_at IS NULL THEN
      NEW.published_at = NOW();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER marketplace_deals_enforce_live_window
  BEFORE INSERT OR UPDATE ON marketplace.deals
  FOR EACH ROW
  EXECUTE FUNCTION marketplace.enforce_live_deal_window();

-- ---------------------------------------------------------------------------
-- deal_clicks (attribution log for redirect Book CTAs)
-- ---------------------------------------------------------------------------
CREATE TABLE marketplace.deal_clicks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_id UUID NOT NULL
    REFERENCES marketplace.deals(id) ON DELETE CASCADE,
  click_id TEXT NOT NULL UNIQUE DEFAULT uuid_generate_v4()::text,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  destination_url TEXT NOT NULL,
  user_agent TEXT,
  referrer TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_marketplace_deal_clicks_deal_id
  ON marketplace.deal_clicks (deal_id);

CREATE INDEX idx_marketplace_deal_clicks_created_at
  ON marketplace.deal_clicks (created_at DESC);

CREATE INDEX idx_marketplace_deal_clicks_user_id
  ON marketplace.deal_clicks (user_id)
  WHERE user_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE marketplace.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace.deal_clicks ENABLE ROW LEVEL SECURITY;

-- organizations
CREATE POLICY "Members can view their organizations"
  ON marketplace.organizations FOR SELECT
  USING (marketplace.is_org_member(id));

-- Traveler feed may show operator name alongside live deals
CREATE POLICY "Public can view organizations with live deals"
  ON marketplace.organizations FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM marketplace.deals d
      WHERE d.organization_id = organizations.id
        AND d.status = 'live'
    )
  );

CREATE POLICY "Authenticated users can create organizations"
  ON marketplace.organizations FOR INSERT
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND created_by = (SELECT auth.uid())
  );

CREATE POLICY "Owners and admins can update organizations"
  ON marketplace.organizations FOR UPDATE
  USING (marketplace.is_org_owner_or_admin(id));

CREATE POLICY "Owners and admins can delete organizations"
  ON marketplace.organizations FOR DELETE
  USING (marketplace.is_org_owner_or_admin(id));

-- organization_members
-- Note: creator → owner bootstrap uses SECURITY DEFINER trigger (bypasses RLS).
CREATE POLICY "Members can view org membership"
  ON marketplace.organization_members FOR SELECT
  USING (marketplace.is_org_member(organization_id));

CREATE POLICY "Owners and admins can add members"
  ON marketplace.organization_members FOR INSERT
  WITH CHECK (marketplace.is_org_owner_or_admin(organization_id));

CREATE POLICY "Owners and admins can update members"
  ON marketplace.organization_members FOR UPDATE
  USING (marketplace.is_org_owner_or_admin(organization_id));

CREATE POLICY "Owners and admins can remove members"
  ON marketplace.organization_members FOR DELETE
  USING (marketplace.is_org_owner_or_admin(organization_id));

-- deals
CREATE POLICY "Public can view live deals"
  ON marketplace.deals FOR SELECT
  USING (status = 'live');

CREATE POLICY "Members can view their organization deals"
  ON marketplace.deals FOR SELECT
  USING (marketplace.is_org_member(organization_id));

CREATE POLICY "Members can create deals for their organization"
  ON marketplace.deals FOR INSERT
  WITH CHECK (
    marketplace.is_org_member(organization_id)
    AND (
      created_by IS NULL
      OR created_by = (SELECT auth.uid())
    )
  );

CREATE POLICY "Members can update their organization deals"
  ON marketplace.deals FOR UPDATE
  USING (marketplace.is_org_member(organization_id));

CREATE POLICY "Members can delete their organization deals"
  ON marketplace.deals FOR DELETE
  USING (marketplace.is_org_member(organization_id));

-- deal_clicks
CREATE POLICY "Anyone can record deal clicks"
  ON marketplace.deal_clicks FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM marketplace.deals d
      WHERE d.id = deal_id
        AND d.status = 'live'
    )
    AND (
      user_id IS NULL
      OR user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Org members can view clicks on their deals"
  ON marketplace.deal_clicks FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM marketplace.deals d
      WHERE d.id = deal_clicks.deal_id
        AND marketplace.is_org_member(d.organization_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA marketplace TO anon, authenticated, service_role;

GRANT SELECT ON marketplace.organizations TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON marketplace.organizations TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON marketplace.organization_members
  TO authenticated, service_role;

GRANT SELECT ON marketplace.deals TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON marketplace.deals TO authenticated, service_role;

GRANT INSERT ON marketplace.deal_clicks TO anon, authenticated, service_role;
GRANT SELECT ON marketplace.deal_clicks TO authenticated, service_role;

-- Ensure sequence/default privileges are fine for uuid generation (uuid-ossp in public)
GRANT EXECUTE ON FUNCTION marketplace.is_org_member(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION marketplace.is_org_owner_or_admin(UUID) TO authenticated, service_role;
