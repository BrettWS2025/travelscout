-- ============================================================================
-- FIX SECURITY DEFINER RPC WARNINGS
-- ============================================================================
-- Clears Supabase advisor warnings:
--   - anon_security_definer_function_executable
--   - authenticated_security_definer_function_executable
--
-- Strategy:
-- 1) Rewrite marketplace RLS to inline membership checks (no RPC helpers)
-- 2) Drop marketplace SECURITY DEFINER helper functions used only for RLS
-- 3) Keep trigger function but revoke EXECUTE from anon/authenticated/PUBLIC
-- 4) Re-revoke public.handle_new_user / upsert_viator_tags aggressively
--
-- Note: auth_leaked_password_protection is an Auth dashboard setting and
-- cannot be enabled via SQL.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Organizations policies — inline membership checks
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Members can view their organizations"
  ON marketplace.organizations;
CREATE POLICY "Members can view their organizations"
  ON marketplace.organizations FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM marketplace.organization_members m
      WHERE m.organization_id = organizations.id
        AND m.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Owners and admins can update organizations"
  ON marketplace.organizations;
CREATE POLICY "Owners and admins can update organizations"
  ON marketplace.organizations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM marketplace.organization_members m
      WHERE m.organization_id = organizations.id
        AND m.user_id = (SELECT auth.uid())
        AND m.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Owners and admins can delete organizations"
  ON marketplace.organizations;
CREATE POLICY "Owners and admins can delete organizations"
  ON marketplace.organizations FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM marketplace.organization_members m
      WHERE m.organization_id = organizations.id
        AND m.user_id = (SELECT auth.uid())
        AND m.role IN ('owner', 'admin')
    )
  );

-- ---------------------------------------------------------------------------
-- 2) Organization members — own-row SELECT avoids RLS recursion
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Members can view org membership"
  ON marketplace.organization_members;
CREATE POLICY "Members can view org membership"
  ON marketplace.organization_members FOR SELECT
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Owners and admins can add members"
  ON marketplace.organization_members;
CREATE POLICY "Owners and admins can add members"
  ON marketplace.organization_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM marketplace.organization_members m
      WHERE m.organization_id = organization_members.organization_id
        AND m.user_id = (SELECT auth.uid())
        AND m.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Owners and admins can update members"
  ON marketplace.organization_members;
CREATE POLICY "Owners and admins can update members"
  ON marketplace.organization_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM marketplace.organization_members m
      WHERE m.organization_id = organization_members.organization_id
        AND m.user_id = (SELECT auth.uid())
        AND m.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Owners and admins can remove members"
  ON marketplace.organization_members;
CREATE POLICY "Owners and admins can remove members"
  ON marketplace.organization_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM marketplace.organization_members m
      WHERE m.organization_id = organization_members.organization_id
        AND m.user_id = (SELECT auth.uid())
        AND m.role IN ('owner', 'admin')
    )
  );

-- ---------------------------------------------------------------------------
-- 3) Deals policies — inline membership checks
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Members can view their organization deals"
  ON marketplace.deals;
CREATE POLICY "Members can view their organization deals"
  ON marketplace.deals FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM marketplace.organization_members m
      WHERE m.organization_id = deals.organization_id
        AND m.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Members can create deals for their organization"
  ON marketplace.deals;
CREATE POLICY "Members can create deals for their organization"
  ON marketplace.deals FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM marketplace.organization_members m
      WHERE m.organization_id = deals.organization_id
        AND m.user_id = (SELECT auth.uid())
    )
    AND (
      created_by IS NULL
      OR created_by = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Members can update their organization deals"
  ON marketplace.deals;
CREATE POLICY "Members can update their organization deals"
  ON marketplace.deals FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM marketplace.organization_members m
      WHERE m.organization_id = deals.organization_id
        AND m.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Members can delete their organization deals"
  ON marketplace.deals;
CREATE POLICY "Members can delete their organization deals"
  ON marketplace.deals FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM marketplace.organization_members m
      WHERE m.organization_id = deals.organization_id
        AND m.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Org members can view clicks on their deals"
  ON marketplace.deal_clicks;
CREATE POLICY "Org members can view clicks on their deals"
  ON marketplace.deal_clicks FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM marketplace.deals d
      JOIN marketplace.organization_members m
        ON m.organization_id = d.organization_id
      WHERE d.id = deal_clicks.deal_id
        AND m.user_id = (SELECT auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 4) Drop RLS helper SECURITY DEFINER functions (no longer referenced)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'marketplace'
      AND p.proname IN (
        'is_org_member',
        'is_org_owner_or_admin',
        'is_organization_member',
        'is_organization_owner_or_admin'
      )
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', r.sig);
  END LOOP;
END;
$$;

-- Keep creator bootstrap trigger function, but lock down EXECUTE so it is not an RPC
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

REVOKE ALL ON FUNCTION marketplace.add_creator_as_owner() FROM PUBLIC;
REVOKE ALL ON FUNCTION marketplace.add_creator_as_owner() FROM anon;
REVOKE ALL ON FUNCTION marketplace.add_creator_as_owner() FROM authenticated;
-- Triggers do not need EXECUTE grants for anon/authenticated

-- ---------------------------------------------------------------------------
-- 5) Re-lock public SECURITY DEFINER functions (previous revokes may not have stuck)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  -- handle_new_user overloads
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'handle_new_user'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', r.sig);
  END LOOP;

  -- upsert_viator_tags overloads
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'upsert_viator_tags'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;

  -- Any remaining marketplace SECURITY DEFINER functions: revoke anon/auth execute
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'marketplace'
      AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', r.sig);
  END LOOP;
END;
$$;
