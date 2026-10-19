-- ============================================================================
-- NZ regions + nearest-place helpers for search / operator region wiring
-- ============================================================================
-- list_nz_regions: distinct region_name values from nz_places_final
-- find_nearest_nz_place: nearest city/town/village/hamlet with region_name
--
-- PostGIS lives in the extensions schema on Supabase; qualify types/functions
-- so this works with a restricted search_path.

CREATE OR REPLACE FUNCTION public.list_nz_regions()
RETURNS TABLE (region_name text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT DISTINCT p.region_name
  FROM public.nz_places_final p
  WHERE p.region_name IS NOT NULL
    AND btrim(p.region_name) <> ''
  ORDER BY 1;
$$;

CREATE OR REPLACE FUNCTION public.find_nearest_nz_place(
  p_lat double precision,
  p_lon double precision,
  p_radius_m double precision DEFAULT 50000
)
RETURNS TABLE (
  id uuid,
  name text,
  display_name text,
  lat double precision,
  lon double precision,
  region_name text,
  place_type text,
  distance_m double precision
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  SELECT
    p.id,
    p.name,
    p.display_name,
    p.lat,
    p.lon,
    p.region_name,
    p.place_type,
    extensions.ST_Distance(
      p.geometry::extensions.geography,
      extensions.ST_SetSRID(extensions.ST_MakePoint(p_lon, p_lat), 4326)::extensions.geography
    ) AS distance_m
  FROM public.nz_places_final p
  WHERE p.place_type IN ('city', 'town', 'village', 'hamlet')
    AND p.region_name IS NOT NULL
    AND btrim(p.region_name) <> ''
    AND extensions.ST_DWithin(
      p.geometry::extensions.geography,
      extensions.ST_SetSRID(extensions.ST_MakePoint(p_lon, p_lat), 4326)::extensions.geography,
      p_radius_m
    )
  ORDER BY
    p.geometry::extensions.geography
      <-> extensions.ST_SetSRID(extensions.ST_MakePoint(p_lon, p_lat), 4326)::extensions.geography
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.list_nz_regions() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_nearest_nz_place(double precision, double precision, double precision) TO anon, authenticated;
