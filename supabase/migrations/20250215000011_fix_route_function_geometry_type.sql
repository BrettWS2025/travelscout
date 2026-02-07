-- ============================================================================
-- FIX ROUTE FUNCTION GEOMETRY TYPE ERROR
-- ============================================================================
-- Fixes the get_walking_experiences_near_route function to avoid geometry type
-- casting issues with SET search_path = '' by using ST_DWithin with geography

CREATE OR REPLACE FUNCTION get_walking_experiences_near_route(
    route_geometry_wkt TEXT,
    buffer_km DOUBLE PRECISION DEFAULT 20.0,
    result_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
    id UUID,
    track_name TEXT,
    description TEXT,
    difficulty TEXT,
    completion_time TEXT,
    completion_min INTEGER,
    completion_max INTEGER,
    is_range BOOLEAN,
    kid_friendly BOOLEAN,
    has_alerts TEXT,
    url_to_thumbnail TEXT,
    url_to_webpage TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    shape_length DOUBLE PRECISION,
    district_name TEXT,
    district_osm_id TEXT,
    distance_km DOUBLE PRECISION
)
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
    -- Use ST_DWithin with geography instead of ST_Within with geometry buffer
    -- This avoids geometry type casting issues with SET search_path = ''
    RETURN QUERY
    WITH route_data AS (
        SELECT 
            extensions.ST_GeomFromText(route_geometry_wkt, 4326)::geography AS route_geom_geog
    )
    
    SELECT 
        wep.id,
        wep.track_name,
        wep.description,
        wep.difficulty,
        wep.completion_time,
        wep.completion_min,
        wep.completion_max,
        wep.is_range,
        wep.kid_friendly,
        wep.has_alerts,
        wep.url_to_thumbnail,
        wep.url_to_webpage,
        wep.latitude,
        wep.longitude,
        wep.shape_length,
        wep.district_name,
        wep.district_osm_id,
        -- Calculate distance to nearest point on route
        extensions.ST_Distance(
            extensions.ST_SetSRID(extensions.ST_MakePoint(wep.longitude, wep.latitude), 4326)::geography,
            rd.route_geom_geog
        ) / 1000.0 AS distance_km
    FROM public.walking_experiences_processed wep
    CROSS JOIN route_data rd
    WHERE wep.latitude IS NOT NULL
        AND wep.longitude IS NOT NULL
        AND extensions.ST_DWithin(
            extensions.ST_SetSRID(extensions.ST_MakePoint(wep.longitude, wep.latitude), 4326)::geography,
            rd.route_geom_geog,
            buffer_km * 1000.0
        )
    ORDER BY distance_km ASC
    LIMIT result_limit;
END;
$$;
