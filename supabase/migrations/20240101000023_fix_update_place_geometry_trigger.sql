-- ============================================================================
-- Fix: Update update_place_geometry trigger function to use schema-qualified PostGIS functions
-- ============================================================================
-- Purpose: The trigger function update_place_geometry() needs to use
-- extensions.ST_MakePoint and extensions.ST_SetSRID when SET search_path = ''

CREATE OR REPLACE FUNCTION update_place_geometry()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Update geometry column from lat/lng using schema-qualified PostGIS functions
  NEW.geometry := extensions.ST_SetSRID(extensions.ST_MakePoint(NEW.lng::double precision, NEW.lat::double precision), 4326);
  RETURN NEW;
END;
$$;
