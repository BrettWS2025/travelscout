-- ============================================================================
-- Bootstrap marketplace organization on operator signup
-- ============================================================================
-- Operator signup stores business fields on auth.users.raw_user_meta_data.
-- Email confirmation often means signUp returns no JWT, so the authenticated
-- create_marketplace_organization RPC cannot run yet. This trigger creates the
-- organization (and owner membership via existing add_creator_as_owner) at
-- user-insert time so confirm-email cannot leave an operator without an org.
-- Traveler signups omit account_type=operator / business_* and are untouched.
-- ============================================================================

CREATE OR REPLACE FUNCTION marketplace.bootstrap_organization_for_user(
  p_user_id UUID,
  p_name TEXT,
  p_phone TEXT,
  p_website TEXT,
  p_region TEXT,
  p_slug TEXT DEFAULT NULL,
  p_default_booking_provider TEXT DEFAULT 'manual'
)
RETURNS marketplace.organizations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = marketplace, public
AS $$
DECLARE
  v_slug TEXT;
  v_provider TEXT;
  v_existing marketplace.organizations%ROWTYPE;
  v_created marketplace.organizations%ROWTYPE;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required';
  END IF;

  -- Idempotent: one bootstrap org per user is enough for signup.
  SELECT o.*
  INTO v_existing
  FROM marketplace.organizations o
  INNER JOIN marketplace.organization_members m
    ON m.organization_id = o.id
  WHERE m.user_id = p_user_id
  ORDER BY o.created_at ASC
  LIMIT 1;

  IF FOUND THEN
    RETURN v_existing;
  END IF;

  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'name is required';
  END IF;
  IF p_phone IS NULL OR btrim(p_phone) = '' THEN
    RAISE EXCEPTION 'phone is required';
  END IF;
  IF p_website IS NULL OR btrim(p_website) = '' THEN
    RAISE EXCEPTION 'website is required';
  END IF;
  IF p_region IS NULL OR btrim(p_region) = '' THEN
    RAISE EXCEPTION 'region is required';
  END IF;

  v_provider := COALESCE(NULLIF(btrim(p_default_booking_provider), ''), 'manual');
  IF v_provider NOT IN ('manual', 'rezdy', 'fareharbor', 'other') THEN
    RAISE EXCEPTION 'invalid default_booking_provider';
  END IF;

  v_slug := NULLIF(btrim(COALESCE(p_slug, '')), '');
  IF v_slug IS NULL THEN
    v_slug := lower(regexp_replace(btrim(p_name), '[^a-zA-Z0-9]+', '-', 'g'));
    v_slug := trim(both '-' from v_slug);
    v_slug := left(v_slug, 60);
    IF v_slug = '' THEN
      v_slug := NULL;
    END IF;
  END IF;

  IF v_slug IS NOT NULL AND EXISTS (
    SELECT 1 FROM marketplace.organizations o WHERE o.slug = v_slug
  ) THEN
    v_slug := left(v_slug, 52) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  END IF;

  INSERT INTO marketplace.organizations (
    name,
    slug,
    phone,
    website,
    region,
    default_booking_provider,
    created_by
  )
  VALUES (
    btrim(p_name),
    v_slug,
    btrim(p_phone),
    btrim(p_website),
    btrim(p_region),
    v_provider,
    p_user_id
  )
  RETURNING * INTO v_created;

  RETURN v_created;
END;
$$;

-- Not callable by clients — trigger / service_role only.
REVOKE ALL ON FUNCTION marketplace.bootstrap_organization_for_user(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;

REVOKE ALL ON FUNCTION marketplace.bootstrap_organization_for_user(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION marketplace.bootstrap_organization_for_user(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO service_role;

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

  PERFORM marketplace.bootstrap_organization_for_user(
    NEW.id,
    v_name,
    v_phone,
    v_website,
    v_region
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Never block auth user creation if org bootstrap fails; client ensure path
    -- can retry after email confirmation when the user has a JWT.
    RAISE WARNING 'bootstrap_operator_organization_from_signup failed for %: %',
      NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_operator_org ON auth.users;
CREATE TRIGGER on_auth_user_created_operator_org
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.bootstrap_operator_organization_from_signup();

NOTIFY pgrst, 'reload schema';
