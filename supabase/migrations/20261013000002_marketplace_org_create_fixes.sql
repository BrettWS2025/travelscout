-- ============================================================================
-- Fix operator org creation on Dev/API
-- ============================================================================
-- 1) Let creators read orgs they just created (INSERT ... RETURNING / .select())
--    even if membership visibility races the response.
-- 2) Ensure marketplace schema is exposed to PostgREST.
-- 3) Reload PostgREST so the phone column (and schema list) are visible.
-- ============================================================================

-- Creators can always SELECT their own organizations
DROP POLICY IF EXISTS "Creators can view organizations they created"
  ON marketplace.organizations;
CREATE POLICY "Creators can view organizations they created"
  ON marketplace.organizations FOR SELECT
  USING (created_by = (SELECT auth.uid()));

-- Expose marketplace alongside default schemas (hosted Supabase / PostgREST)
DO $$
BEGIN
  -- Keep existing schemas if already customized; ensure marketplace is included.
  EXECUTE $sql$
    ALTER ROLE authenticator SET pgrst.db_schemas =
      'public, storage, graphql_public, marketplace'
  $sql$;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Could not ALTER ROLE authenticator (insufficient privilege); expose marketplace schema in the Supabase API settings if needed.';
  WHEN undefined_object THEN
    RAISE NOTICE 'Role authenticator not found; skipping pgrst.db_schemas update.';
END;
$$;

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
