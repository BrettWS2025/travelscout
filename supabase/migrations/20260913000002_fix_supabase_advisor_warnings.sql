-- ============================================================================
-- FIX SUPABASE DEV ADVISOR WARNINGS
-- ============================================================================
-- Addresses Database Advisor findings on the Dev project:
-- 1. function_search_path_mutable on marketplace + cached restaurants triggers
-- 2. anon/authenticated can EXECUTE SECURITY DEFINER RPCs
--
-- Note: auth_leaked_password_protection is an Auth dashboard setting and
-- cannot be enabled via SQL migrations.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Marketplace trigger functions: pin search_path
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION marketplace.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION marketplace.enforce_live_deal_window()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
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

-- ---------------------------------------------------------------------------
-- 2) Cached restaurants trigger: pin search_path
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_cached_restaurants_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) Restrict SECURITY DEFINER RPCs (trigger/service-only)
-- ---------------------------------------------------------------------------
-- handle_new_user is only needed as an auth.users trigger, not as a public RPC.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated;

-- upsert_viator_tags is for service-role sync scripts, not client RPCs.
REVOKE ALL ON FUNCTION public.upsert_viator_tags(INTEGER, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_viator_tags(INTEGER, TEXT, TEXT, TEXT, TEXT, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.upsert_viator_tags(INTEGER, TEXT, TEXT, TEXT, TEXT, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_viator_tags(INTEGER, TEXT, TEXT, TEXT, TEXT, JSONB) TO service_role;

-- Marketplace SECURITY DEFINER helpers should not be broadly callable as RPCs.
-- Keep EXECUTE for roles that need them in RLS expressions; revoke PUBLIC default.
REVOKE ALL ON FUNCTION marketplace.is_org_member(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION marketplace.is_org_owner_or_admin(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION marketplace.add_creator_as_owner() FROM PUBLIC;
REVOKE ALL ON FUNCTION marketplace.add_creator_as_owner() FROM anon;
REVOKE ALL ON FUNCTION marketplace.add_creator_as_owner() FROM authenticated;

GRANT EXECUTE ON FUNCTION marketplace.is_org_member(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION marketplace.is_org_owner_or_admin(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION marketplace.add_creator_as_owner() TO service_role;
