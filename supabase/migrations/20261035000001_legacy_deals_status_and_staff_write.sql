-- ============================================================================
-- Security S14: Legacy deals — stop client-controlled status; staff read-only
-- ============================================================================
-- Legacy feed (`marketplace.deals`) is org-scoped and deprecated relative to
-- inventory `operator_deals`. Status remains system-owned (S2 locks UPDATE).
-- This migration:
--   1) Forces INSERT status = draft for anon/authenticated (clients cannot
--      insert as live via PostgREST).
--   2) Restricts INSERT/UPDATE/DELETE to org owner/admin (staff read-only).
--   3) Adds SECURITY DEFINER RPC `public.transition_legacy_deal_status` so
--      owner/admin status changes go through a server-checked path (bypasses
--      the S2 UPDATE lock as postgres), never via raw client PATCH of status.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) INSERT: force draft for non-privileged roles
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION marketplace.enforce_legacy_deal_insert_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  -- Clients may only create drafts. Ignore any client-supplied status.
  NEW.status := 'draft';
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION marketplace.enforce_legacy_deal_insert_status() IS
  'S14: force status=draft on INSERT for anon/authenticated on marketplace.deals';

DROP TRIGGER IF EXISTS marketplace_deals_enforce_insert_status
  ON marketplace.deals;
CREATE TRIGGER marketplace_deals_enforce_insert_status
  BEFORE INSERT ON marketplace.deals
  FOR EACH ROW
  EXECUTE FUNCTION marketplace.enforce_legacy_deal_insert_status();

GRANT EXECUTE ON FUNCTION marketplace.enforce_legacy_deal_insert_status()
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) RLS: staff cannot write (owner/admin only)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Members can create deals for their organization"
  ON marketplace.deals;
DROP POLICY IF EXISTS "Owners and admins can create deals for their organization"
  ON marketplace.deals;
CREATE POLICY "Owners and admins can create deals for their organization"
  ON marketplace.deals FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM marketplace.organization_members m
      WHERE m.organization_id = deals.organization_id
        AND m.user_id = (SELECT auth.uid())
        AND m.role IN ('owner', 'admin')
    )
    AND (
      created_by IS NULL
      OR created_by = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Members can update their organization deals"
  ON marketplace.deals;
DROP POLICY IF EXISTS "Owners and admins can update their organization deals"
  ON marketplace.deals;
CREATE POLICY "Owners and admins can update their organization deals"
  ON marketplace.deals FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM marketplace.organization_members m
      WHERE m.organization_id = deals.organization_id
        AND m.user_id = (SELECT auth.uid())
        AND m.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Members can delete their organization deals"
  ON marketplace.deals;
DROP POLICY IF EXISTS "Owners and admins can delete their organization deals"
  ON marketplace.deals;
CREATE POLICY "Owners and admins can delete their organization deals"
  ON marketplace.deals FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM marketplace.organization_members m
      WHERE m.organization_id = deals.organization_id
        AND m.user_id = (SELECT auth.uid())
        AND m.role IN ('owner', 'admin')
    )
  );

-- SELECT policies unchanged: all org members (including staff) may read.

COMMENT ON TABLE marketplace.deals IS
  'Legacy org-scoped deal feed (deprecated vs operator_deals). Status is system-owned (S2/S14): clients insert as draft only; status changes via transition_legacy_deal_status or service_role. Staff are read-only.';

-- ---------------------------------------------------------------------------
-- 3) SECURITY DEFINER status transition (owner/admin only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transition_legacy_deal_status(
  p_deal_id UUID,
  p_new_status TEXT
)
RETURNS SETOF marketplace.deals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = marketplace, public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_org_id UUID;
  v_status TEXT := lower(btrim(COALESCE(p_new_status, '')));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF v_status NOT IN ('draft', 'live', 'expired', 'sold_out') THEN
    RAISE EXCEPTION 'Invalid legacy deal status: %', p_new_status
      USING ERRCODE = '22023';
  END IF;

  SELECT d.organization_id INTO v_org_id
  FROM marketplace.deals d
  WHERE d.id = p_deal_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Deal not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM marketplace.organization_members m
    WHERE m.organization_id = v_org_id
      AND m.user_id = v_uid
      AND m.role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'Only organization owners and admins may change deal status'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  UPDATE marketplace.deals d
  SET status = v_status
  WHERE d.id = p_deal_id
  RETURNING d.*;
END;
$$;

COMMENT ON FUNCTION public.transition_legacy_deal_status(UUID, TEXT) IS
  'S14: owner/admin-only status change for legacy marketplace.deals (SECURITY DEFINER; pairs with S2 status lock)';

REVOKE ALL ON FUNCTION public.transition_legacy_deal_status(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transition_legacy_deal_status(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.transition_legacy_deal_status(UUID, TEXT)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
