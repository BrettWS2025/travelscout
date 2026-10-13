-- ============================================================================
-- Atomic operator org bootstrap via SECURITY DEFINER RPC
-- ============================================================================
-- Callable from the public schema with the user's JWT so auth.uid() is set.
-- Bypasses PostgREST/RLS edge cases on INSERT...RETURNING for first-time
-- organization creation (operator signup).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_marketplace_organization(
  p_name TEXT,
  p_phone TEXT,
  p_website TEXT,
  p_region TEXT,
  p_slug TEXT DEFAULT NULL,
  p_default_booking_provider TEXT DEFAULT 'manual',
  p_fareharbor_shortname TEXT DEFAULT NULL,
  p_fareharbor_asn TEXT DEFAULT NULL,
  p_rezdy_affiliate_code TEXT DEFAULT NULL
)
RETURNS SETOF marketplace.organizations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = marketplace, public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_slug TEXT;
  v_provider TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
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

  -- Avoid unique slug collisions on retries / similar business names
  IF v_slug IS NOT NULL AND EXISTS (
    SELECT 1 FROM marketplace.organizations o WHERE o.slug = v_slug
  ) THEN
    v_slug := left(v_slug, 52) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  END IF;

  RETURN QUERY
  INSERT INTO marketplace.organizations (
    name,
    slug,
    phone,
    website,
    region,
    default_booking_provider,
    fareharbor_shortname,
    fareharbor_asn,
    rezdy_affiliate_code,
    created_by
  )
  VALUES (
    btrim(p_name),
    v_slug,
    btrim(p_phone),
    btrim(p_website),
    btrim(p_region),
    v_provider,
    NULLIF(btrim(COALESCE(p_fareharbor_shortname, '')), ''),
    NULLIF(btrim(COALESCE(p_fareharbor_asn, '')), ''),
    NULLIF(btrim(COALESCE(p_rezdy_affiliate_code, '')), ''),
    v_uid
  )
  RETURNING marketplace.organizations.*;
END;
$$;

REVOKE ALL ON FUNCTION public.create_marketplace_organization(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_marketplace_organization(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
