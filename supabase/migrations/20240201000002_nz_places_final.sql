-- ============================================================================
-- NZ_PLACES_FINAL TABLE
-- ============================================================================
-- Enriched, app-ready table for places
-- Contains district/region names, display_name, dedupe_key, normalized names
-- Indexed for search and spatial queries
-- No spatial joins needed at runtime - all data is pre-joined

CREATE TABLE IF NOT EXISTS nz_places_final (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  country_code TEXT NOT NULL DEFAULT 'NZ',
  osm_type TEXT NOT NULL,
  osm_id TEXT NOT NULL,
  place_type TEXT,
  name TEXT NOT NULL,
  name_norm TEXT NOT NULL, -- Normalized name (lowercase, trimmed, for deduplication)
  display_name TEXT NOT NULL, -- Formatted display name (e.g., "Auckland, Auckland Region")
  dedupe_key TEXT NOT NULL, -- Unique key: country_code:name_norm:district:region
  name_variants JSONB,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  geometry GEOMETRY(POINT, 4326) NOT NULL,
  
  -- Admin area information (from spatial join)
  district_name TEXT, -- From admin_level=6
  district_osm_id TEXT, -- OSM ID of district
  region_name TEXT, -- From admin_level=4
  region_osm_id TEXT, -- OSM ID of region
  
  -- Original tags for reference
  tags JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Ensure unique OSM entities
  UNIQUE(country_code, osm_type, osm_id),
  
  -- Ensure valid coordinates
  CONSTRAINT valid_lat CHECK (lat >= -90 AND lat <= 90),
  CONSTRAINT valid_lon CHECK (lon >= -180 AND lon <= 180)
);

-- Create spatial index on geometry
CREATE INDEX IF NOT EXISTS idx_nz_places_final_geometry ON nz_places_final USING GIST(geometry);

-- Create index on country_code, osm_type, osm_id for lookups
CREATE INDEX IF NOT EXISTS idx_nz_places_final_osm ON nz_places_final(country_code, osm_type, osm_id);

-- Create index on dedupe_key for deduplication checks
CREATE UNIQUE INDEX IF NOT EXISTS idx_nz_places_final_dedupe_key ON nz_places_final(dedupe_key);

-- Create index on name_norm for search
CREATE INDEX IF NOT EXISTS idx_nz_places_final_name_norm ON nz_places_final(name_norm);

-- Create index on display_name for search
CREATE INDEX IF NOT EXISTS idx_nz_places_final_display_name_search ON nz_places_final USING GIN(to_tsvector('english', display_name));

-- Create index on place_type for filtering
CREATE INDEX IF NOT EXISTS idx_nz_places_final_place_type ON nz_places_final(place_type);

-- Create index on district_name for filtering
CREATE INDEX IF NOT EXISTS idx_nz_places_final_district_name ON nz_places_final(district_name);

-- Create index on region_name for filtering
CREATE INDEX IF NOT EXISTS idx_nz_places_final_region_name ON nz_places_final(region_name);

-- Create GIN index on tags for JSON queries
CREATE INDEX IF NOT EXISTS idx_nz_places_final_tags ON nz_places_final USING GIN(tags);

-- Trigger for updated_at
CREATE TRIGGER update_nz_places_final_updated_at
  BEFORE UPDATE ON nz_places_final
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE nz_places_final ENABLE ROW LEVEL SECURITY;

-- Policy: Allow public read access
CREATE POLICY "Public can view nz_places_final"
  ON nz_places_final FOR SELECT
  USING (true);

-- ============================================================================
-- FUNCTION: Build/Rebuild nz_places_final from raw data
-- ============================================================================
-- This function:
-- 1. Spatially joins places to admin areas
-- 2. Maps admin_level=6 → district, admin_level=4 → region
-- 3. Generates name_norm, display_name, dedupe_key
-- 4. Truncates and rebuilds per country (safe for reruns)

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
