-- ============================================================================
-- Security S7: Harden profiles INSERT so is_platform_admin cannot be set by clients
-- ============================================================================
-- UPDATE already blocks changing is_platform_admin (20261020000006). INSERT only
-- checked auth.uid() = id, so a client could insert their own row with
-- is_platform_admin = true and become a platform admin.
--
-- Tighten the INSERT policy: own row AND is_platform_admin IS NOT TRUE.
-- service_role bypasses RLS and remains the path to grant platform admin.
-- Signup trigger handle_new_user() is SECURITY DEFINER and inserts without the
-- flag (DEFAULT false), so bootstrap is unchanged. Client ensureUserProfile
-- upsert also omits the flag.
-- ============================================================================

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (
    (SELECT auth.uid()) = id
    AND is_platform_admin IS NOT TRUE
  );

COMMENT ON POLICY "Users can insert own profile" ON public.profiles IS
  'S7: users may insert their own profile row only with is_platform_admin not true; service_role bypasses RLS to grant admin';
