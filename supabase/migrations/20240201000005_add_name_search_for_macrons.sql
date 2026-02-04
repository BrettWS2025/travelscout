-- ============================================================================
-- ADD NAME_SEARCH COLUMN FOR MACRON-STRIPPED SEARCH
-- ============================================================================
-- Purpose: Add a search-friendly column that strips macrons from place names
-- This allows users to search for "Otorohanga" and find "Ōtorohanga"
-- The original name with macrons is preserved in the 'name' column for display

-- Add name_search column (macron-stripped, lowercase, trimmed)
ALTER TABLE nz_places_final 
ADD COLUMN IF NOT EXISTS name_search TEXT;

-- Create index on name_search for efficient searching
CREATE INDEX IF NOT EXISTS idx_nz_places_final_name_search ON nz_places_final(name_search);

-- Update existing rows to populate name_search
UPDATE nz_places_final
SET name_search = LOWER(TRIM(REGEXP_REPLACE(
  public.remove_macrons(name), 
  '\s+', ' ', 'g'
)))
WHERE name_search IS NULL;

-- ============================================================================
-- UPDATE rebuild_nz_places_final FUNCTION
-- ============================================================================
-- Update the function to populate name_search column

CREATE OR REPLACE FUNCTION rebuild_nz_places_final(p_country_code TEXT DEFAULT 'NZ')
RETURNS TABLE (
  inserted_count BIGINT,
  updated_count BIGINT,
  deleted_count BIGINT
) AS $$
DECLARE
  v_inserted BIGINT := 0;
  v_updated BIGINT := 0;
  v_deleted BIGINT := 0;
BEGIN
  -- Delete existing records for this country
  DELETE FROM nz_places_final WHERE country_code = p_country_code;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  
  -- Insert enriched places with spatial joins
  WITH enriched_places AS (
    SELECT
      pr.country_code,
      pr.osm_type,
      pr.osm_id,
      pr.place_type,
      pr.name,
      -- Normalize name: lowercase, trim, remove extra spaces
      LOWER(TRIM(REGEXP_REPLACE(pr.name, '\s+', ' ', 'g'))) AS name_norm,
      -- Search-friendly name: strip macrons, lowercase, trim, remove extra spaces
      LOWER(TRIM(REGEXP_REPLACE(
        public.remove_macrons(pr.name), 
        '\s+', ' ', 'g'
      ))) AS name_search,
      -- Build display_name: name + district + region
      CASE
        WHEN district.name IS NOT NULL AND region.name IS NOT NULL THEN
          pr.name || ', ' || district.name || ', ' || region.name
        WHEN district.name IS NOT NULL THEN
          pr.name || ', ' || district.name
        WHEN region.name IS NOT NULL THEN
          pr.name || ', ' || region.name
        ELSE
          pr.name
      END AS display_name,
      -- Build dedupe_key: country:name_norm:district:region
      p_country_code || ':' ||
      LOWER(TRIM(REGEXP_REPLACE(pr.name, '\s+', ' ', 'g'))) || ':' ||
      COALESCE(LOWER(TRIM(REGEXP_REPLACE(district.name, '\s+', ' ', 'g'))), '') || ':' ||
      COALESCE(LOWER(TRIM(REGEXP_REPLACE(region.name, '\s+', ' ', 'g'))), '') AS dedupe_key,
      pr.name_variants,
      pr.lat,
      pr.lon,
      pr.geometry,
      district.name AS district_name,
      district.osm_id AS district_osm_id,
      region.name AS region_name,
      region.osm_id AS region_osm_id,
      pr.tags
    FROM nz_places_raw pr
    LEFT JOIN LATERAL (
      SELECT name, osm_id
      FROM nz_admin_areas
      WHERE admin_level = '6'
        AND country_code = pr.country_code
        AND ST_Within(pr.geometry, geometry)
      ORDER BY ST_Area(geometry) ASC -- Prefer smaller (more specific) districts
      LIMIT 1
    ) district ON true
    LEFT JOIN LATERAL (
      SELECT name, osm_id
      FROM nz_admin_areas
      WHERE admin_level = '4'
        AND country_code = pr.country_code
        AND ST_Within(pr.geometry, geometry)
      ORDER BY ST_Area(geometry) ASC -- Prefer smaller (more specific) regions
      LIMIT 1
    ) region ON true
    WHERE pr.country_code = p_country_code
  )
  INSERT INTO nz_places_final (
    country_code,
    osm_type,
    osm_id,
    place_type,
    name,
    name_norm,
    name_search,
    display_name,
    dedupe_key,
    name_variants,
    lat,
    lon,
    geometry,
    district_name,
    district_osm_id,
    region_name,
    region_osm_id,
    tags
  )
  SELECT
    country_code,
    osm_type,
    osm_id,
    place_type,
    name,
    name_norm,
    name_search,
    display_name,
    dedupe_key,
    name_variants,
    lat,
    lon,
    geometry,
    district_name,
    district_osm_id,
    region_name,
    region_osm_id,
    tags
  FROM enriched_places
  ON CONFLICT (country_code, osm_type, osm_id) DO UPDATE SET
    place_type = EXCLUDED.place_type,
    name = EXCLUDED.name,
    name_norm = EXCLUDED.name_norm,
    name_search = EXCLUDED.name_search,
    display_name = EXCLUDED.display_name,
    dedupe_key = EXCLUDED.dedupe_key,
    name_variants = EXCLUDED.name_variants,
    lat = EXCLUDED.lat,
    lon = EXCLUDED.lon,
    geometry = EXCLUDED.geometry,
    district_name = EXCLUDED.district_name,
    district_osm_id = EXCLUDED.district_osm_id,
    region_name = EXCLUDED.region_name,
    region_osm_id = EXCLUDED.region_osm_id,
    tags = EXCLUDED.tags,
    updated_at = NOW();
  
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  
  RETURN QUERY SELECT v_inserted, v_updated, v_deleted;
END;
$$ LANGUAGE plpgsql;
