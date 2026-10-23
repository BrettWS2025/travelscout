-- ============================================================================
-- Stop creating legacy marketplace.organizations on operator signup
-- ============================================================================
-- Inventory / Settings use marketplace.operators + team_members only.
-- Organisations were leftover from the early lightweight deals UI and are no
-- longer created for new business logins. Existing organisation rows are left
-- in place (no data migration); APIs remain for now but the product UI does
-- not depend on them.
--
-- Signup trigger still creates the inventory operator via
-- marketplace.bootstrap_operator_for_user (idempotent).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.bootstrap_operator_organization_from_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = marketplace, public
AS $$
DECLARE
  meta JSONB := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  v_name TEXT;
  v_phone TEXT;
  v_website TEXT;
  v_region TEXT;
BEGIN
  IF COALESCE(meta->>'account_type', '') <> 'operator' THEN
    RETURN NEW;
  END IF;

  v_name := NULLIF(btrim(COALESCE(meta->>'business_name', '')), '');
  v_phone := NULLIF(btrim(COALESCE(meta->>'business_phone', '')), '');
  v_website := NULLIF(btrim(COALESCE(meta->>'business_website', '')), '');
  v_region := NULLIF(btrim(COALESCE(meta->>'business_region', '')), '');

  IF v_name IS NULL OR v_phone IS NULL OR v_website IS NULL OR v_region IS NULL THEN
    RETURN NEW;
  END IF;

  -- Operator only — do not create marketplace.organizations.
  BEGIN
    PERFORM marketplace.bootstrap_operator_for_user(
      NEW.id,
      v_name,
      v_phone,
      v_website,
      v_region,
      NEW.email
    );
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'bootstrap_operator_for_user failed for %: %',
        NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.bootstrap_operator_organization_from_signup() IS
  'Operator signup trigger: create marketplace.operators + owner team_members only (no legacy organisation)';

NOTIFY pgrst, 'reload schema';
