-- ============================================================================
-- PLACES TABLE
-- ============================================================================
-- Geographic places/locations with PostGIS support
-- Replaces the static NZCities library file
--
-- This table is designed to be compatible with multiple APIs:
-- - Eventfinda API: location name, lat, lng, and PostGIS geometry for spatial queries
-- - Map functions: lat/lng for Leaflet/OpenStreetMap compatibility
-- - Future APIs: flexible structure supports additional location data
--
CREATE TABLE IF NOT EXISTS places (
  id TEXT PRIMARY KEY, -- short code identifier (e.g. "akl" for Auckland)
  name TEXT NOT NULL, -- display name (e.g. "Auckland")
  lat DOUBLE PRECISION NOT NULL, -- latitude in decimal degrees
  lng DOUBLE PRECISION NOT NULL, -- longitude in decimal degrees
  rank INTEGER, -- Optional UI ranking for suggestions/ordering (lower = more prominent)
  geometry GEOMETRY(POINT, 4326), -- PostGIS geometry point (SRID 4326 = WGS84)
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Ensure lat/lng are within valid ranges
  CONSTRAINT valid_lat CHECK (lat >= -90 AND lat <= 90),
  CONSTRAINT valid_lng CHECK (lng >= -180 AND lng <= 180)
);

-- Create spatial index on geometry column for efficient spatial queries
CREATE INDEX IF NOT EXISTS idx_places_geometry ON places USING GIST(geometry);

-- Create index on lat/lng for non-spatial queries
CREATE INDEX IF NOT EXISTS idx_places_lat_lng ON places(lat, lng);

-- Create index on rank for quick ordering of suggested places
CREATE INDEX IF NOT EXISTS idx_places_rank ON places(rank) WHERE rank IS NOT NULL;

-- Create index on name for text search
CREATE INDEX IF NOT EXISTS idx_places_name_search ON places USING GIN(to_tsvector('english', name));

-- Function to automatically update geometry when lat/lng changes
CREATE OR REPLACE FUNCTION update_place_geometry()
RETURNS TRIGGER AS $$
BEGIN
  -- Update geometry column from lat/lng
  NEW.geometry = ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update geometry on insert or update
CREATE TRIGGER update_places_geometry_trigger
  BEFORE INSERT OR UPDATE OF lat, lng ON places
  FOR EACH ROW
  EXECUTE FUNCTION update_place_geometry();

-- Enable RLS (places are public read, but we'll restrict writes to service role)
ALTER TABLE places ENABLE ROW LEVEL SECURITY;

-- Policy: Allow public read access to places (needed for map functions)
CREATE POLICY "Public can view places"
  ON places FOR SELECT
  USING (true);

-- Trigger for places updated_at
CREATE TRIGGER update_places_updated_at
  BEFORE UPDATE ON places
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to find places within a radius using PostGIS
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
  rank INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.name,
    p.lat,
    p.lng,
    p.rank
  FROM places p
  WHERE p.geometry IS NOT NULL
    AND ST_DWithin(
      p.geometry::geography,
      ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography,
      radius_km * 1000 -- Convert km to meters for ST_DWithin
    )
  ORDER BY 
    ST_Distance(
      p.geometry::geography,
      ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography
    )
  LIMIT 50;
END;
$$ LANGUAGE plpgsql STABLE;

