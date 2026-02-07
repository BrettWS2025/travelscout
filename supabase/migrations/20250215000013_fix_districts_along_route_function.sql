-- ============================================================================
-- FIX DISTRICTS ALONG ROUTE FUNCTION GEOGRAPHY TYPE ERROR
-- ============================================================================
-- Fixes the get_districts_along_route function to avoid geography type
-- casting issues with SET search_path = ''
-- Uses ST_Length on geometry (which works fine for interpolation calculations)

CREATE OR REPLACE FUNCTION get_districts_along_route(
    route_geometry_wkt TEXT,
    sample_points INTEGER DEFAULT 10
)
RETURNS TABLE (
    district_name TEXT,
    district_osm_id TEXT
)
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
    -- Sample points along the route and find districts
    -- Use ST_Length on geometry (returns length in coordinate system units)
    -- For interpolation, we just need proportional distances, so geometry length is fine
    RETURN QUERY
    WITH route_data AS (
        SELECT 
            extensions.ST_GeomFromText(route_geometry_wkt, 4326) AS route_geom,
            extensions.ST_Length(extensions.ST_GeomFromText(route_geometry_wkt, 4326)) AS total_length
    ),
    sampled_points AS (
        SELECT 
            extensions.ST_LineInterpolatePoint(
                rd.route_geom,
                (gs::DOUBLE PRECISION) / (sample_points + 1)
            ) AS point_geom
        FROM route_data rd
        CROSS JOIN generate_series(1, sample_points) AS gs
        WHERE rd.total_length > 0
    )
    SELECT DISTINCT
        district.name AS district_name,
        district.osm_id AS district_osm_id
    FROM sampled_points sp
    CROSS JOIN LATERAL (
        SELECT name, osm_id
        FROM public.nz_admin_areas
        WHERE admin_level = '6'
            AND country_code = 'NZ'
            AND extensions.ST_Within(sp.point_geom, geometry)
        ORDER BY extensions.ST_Area(geometry) ASC
        LIMIT 1
    ) district
    WHERE district.name IS NOT NULL;
END;
$$;
