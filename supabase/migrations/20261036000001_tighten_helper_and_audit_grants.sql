-- ============================================================================
-- Security S18: Tighten unnecessary GRANTs and SECURITY DEFINER EXECUTE
-- ============================================================================
-- Problem: membership helpers and operator_id_for_* lookups were EXECUTE-able
-- by anon via PostgREST RPC, and deal_events / click_events had table GRANTs
-- for anon even though no public RLS policy allows those operations. That
-- widens the probing surface without enabling any product feature.
--
-- Fix (least privilege):
--   1. Membership helpers (SECURITY DEFINER, used only inside RLS policies):
--      - is_operator_member: revoke anon (+ PUBLIC); keep authenticated +
--        service_role (authenticated needs EXECUTE for member RLS).
--      - is_operator_owner_or_manager / is_operator_owner: already no anon
--        grant; revoke PUBLIC defensively; keep authenticated + service_role.
--   2. operator_id_for_* lookups: revoke anon (+ PUBLIC); keep authenticated
--      + service_role (member RLS on child tables). No anon policy calls these.
--   3. deal_events: revoke useless anon SELECT (members-only SELECT policy).
--   4. click_events: revoke useless anon INSERT (INSERT policy requires
--      membership; Book now writes via service_role / in-memory today).
--
-- Intentional anon grants (do NOT revoke here — documented for operators):
--   - EXECUTE marketplace.is_visible_to_travellers(uuid)
--   - EXECUTE marketplace.is_live_operator_deal(uuid)
--     (public deal_sessions / deal_media RLS + public views)
--   - SELECT on marketplace.operators_public, operator_deals_public,
--     deal_price_options_public, discount_steps_public
--   - SELECT on marketplace.deal_sessions / deal_media (visibility RLS)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Membership helpers — no anon RPC probing
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION marketplace.is_operator_member(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION marketplace.is_operator_member(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION marketplace.is_operator_member(UUID)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION marketplace.is_operator_owner_or_manager(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION marketplace.is_operator_owner_or_manager(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION marketplace.is_operator_owner_or_manager(UUID)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION marketplace.is_operator_owner(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION marketplace.is_operator_owner(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION marketplace.is_operator_owner(UUID)
  TO authenticated, service_role;

COMMENT ON FUNCTION marketplace.is_operator_member(UUID) IS
  'SECURITY DEFINER membership check for RLS. Security S18: EXECUTE for authenticated + service_role only (not anon).';

COMMENT ON FUNCTION marketplace.is_operator_owner_or_manager(UUID) IS
  'SECURITY DEFINER owner/manager check for RLS. Security S18: EXECUTE for authenticated + service_role only (not anon).';

COMMENT ON FUNCTION marketplace.is_operator_owner(UUID) IS
  'SECURITY DEFINER owner check for RLS. Security S18: EXECUTE for authenticated + service_role only (not anon).';

-- ---------------------------------------------------------------------------
-- 2) operator_id_for_* — no anon RPC probing
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION marketplace.operator_id_for_deal(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION marketplace.operator_id_for_deal(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION marketplace.operator_id_for_deal(UUID)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION marketplace.operator_id_for_integration(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION marketplace.operator_id_for_integration(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION marketplace.operator_id_for_integration(UUID)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION marketplace.operator_id_for_external_product(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION marketplace.operator_id_for_external_product(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION marketplace.operator_id_for_external_product(UUID)
  TO authenticated, service_role;

COMMENT ON FUNCTION marketplace.operator_id_for_deal(UUID) IS
  'SECURITY DEFINER deal→operator lookup for RLS. Security S18: EXECUTE for authenticated + service_role only (not anon).';

COMMENT ON FUNCTION marketplace.operator_id_for_integration(UUID) IS
  'SECURITY DEFINER integration→operator lookup for RLS. Security S18: EXECUTE for authenticated + service_role only (not anon).';

COMMENT ON FUNCTION marketplace.operator_id_for_external_product(UUID) IS
  'SECURITY DEFINER external_product→operator lookup for RLS. Security S18: EXECUTE for authenticated + service_role only (not anon).';

-- ---------------------------------------------------------------------------
-- 3) deal_events — revoke useless anon SELECT
-- ---------------------------------------------------------------------------
REVOKE SELECT ON TABLE marketplace.deal_events FROM PUBLIC, anon;

GRANT SELECT, INSERT ON TABLE marketplace.deal_events
  TO authenticated, service_role;

COMMENT ON TABLE marketplace.deal_events IS
  'Append-only deal audit log. Security S18: no anon SELECT (RLS is members-only); authenticated SELECT/INSERT + service_role.';

-- ---------------------------------------------------------------------------
-- 4) click_events — revoke useless anon INSERT
-- ---------------------------------------------------------------------------
REVOKE INSERT ON TABLE marketplace.click_events FROM PUBLIC, anon;

GRANT SELECT ON TABLE marketplace.click_events
  TO authenticated, service_role;
GRANT INSERT ON TABLE marketplace.click_events
  TO authenticated, service_role;

COMMENT ON TABLE marketplace.click_events IS
  'Book-now / click tracking. Security S18: no anon INSERT (RLS requires membership; public Book now uses service_role / app path); authenticated SELECT/INSERT + service_role.';
