-- Fix nz_admin_areas geometry column to accept MultiPolygon
-- Many admin boundaries are MultiPolygon (multiple separate polygons)

-- Change the column type to MultiPolygon, converting Polygon to MultiPolygon on the fly
ALTER TABLE nz_admin_areas 
  ALTER COLUMN geometry TYPE GEOMETRY(MULTIPOLYGON, 4326)
  USING CASE 
    WHEN ST_GeometryType(geometry) = 'ST_Polygon' THEN ST_Multi(geometry)
    WHEN ST_GeometryType(geometry) = 'ST_MultiPolygon' THEN geometry
    ELSE ST_Multi(geometry)  -- Fallback: convert any other type to MultiPolygon
  END;

-- Update the constraint to handle MultiPolygon
ALTER TABLE nz_admin_areas 
  DROP CONSTRAINT IF EXISTS valid_geometry;

ALTER TABLE nz_admin_areas 
  ADD CONSTRAINT valid_geometry CHECK (ST_IsValid(geometry));
