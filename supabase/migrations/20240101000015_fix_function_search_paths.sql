-- ============================================================================
-- FIX FUNCTION SEARCH PATH MUTABLE ISSUES
-- ============================================================================
-- This migration fixes WARN-level security issues by setting search_path
-- on all functions to prevent search path injection attacks.
-- ============================================================================

-- ============================================================================
-- FIX 1: update_updated_at_column
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ============================================================================
-- FIX 2: handle_new_user
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name')
  );
  RETURN NEW;
END;
$$;

-- ============================================================================
-- FIX 3: update_place_geometry
-- ============================================================================
CREATE OR REPLACE FUNCTION update_place_geometry()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Update geometry column from lat/lng
  NEW.geometry = ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326);
  RETURN NEW;
END;
$$;

-- ============================================================================
-- FIX 5: normalize_name
-- ============================================================================
CREATE OR REPLACE FUNCTION normalize_name(input_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
BEGIN
  -- Convert to lowercase
  -- Remove common diacritics (simplified - for full support, use unaccent extension)
  RETURN LOWER(
    REPLACE(
      REPLACE(
        REPLACE(
          REPLACE(
            REPLACE(input_name, 'ā', 'a'),
            'ē', 'e'
          ),
          'ī', 'i'
        ),
        'ō', 'o'
      ),
      'ū', 'u'
    )
  );
END;
$$;

-- ============================================================================
-- FIX 6: remove_macrons
-- ============================================================================
CREATE OR REPLACE FUNCTION remove_macrons(input_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
BEGIN
  RETURN REPLACE(
    REPLACE(
      REPLACE(
        REPLACE(
          REPLACE(input_name, 'ā', 'a'),
          'ē', 'e'
        ),
        'ī', 'i'
      ),
      'ō', 'o'
    ),
    'ū', 'u'
  );
END;
$$;

-- ============================================================================
-- FIX 7: populate_places_from_linz
-- ============================================================================
CREATE OR REPLACE FUNCTION populate_places_from_linz()
RETURNS TABLE (
  inserted_count BIGINT,
  updated_count BIGINT,
  skipped_count BIGINT
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_inserted BIGINT := 0;
  v_updated BIGINT := 0;
  v_skipped BIGINT := 0;
  v_before_count BIGINT;
  v_after_count BIGINT;
BEGIN
  -- Count existing places
  SELECT COUNT(*) INTO v_before_count FROM places WHERE source_id IS NOT NULL;

  -- Insert/update places from LINZ data
  -- Only process POINT geometries (skip LINE, POLYGON, etc.)
  -- Include all POINT places regardless of status
  -- Only process records with valid coordinates
  WITH linz_data AS (
    SELECT DISTINCT ON (name_id)
      name_id,
      name,
      feat_id,
      feat_type,
      crd_latitude::DOUBLE PRECISION AS lat,
      crd_longitude::DOUBLE PRECISION AS lng,
      status,
      region,
      maori_name,
      geom_type
    FROM linz_gazetteer_raw
    WHERE geom_type = 'POINT'
      AND crd_latitude IS NOT NULL
      AND crd_longitude IS NOT NULL
      AND crd_latitude != ''
      AND crd_longitude != ''
      AND crd_latitude::DOUBLE PRECISION BETWEEN -90 AND 90
      AND crd_longitude::DOUBLE PRECISION BETWEEN -180 AND 180
    ORDER BY name_id
  ),
  existing_places AS (
    SELECT id, source_id FROM places WHERE source_id IS NOT NULL
  )
  INSERT INTO places (
    id,
    source_id,
    source_feat_id,
    name,
    lat,
    lng,
    geometry,
    category,
    region,
    status,
    maori_name,
    is_active,
    created_at,
    updated_at
  )
  SELECT 
    COALESCE(ep.id, uuid_generate_v4()::TEXT) AS id,
    ld.name_id AS source_id,
    ld.feat_id AS source_feat_id,
    ld.name,
    ld.lat,
    ld.lng,
    ST_SetSRID(ST_MakePoint(ld.lng, ld.lat), 4326) AS geometry,
    'other' AS category,
    ld.region,
    ld.status,
    NULLIF(ld.maori_name, '') AS maori_name,
    true AS is_active,
    COALESCE(
      (SELECT created_at FROM places WHERE source_id = ld.name_id),
      NOW()
    ) AS created_at,
    NOW() AS updated_at
  FROM linz_data ld
  LEFT JOIN existing_places ep ON ep.source_id = ld.name_id
  ON CONFLICT (source_id) DO UPDATE SET
    name = EXCLUDED.name,
    source_feat_id = EXCLUDED.source_feat_id,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    geometry = EXCLUDED.geometry,
    region = EXCLUDED.region,
    status = EXCLUDED.status,
    maori_name = EXCLUDED.maori_name,
    updated_at = NOW();

  -- Count inserted (new source_ids)
  SELECT COUNT(*) INTO v_inserted
  FROM places
  WHERE source_id IS NOT NULL
    AND created_at >= NOW() - INTERVAL '1 minute';

  -- Count updated (existing source_ids that were updated)
  SELECT COUNT(*) INTO v_updated
  FROM places
  WHERE source_id IS NOT NULL
    AND updated_at >= NOW() - INTERVAL '1 minute'
    AND updated_at > created_at;

  -- Count skipped (invalid data)
  SELECT COUNT(*) INTO v_skipped
  FROM linz_gazetteer_raw
  WHERE geom_type != 'POINT'
     OR crd_latitude IS NULL
     OR crd_longitude IS NULL
     OR crd_latitude = ''
     OR crd_longitude = ''
     OR crd_latitude::DOUBLE PRECISION NOT BETWEEN -90 AND 90
     OR crd_longitude::DOUBLE PRECISION NOT BETWEEN -180 AND 180;

  RETURN QUERY SELECT v_inserted, v_updated, v_skipped;
END;
$$;

-- ============================================================================
-- FIX 8: update_places_categories
-- ============================================================================
CREATE OR REPLACE FUNCTION update_places_categories()
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  UPDATE places p
  SET category = COALESCE(ftm.internal_category, 'other')
  FROM linz_gazetteer_raw lgr
  LEFT JOIN feature_type_map ftm ON ftm.linz_feat_type = lgr.feat_type
  WHERE p.source_id = lgr.name_id
    AND p.category IS DISTINCT FROM COALESCE(ftm.internal_category, 'other');

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count;
END;
$$;

-- ============================================================================
-- FIX 9: populate_place_names
-- ============================================================================
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
  SELECT COUNT(*) INTO v_before_count FROM place_names;

  -- Insert official names (primary)
  INSERT INTO place_names (place_id, name, name_type, is_primary)
  SELECT 
    id,
    name,
    'official',
    true
  FROM places
  WHERE name IS NOT NULL
    AND name != ''
  ON CONFLICT (place_id, name, name_type) DO NOTHING;

  -- Insert normalized names (for search)
  INSERT INTO place_names (place_id, name, name_type, is_primary)
  SELECT 
    id,
    normalize_name(name),
    'normalized',
    false
  FROM places
  WHERE name IS NOT NULL
    AND name != ''
    AND normalize_name(name) != LOWER(name)
  ON CONFLICT (place_id, name, name_type) DO NOTHING;

  -- Insert macronless names (NZ-important)
  INSERT INTO place_names (place_id, name, name_type, is_primary)
  SELECT 
    id,
    remove_macrons(name),
    'macronless',
    false
  FROM places
  WHERE name IS NOT NULL
    AND name != ''
    AND remove_macrons(name) != name
  ON CONFLICT (place_id, name, name_type) DO NOTHING;

  -- Insert Māori names if available
  INSERT INTO place_names (place_id, name, name_type, is_primary)
  SELECT 
    id,
    maori_name,
    'maori',
    false
  FROM places
  WHERE maori_name IS NOT NULL
    AND maori_name != ''
  ON CONFLICT (place_id, name, name_type) DO NOTHING;

  -- Count inserted
  SELECT COUNT(*) - v_before_count INTO v_inserted FROM place_names;
  RETURN QUERY SELECT v_inserted;
END;
$$;

-- ============================================================================
-- FIX 10: find_places_within_radius (from places_search_view.sql)
-- ============================================================================
-- Note: This function was updated in migration 13 (places_search_view.sql) to use 
-- places_search_view and return category/region. We drop and recreate it to add search_path.
DROP FUNCTION IF EXISTS find_places_within_radius(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION) CASCADE;

CREATE FUNCTION find_places_within_radius(
  center_lat DOUBLE PRECISION,
  center_lng DOUBLE PRECISION,
  radius_km DOUBLE PRECISION
)
RETURNS TABLE (
  id TEXT,
  name TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  rank INTEGER,
  category TEXT,
  region TEXT
)
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    psv.id,
    psv.name,
    psv.lat,
    psv.lng,
    psv.rank,
    psv.category,
    psv.region
  FROM places_search_view psv
  WHERE psv.geometry IS NOT NULL
    AND ST_DWithin(
      psv.geometry::geography,
      ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography,
      radius_km * 1000
    )
  ORDER BY 
    ST_Distance(
      psv.geometry::geography,
      ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography
    )
  LIMIT 50;
END;
$$;

-- ============================================================================
-- FIX 11: search_places_by_name
-- ============================================================================
CREATE OR REPLACE FUNCTION search_places_by_name(
  search_query TEXT,
  result_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  id TEXT,
  name TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  rank INTEGER,
  category TEXT,
  region TEXT,
  match_type TEXT
)
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT
    psv.id,
    psv.name,
    psv.lat,
    psv.lng,
    psv.rank,
    psv.category,
    psv.region,
    CASE 
      WHEN LOWER(psv.name) = LOWER(search_query) THEN 'exact'
      WHEN LOWER(psv.name) LIKE LOWER(search_query) || '%' THEN 'prefix'
      WHEN LOWER(psv.name) LIKE '%' || LOWER(search_query) || '%' THEN 'contains'
      ELSE 'other'
    END AS match_type
  FROM places_search_view psv
  WHERE EXISTS (
    SELECT 1 
    FROM place_names pn
    WHERE pn.place_id = psv.id
      AND (
        LOWER(pn.name) = LOWER(search_query)
        OR LOWER(pn.name) LIKE LOWER(search_query) || '%'
        OR LOWER(pn.name) LIKE '%' || LOWER(search_query) || '%'
      )
  )
  ORDER BY 
    CASE 
      WHEN LOWER(psv.name) = LOWER(search_query) THEN 1
      WHEN LOWER(psv.name) LIKE LOWER(search_query) || '%' THEN 2
      WHEN LOWER(psv.name) LIKE '%' || LOWER(search_query) || '%' THEN 3
      ELSE 4
    END,
    psv.rank NULLS LAST,
    psv.name
  LIMIT result_limit;
END;
$$;

-- ============================================================================
-- FIX 12: refresh_places_from_linz
-- ============================================================================
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
  SELECT COUNT(*) INTO v_total_raw FROM linz_gazetteer_raw;

  -- Populate places
  SELECT inserted_count, updated_count, skipped_count 
  INTO v_inserted, v_updated, v_skipped
  FROM populate_places_from_linz();

  -- Update categories
  SELECT update_places_categories() INTO v_categories;

  -- Populate names
  SELECT inserted_count INTO v_names FROM populate_place_names();

  -- Count active/inactive
  SELECT COUNT(*) INTO v_active FROM places WHERE is_active = true;
  SELECT COUNT(*) INTO v_inactive FROM places WHERE is_active = false;

  -- Count new vs existing source_ids
  SELECT COUNT(*) INTO v_new 
  FROM places 
  WHERE source_id IN (
    SELECT DISTINCT name_id FROM linz_gazetteer_raw
  )
  AND created_at > NOW() - INTERVAL '1 hour';

  SELECT COUNT(*) INTO v_existing 
  FROM places 
  WHERE source_id IN (
    SELECT DISTINCT name_id FROM linz_gazetteer_raw
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
