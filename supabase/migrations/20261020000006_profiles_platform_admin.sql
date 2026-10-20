-- ============================================================================
-- Deals platform Chunk 9: platform admin flag on profiles
-- ============================================================================
-- Separate from operator team roles (owner|manager|staff). Used for admin.*
-- actions in web/lib/marketplace/permissions.ts.
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_platform_admin IS
  'Platform admin (not an operator team role). Grants admin.* permissions only.';

-- Users can read their own flag; only service_role / SQL may set it.
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING ((SELECT auth.uid()) = id);

-- Prevent clients from elevating themselves via UPDATE.
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING ((SELECT auth.uid()) = id)
  WITH CHECK (
    (SELECT auth.uid()) = id
    AND is_platform_admin IS NOT DISTINCT FROM (
      SELECT p.is_platform_admin
      FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
    )
  );
