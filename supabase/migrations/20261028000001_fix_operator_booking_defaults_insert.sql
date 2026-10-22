-- ============================================================================
-- Security S5: Fix operator_booking_defaults INSERT policy
-- ============================================================================
-- Problem: policy "System can insert booking defaults" used WITH CHECK (true)
-- together with GRANT INSERT TO authenticated, so any logged-in user could
-- INSERT a booking-defaults row for any operator_id via PostgREST.
--
-- Fix: drop that open INSERT policy and revoke INSERT from authenticated.
-- Rows are created only by:
--   1) marketplace.create_operator_booking_defaults() — SECURITY DEFINER
--      AFTER INSERT trigger on marketplace.operators (table owner bypasses RLS)
--   2) service_role (bypasses RLS; keeps INSERT privilege)
--
-- Owners/managers still SELECT/UPDATE their own row via existing policies.
-- They do not need client INSERT — the create-operator trigger always seeds the row.
-- Do not reintroduce WITH CHECK (true). If a future product path must let
-- owners/managers insert a missing row, use:
--   WITH CHECK (marketplace.is_operator_owner_or_manager(operator_id))
-- never true.
-- ============================================================================

DROP POLICY IF EXISTS "System can insert booking defaults"
  ON marketplace.operator_booking_defaults;

REVOKE INSERT ON TABLE marketplace.operator_booking_defaults
  FROM PUBLIC, anon, authenticated;

-- Defensive: ensure service_role retains write access for server/seed paths.
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE marketplace.operator_booking_defaults
  TO service_role;

-- Authenticated members keep read/update (and DELETE grant; no DELETE policy).
GRANT SELECT, UPDATE, DELETE
  ON TABLE marketplace.operator_booking_defaults
  TO authenticated;

COMMENT ON TABLE marketplace.operator_booking_defaults IS
  'One row per operator (auto-created by SECURITY DEFINER trigger). Security S5: no client INSERT policy; INSERT revoked from authenticated; service_role / trigger only.';

-- Sanity: trigger function must remain SECURITY DEFINER so operator INSERT
-- still seeds defaults after the open policy is removed.
DO $$
DECLARE
  is_secdef BOOLEAN;
BEGIN
  SELECT p.prosecdef
  INTO is_secdef
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'marketplace'
    AND p.proname = 'create_operator_booking_defaults';

  IF is_secdef IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION
      'marketplace.create_operator_booking_defaults must be SECURITY DEFINER (S5)';
  END IF;
END;
$$;
