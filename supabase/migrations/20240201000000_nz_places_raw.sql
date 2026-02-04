-- ============================================================================
-- NZ_PLACES_RAW TABLE
-- ============================================================================
-- Baseline place points extracted from OSM PBF
-- Matches CSV structure from extract_places.py
-- Unique on (country_code, osm_type, osm_id)

CREATE TABLE IF NOT EXISTS nz_places_raw (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  country_code TEXT NOT NULL DEFAULT 'NZ',
  osm_type TEXT NOT NULL, -- 'node', 'way', 'relation'
  osm_id TEXT NOT NULL,
  place_type TEXT, -- e.g., 'city', 'town', 'village', 'hamlet', 'suburb', etc.
  name TEXT NOT NULL,
  name_variants JSONB, -- JSON object with name variants (name:en, name:mi, alt_name, etc.)
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  tags JSONB, -- Full OSM tags as JSON
  geometry GEOMETRY(POINT, 4326), -- PostGIS point geometry
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Ensure unique OSM entities
  UNIQUE(country_code, osm_type, osm_id),
  
  -- Ensure valid coordinates
  CONSTRAINT valid_lat CHECK (lat >= -90 AND lat <= 90),
  CONSTRAINT valid_lon CHECK (lon >= -180 AND lon <= 180)
);

-- Create spatial index on geometry
CREATE INDEX IF NOT EXISTS idx_nz_places_raw_geometry ON nz_places_raw USING GIST(geometry);

-- Create index on country_code, osm_type, osm_id for lookups
CREATE INDEX IF NOT EXISTS idx_nz_places_raw_osm ON nz_places_raw(country_code, osm_type, osm_id);

-- Create index on place_type for filtering
CREATE INDEX IF NOT EXISTS idx_nz_places_raw_place_type ON nz_places_raw(place_type);

-- Create index on name for text search
CREATE INDEX IF NOT EXISTS idx_nz_places_raw_name_search ON nz_places_raw USING GIN(to_tsvector('english', name));

-- Create GIN index on tags for JSON queries
CREATE INDEX IF NOT EXISTS idx_nz_places_raw_tags ON nz_places_raw USING GIN(tags);

-- Function to automatically update geometry when lat/lon changes
CREATE OR REPLACE FUNCTION update_nz_places_raw_geometry()
RETURNS TRIGGER AS $$
BEGIN
  NEW.geometry = ST_SetSRID(ST_MakePoint(NEW.lon, NEW.lat), 4326);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update geometry
CREATE TRIGGER update_nz_places_raw_geometry_trigger
  BEFORE INSERT OR UPDATE OF lat, lon ON nz_places_raw
  FOR EACH ROW
  EXECUTE FUNCTION update_nz_places_raw_geometry();

-- Trigger for updated_at
CREATE TRIGGER update_nz_places_raw_updated_at
  BEFORE UPDATE ON nz_places_raw
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE nz_places_raw ENABLE ROW LEVEL SECURITY;

-- Policy: Allow public read access
CREATE POLICY "Public can view nz_places_raw"
  ON nz_places_raw FOR SELECT
  USING (true);
