-- ============================================================================
-- Fix: Update refresh_places_from_linz function to use schema-qualified names
-- ============================================================================
-- Purpose: The function needs to use public. schema qualification for tables
-- and function calls when using SET search_path = ''

CREATE OR REPLACE FUNCTION refresh_places_from_linz()
RETURNS TABLE (
  total_raw_rows BIGINT,
  places_inserted BIGINT,
  places_updated BIGINT,
  places_skipped BIGINT,
  categories_updated INTEGER,
  names_inserted BIGINT,
  active_places_count BIGINT,
  inactive_places_count BIGINT,
  new_source_ids_count BIGINT,
  existing_source_ids_count BIGINT
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_total_raw BIGINT;
  v_inserted BIGINT;
  v_updated BIGINT;
  v_skipped BIGINT;
  v_categories INTEGER;
  v_names BIGINT;
  v_active BIGINT;
  v_inactive BIGINT;
  v_new BIGINT;
  v_existing BIGINT;
BEGIN
  -- Count raw rows
  SELECT COUNT(*) INTO v_total_raw FROM public.linz_gazetteer_raw;

  -- Populate places
  SELECT inserted_count, updated_count, skipped_count 
  INTO v_inserted, v_updated, v_skipped
  FROM public.populate_places_from_linz();

  -- Update categories
  SELECT public.update_places_categories() INTO v_categories;

  -- Populate names
  SELECT inserted_count INTO v_names FROM public.populate_place_names();

  -- Count active/inactive
  SELECT COUNT(*) INTO v_active FROM public.places WHERE is_active = true;
  SELECT COUNT(*) INTO v_inactive FROM public.places WHERE is_active = false;

  -- Count new vs existing source_ids
  SELECT COUNT(*) INTO v_new 
  FROM public.places 
  WHERE source_id IN (
    SELECT DISTINCT name_id FROM public.linz_gazetteer_raw
  )
  AND created_at > NOW() - INTERVAL '1 hour';

  SELECT COUNT(*) INTO v_existing 
  FROM public.places 
  WHERE source_id IN (
    SELECT DISTINCT name_id FROM public.linz_gazetteer_raw
  )
  AND created_at <= NOW() - INTERVAL '1 hour';

  RETURN QUERY SELECT 
    v_total_raw,
    v_inserted,
    v_updated,
    v_skipped,
    v_categories,
    v_names,
    v_active,
    v_inactive,
    v_new,
    v_existing;
END;
$$;
