-- ============================================================================
-- Include POLYGON geometries in places import
-- ============================================================================
-- Purpose: Update populate_places_from_linz() to include POLYGON geometries
-- (e.g., Islands) in addition to POINT geometries
-- POLYGON features will use their crd_latitude/crd_longitude to create POINT representations

-- Update the populate_places_from_linz function to include POLYGON geometries
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
  SELECT COUNT(*) INTO v_before_count FROM public.places WHERE source_id IS NOT NULL;

  -- Insert/update places from LINZ data
  -- Process both POINT and POLYGON geometries
  -- POLYGON features (e.g., Islands) will use their crd_latitude/crd_longitude to create POINT representations
  -- Include all places regardless of status
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
    FROM public.linz_gazetteer_raw
    WHERE geom_type IN ('POINT', 'POLYGON')
      AND crd_latitude IS NOT NULL
      AND crd_longitude IS NOT NULL
      AND crd_latitude != ''
      AND crd_longitude != ''
      AND crd_latitude::DOUBLE PRECISION BETWEEN -90 AND 90
      AND crd_longitude::DOUBLE PRECISION BETWEEN -180 AND 180
    ORDER BY name_id
  ),
  existing_places AS (
    SELECT id, source_id FROM public.places WHERE source_id IS NOT NULL
  )
  INSERT INTO public.places (
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
    COALESCE(ep.id, public.uuid_generate_v4()::TEXT) AS id,
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
      (SELECT created_at FROM public.places WHERE source_id = ld.name_id),
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
  FROM public.places
  WHERE source_id IS NOT NULL
    AND created_at >= NOW() - INTERVAL '1 minute';

  -- Count updated (existing source_ids that were updated)
  SELECT COUNT(*) INTO v_updated
  FROM public.places
  WHERE source_id IS NOT NULL
    AND updated_at >= NOW() - INTERVAL '1 minute'
    AND updated_at > created_at;

  -- Count skipped (invalid data or unsupported geometry types)
  -- Now only LINE and other unsupported types are skipped
  SELECT COUNT(*) INTO v_skipped
  FROM public.linz_gazetteer_raw
  WHERE geom_type NOT IN ('POINT', 'POLYGON')
     OR crd_latitude IS NULL
     OR crd_longitude IS NULL
     OR crd_latitude = ''
     OR crd_longitude = ''
     OR crd_latitude::DOUBLE PRECISION NOT BETWEEN -90 AND 90
     OR crd_longitude::DOUBLE PRECISION NOT BETWEEN -180 AND 180;

  RETURN QUERY SELECT v_inserted, v_updated, v_skipped;
END;
$$;
