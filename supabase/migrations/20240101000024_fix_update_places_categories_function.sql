-- ============================================================================
-- Fix: Update update_places_categories function to use schema-qualified table names
-- ============================================================================
-- Purpose: The function needs to use public. schema qualification for tables
-- when using SET search_path = ''

CREATE OR REPLACE FUNCTION update_places_categories()
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  UPDATE public.places p
  SET category = COALESCE(ftm.internal_category, 'other')
  FROM public.linz_gazetteer_raw lgr
  LEFT JOIN public.feature_type_map ftm ON ftm.linz_feat_type = lgr.feat_type
  WHERE p.source_id = lgr.name_id
    AND p.category IS DISTINCT FROM COALESCE(ftm.internal_category, 'other');

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count;
END;
$$;
