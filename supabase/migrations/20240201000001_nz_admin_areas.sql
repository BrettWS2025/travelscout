-- ============================================================================
-- NZ_ADMIN_AREAS TABLE
-- ============================================================================
-- Reference admin polygons extracted from OSM PBF
-- Unique on (country_code, osm_type, osm_id)
-- Used for spatial joins to enrich places with district/region information

CREATE TABLE IF NOT EXISTS nz_admin_areas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  country_code TEXT NOT NULL DEFAULT 'NZ',
  osm_type TEXT NOT NULL, -- 'way', 'relation'
  osm_id TEXT NOT NULL,
  admin_level TEXT NOT NULL, -- '4' = region, '6' = district
  name TEXT NOT NULL,
  geometry GEOMETRY(POLYGON, 4326) NOT NULL, -- PostGIS polygon geometry
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Ensure unique OSM entities
  UNIQUE(country_code, osm_type, osm_id),
  
  -- Ensure valid geometry
  CONSTRAINT valid_geometry CHECK (ST_IsValid(geometry))
);

-- Create spatial index on geometry (critical for spatial joins)
CREATE INDEX IF NOT EXISTS idx_nz_admin_areas_geometry ON nz_admin_areas USING GIST(geometry);

-- Create index on country_code, osm_type, osm_id for lookups
CREATE INDEX IF NOT EXISTS idx_nz_admin_areas_osm ON nz_admin_areas(country_code, osm_type, osm_id);

-- Create index on admin_level for filtering
CREATE INDEX IF NOT EXISTS idx_nz_admin_areas_admin_level ON nz_admin_areas(admin_level);

-- Create index on name for text search
CREATE INDEX IF NOT EXISTS idx_nz_admin_areas_name_search ON nz_admin_areas USING GIN(to_tsvector('english', name));

-- Trigger for updated_at
CREATE TRIGGER update_nz_admin_areas_updated_at
  BEFORE UPDATE ON nz_admin_areas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE nz_admin_areas ENABLE ROW LEVEL SECURITY;

-- Policy: Allow public read access
CREATE POLICY "Public can view nz_admin_areas"
  ON nz_admin_areas FOR SELECT
  USING (true);
