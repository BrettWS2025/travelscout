-- Fix nz_admin_areas geometry column to accept MultiPolygon
-- Many admin boundaries are MultiPolygon (multiple separate polygons)

ALTER TABLE nz_admin_areas 
  ALTER COLUMN geometry TYPE GEOMETRY(MULTIPOLYGON, 4326);

-- Update the constraint to handle MultiPolygon
ALTER TABLE nz_admin_areas 
  DROP CONSTRAINT IF EXISTS valid_geometry;

ALTER TABLE nz_admin_areas 
  ADD CONSTRAINT valid_geometry CHECK (ST_IsValid(geometry));
