-- ============================================================================
-- Bootstrap marketplace.operators (+ owner team_members) on operator signup
-- ============================================================================
-- Inventory / Settings use marketplace.operators + team_members. Operator signup
-- previously only created marketplace.organizations (legacy). This migration:
--   1. marketplace.bootstrap_operator_for_user — SECURITY DEFINER, trigger-only
--   2. public.create_marketplace_operator — authenticated RPC (JWT ensure path)
--   3. Extends the auth.users signup trigger to also bootstrap the operator
-- Booking defaults still come from marketplace.create_operator_booking_defaults.
-- ============================================================================

CREATE OR REPLACE FUNCTION marketplace.bootstrap_operator_for_user(
  p_user_id UUID,
  p_name TEXT,
  p_phone TEXT,
  p_website TEXT,
  p_region TEXT,
  p_email TEXT DEFAULT NULL,
  p_slug TEXT DEFAULT NULL
)
RETURNS marketplace.operators
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = marketplace, public
AS $$
DECLARE
  v_slug TEXT;
  v_existing marketplace.operators%ROWTYPE;
  v_created marketplace.operators%ROWTYPE;
  v_email TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required';
  END IF;

  -- Idempotent: one inventory operator membership per user is enough for signup.
  SELECT o.*
  INTO v_existing
  FROM marketplace.operators o
  INNER JOIN marketplace.team_members m
    ON m.operator_id = o.id
  WHERE m.user_id = p_user_id
    AND m.invite_status = 'accepted'
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

  v_email := NULLIF(lower(btrim(COALESCE(p_email, ''))), '');
  IF v_email IS NULL THEN
    SELECT NULLIF(lower(btrim(u.email)), '')
    INTO v_email
    FROM auth.users u
    WHERE u.id = p_user_id;
  END IF;
  IF v_email IS NULL THEN
    v_email := p_user_id::text || '@operators.local';
  END IF;

  v_slug := NULLIF(btrim(COALESCE(p_slug, '')), '');
  IF v_slug IS NULL THEN
    v_slug := lower(regexp_replace(btrim(p_name), '[^a-zA-Z0-9]+', '-', 'g'));
    v_slug := trim(both '-' from v_slug);
    v_slug := left(v_slug, 60);
    IF v_slug = '' THEN
      v_slug := 'operator';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM marketplace.operators o WHERE o.slug = v_slug
  ) THEN
    v_slug := left(v_slug, 52) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  END IF;

  INSERT INTO marketplace.operators (
    legal_name,
    trading_name,
    slug,
    website,
    public_phone,
    regions_served,
    account_status,
    requires_manual_review
  )
  VALUES (
    btrim(p_name),
    btrim(p_name),
    v_slug,
    btrim(p_website),
    btrim(p_phone),
    ARRAY[btrim(p_region)]::TEXT[],
    'pending_verification',
    false
  )
  RETURNING * INTO v_created;

  INSERT INTO marketplace.team_members (
    operator_id,
    user_id,
    role,
    invited_email,
    invite_status
  )
  VALUES (
    v_created.id,
    p_user_id,
    'owner',
    v_email,
    'accepted'
  );

  RETURN v_created;
END;
$$;

COMMENT ON FUNCTION marketplace.bootstrap_operator_for_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) IS
  'Signup bootstrap: create marketplace.operators + accepted owner team_members (idempotent per user)';

REVOKE ALL ON FUNCTION marketplace.bootstrap_operator_for_user(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;

REVOKE ALL ON FUNCTION marketplace.bootstrap_operator_for_user(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION marketplace.bootstrap_operator_for_user(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO service_role;

-- Authenticated ensure path (JWT). Idempotent; creates operator + owner when missing.
CREATE OR REPLACE FUNCTION public.create_marketplace_operator(
  p_name TEXT,
  p_phone TEXT,
  p_website TEXT,
  p_region TEXT,
  p_slug TEXT DEFAULT NULL
)
RETURNS SETOF marketplace.operators
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = marketplace, public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_email TEXT;
  v_created marketplace.operators%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT NULLIF(lower(btrim(u.email)), '')
  INTO v_email
  FROM auth.users u
  WHERE u.id = v_uid;

  SELECT o.*
  INTO v_created
  FROM marketplace.bootstrap_operator_for_user(
    v_uid,
    p_name,
    p_phone,
    p_website,
    p_region,
    v_email,
    p_slug
  ) AS o;

  RETURN NEXT v_created;
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.create_marketplace_operator(
  TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_marketplace_operator(
  TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated, service_role;

-- Extend signup trigger: also bootstrap inventory operator (keep legacy org).
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

  BEGIN
    PERFORM marketplace.bootstrap_organization_for_user(
      NEW.id,
      v_name,
      v_phone,
      v_website,
      v_region
    );
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'bootstrap_organization_for_user failed for %: %',
        NEW.id, SQLERRM;
  END;

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

NOTIFY pgrst, 'reload schema';
