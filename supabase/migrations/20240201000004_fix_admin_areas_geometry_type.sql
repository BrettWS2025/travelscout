-- Fix nz_admin_areas geometry column to accept MultiPolygon
-- Many admin boundaries are MultiPolygon (multiple separate polygons)

-- First, convert any existing Polygon geometries to MultiPolygon
UPDATE nz_admin_areas 
SET geometry = ST_Multi(geometry)
WHERE ST_GeometryType(geometry) = 'ST_Polygon';

-- Now change the column type to accept MultiPolygon
ALTER TABLE nz_admin_areas 
  ALTER COLUMN geometry TYPE GEOMETRY(MULTIPOLYGON, 4326) 
  USING ST_Multi(geometry);

-- Update the constraint to handle MultiPolygon
ALTER TABLE nz_admin_areas 
  DROP CONSTRAINT IF EXISTS valid_geometry;

ALTER TABLE nz_admin_areas 
  ADD CONSTRAINT valid_geometry CHECK (ST_IsValid(geometry));
