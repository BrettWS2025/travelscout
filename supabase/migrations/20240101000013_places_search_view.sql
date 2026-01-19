-- ============================================================================
-- STEP 7: PLACES_SEARCH_VIEW
-- ============================================================================
-- Purpose: One clean object your app/search layer consumes
-- This is what autocomplete, APIs, and exports consume

CREATE OR REPLACE VIEW places_search_view AS
SELECT 
  p.id,
  p.name,
  p.lat,
  p.lng,
  p.rank,
  p.category,
  p.region,
  p.status,
  p.maori_name,
  p.is_active,
  p.geometry,
  p.created_at,
  p.updated_at,
  -- Array of all searchable names (ordered and distinct)
  COALESCE(
    (
      SELECT ARRAY_AGG(DISTINCT ordered_names.name)
      FROM (
        SELECT DISTINCT ON (pn.name) pn.name
        FROM place_names pn
        WHERE pn.place_id = p.id
          AND pn.name IS NOT NULL
        ORDER BY 
          pn.name,
          CASE pn.name_type
            WHEN 'official' THEN 1
            WHEN 'maori' THEN 2
            WHEN 'normalized' THEN 3
            WHEN 'macronless' THEN 4
            ELSE 5
          END
      ) ordered_names
    ),
    ARRAY[]::TEXT[]
  ) AS search_names
FROM places p
WHERE p.is_active = true;

-- Grant access to the view
GRANT SELECT ON places_search_view TO authenticated;
GRANT SELECT ON places_search_view TO anon;

-- ============================================================================
-- UPDATE EXISTING FUNCTION: find_places_within_radius
-- ============================================================================
-- Update to use places_search_view for consistency

CREATE OR REPLACE FUNCTION find_places_within_radius(
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
) AS $$
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
      radius_km * 1000 -- Convert km to meters for ST_DWithin
    )
  ORDER BY 
    ST_Distance(
      psv.geometry::geography,
      ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography
    )
  LIMIT 50;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- SEARCH FUNCTION: Search places by name (using place_names)
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
) AS $$
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
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- REFRESH WORKFLOW FUNCTION
-- ============================================================================
-- When LINZ updates:
-- 1. TRUNCATE linz_gazetteer_raw
-- 2. Reload CSV (manual step)
-- 3. Re-run: place insert/update logic, name regeneration
-- 4. Log: total rows, active vs inactive, new vs existing source_ids

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
) AS $$
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
$$ LANGUAGE plpgsql;

-- Note: After loading CSV, run:
-- SELECT * FROM refresh_places_from_linz();
