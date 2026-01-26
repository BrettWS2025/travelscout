-- ============================================================================
-- Fix: Update populate_place_names function to use schema-qualified table names
-- ============================================================================
-- Purpose: The function needs to use public. schema qualification for tables
-- when using SET search_path = ''

CREATE OR REPLACE FUNCTION populate_place_names()
RETURNS TABLE (
  inserted_count BIGINT
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_inserted BIGINT := 0;
  v_before_count BIGINT;
BEGIN
  -- Count before
  SELECT COUNT(*) INTO v_before_count FROM public.place_names;

  -- Insert official names (primary)
  INSERT INTO public.place_names (place_id, name, name_type, is_primary)
  SELECT 
    id,
    name,
    'official',
    true
  FROM public.places
  WHERE name IS NOT NULL
    AND name != ''
  ON CONFLICT (place_id, name, name_type) DO NOTHING;

  -- Insert normalized names (for search)
  INSERT INTO public.place_names (place_id, name, name_type, is_primary)
  SELECT 
    id,
    normalize_name(name),
    'normalized',
    false
  FROM public.places
  WHERE name IS NOT NULL
    AND name != ''
    AND normalize_name(name) != LOWER(name)
  ON CONFLICT (place_id, name, name_type) DO NOTHING;

  -- Insert macronless names (NZ-important)
  INSERT INTO public.place_names (place_id, name, name_type, is_primary)
  SELECT 
    id,
    remove_macrons(name),
    'macronless',
    false
  FROM public.places
  WHERE name IS NOT NULL
    AND name != ''
    AND remove_macrons(name) != name
  ON CONFLICT (place_id, name, name_type) DO NOTHING;

  -- Insert Māori names if available
  INSERT INTO public.place_names (place_id, name, name_type, is_primary)
  SELECT 
    id,
    maori_name,
    'maori',
    false
  FROM public.places
  WHERE maori_name IS NOT NULL
    AND maori_name != ''
  ON CONFLICT (place_id, name, name_type) DO NOTHING;

  -- Count inserted
  SELECT COUNT(*) - v_before_count INTO v_inserted FROM public.place_names;
  RETURN QUERY SELECT v_inserted;
END;
$$;
