-- ============================================================================
-- Security S2: Lock system-owned deal columns at the database
-- ============================================================================
-- Pattern: BEFORE UPDATE trigger. Client roles (anon / authenticated) cannot
-- change system-owned columns via PostgREST even if they bypass the Next.js API.
-- Only the PostgREST `service_role` DB role (and postgres / supabase_admin for
-- migrations and SECURITY DEFINER writers) may change them.
--
-- Inventory (`marketplace.operator_deals`):
--   status, pause_reason, pause_detail, discount_verification
-- Legacy feed (`marketplace.deals`):
--   status
--
-- App status transitions (`transitionDeal` / publish / pause / resume) must
-- persist via a service-role client or a SECURITY DEFINER function that writes
-- DealEvent. `promo_code_confirmed_by_operator` stays client-writable (operator
-- attest when verifyDiscount returns cannot_verify).
-- ============================================================================

CREATE OR REPLACE FUNCTION marketplace.enforce_operator_deal_system_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- service_role: PostgREST with service key. postgres / supabase_admin:
  -- migrations and SECURITY DEFINER writers.
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.pause_reason IS DISTINCT FROM OLD.pause_reason
     OR NEW.pause_detail IS DISTINCT FROM OLD.pause_detail
     OR NEW.discount_verification IS DISTINCT FROM OLD.discount_verification
  THEN
    RAISE EXCEPTION
      'marketplace.operator_deals system-owned columns (status, pause_reason, pause_detail, discount_verification) can only be changed by service_role'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION marketplace.enforce_operator_deal_system_columns() IS
  'S2: block authenticated/anon from updating status / pause_* / discount_verification on operator_deals';

CREATE OR REPLACE FUNCTION marketplace.enforce_legacy_deal_system_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION
      'marketplace.deals system-owned column (status) can only be changed by service_role'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION marketplace.enforce_legacy_deal_system_columns() IS
  'S2: block authenticated/anon from updating status on legacy marketplace.deals';

DROP TRIGGER IF EXISTS marketplace_operator_deals_enforce_system_columns
  ON marketplace.operator_deals;
CREATE TRIGGER marketplace_operator_deals_enforce_system_columns
  BEFORE UPDATE ON marketplace.operator_deals
  FOR EACH ROW
  EXECUTE FUNCTION marketplace.enforce_operator_deal_system_columns();

DROP TRIGGER IF EXISTS marketplace_deals_enforce_system_columns
  ON marketplace.deals;
CREATE TRIGGER marketplace_deals_enforce_system_columns
  BEFORE UPDATE ON marketplace.deals
  FOR EACH ROW
  EXECUTE FUNCTION marketplace.enforce_legacy_deal_system_columns();

GRANT EXECUTE ON FUNCTION marketplace.enforce_operator_deal_system_columns()
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION marketplace.enforce_legacy_deal_system_columns()
  TO anon, authenticated, service_role;
