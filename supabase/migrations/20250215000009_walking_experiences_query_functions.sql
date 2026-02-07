-- ============================================================================
-- QUERY FUNCTIONS FOR WALKING EXPERIENCES
-- ============================================================================
-- Optimized functions for querying walking experiences by district and location

-- Function to get walking experiences by district name
CREATE OR REPLACE FUNCTION get_walking_experiences_by_district(
    district_name_param TEXT,
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
    district_osm_id TEXT
)
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
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
        wep.district_osm_id
    FROM public.walking_experiences_processed wep
    WHERE wep.district_name = district_name_param
        AND wep.latitude IS NOT NULL
        AND wep.longitude IS NOT NULL
    ORDER BY wep.track_name
    LIMIT result_limit;
END;
$$;

-- Function to get walking experiences within radius of a point
CREATE OR REPLACE FUNCTION get_walking_experiences_near_point(
    center_lat DOUBLE PRECISION,
    center_lng DOUBLE PRECISION,
    radius_km DOUBLE PRECISION DEFAULT 20.0,
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
    RETURN QUERY
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
        -- Calculate distance in km using PostGIS geography
        extensions.ST_Distance(
            extensions.ST_SetSRID(extensions.ST_MakePoint(wep.longitude, wep.latitude), 4326)::geography,
            extensions.ST_SetSRID(extensions.ST_MakePoint(center_lng, center_lat), 4326)::geography
        ) / 1000.0 AS distance_km
    FROM public.walking_experiences_processed wep
    WHERE wep.latitude IS NOT NULL
        AND wep.longitude IS NOT NULL
        AND extensions.ST_DWithin(
            extensions.ST_SetSRID(extensions.ST_MakePoint(wep.longitude, wep.latitude), 4326)::geography,
            extensions.ST_SetSRID(extensions.ST_MakePoint(center_lng, center_lat), 4326)::geography,
            radius_km * 1000.0
        )
    ORDER BY distance_km ASC
    LIMIT result_limit;
END;
$$;

-- Function to get walking experiences near a route (for road sectors)
-- Takes a route geometry as WKT text (LINESTRING) and finds experiences within buffer
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
    -- Convert WKT text to geometry and create buffer in a single CTE
    RETURN QUERY
    WITH route_data AS (
        SELECT 
            extensions.ST_GeomFromText(route_geometry_wkt, 4326) AS route_geom,
            extensions.ST_Buffer(
                extensions.ST_GeomFromText(route_geometry_wkt, 4326)::geography, 
                buffer_km * 1000.0
            )::geometry AS route_buffer
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
            rd.route_geom::geography
        ) / 1000.0 AS distance_km
    FROM public.walking_experiences_processed wep
    CROSS JOIN route_data rd
    WHERE wep.latitude IS NOT NULL
        AND wep.longitude IS NOT NULL
        AND extensions.ST_Within(
            extensions.ST_SetSRID(extensions.ST_MakePoint(wep.longitude, wep.latitude), 4326),
            rd.route_buffer
        )
    ORDER BY distance_km ASC
    LIMIT result_limit;
END;
$$;

-- Function to get walking experiences by multiple districts (for routes passing through multiple districts)
CREATE OR REPLACE FUNCTION get_walking_experiences_by_districts(
    district_names TEXT[],
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
    district_osm_id TEXT
)
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
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
        wep.district_osm_id
    FROM public.walking_experiences_processed wep
    WHERE wep.district_name = ANY(district_names)
        AND wep.latitude IS NOT NULL
        AND wep.longitude IS NOT NULL
    ORDER BY wep.track_name
    LIMIT result_limit;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_walking_experiences_by_district(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_walking_experiences_by_district(TEXT, INTEGER) TO anon;

GRANT EXECUTE ON FUNCTION get_walking_experiences_near_point(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_walking_experiences_near_point(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER) TO anon;

GRANT EXECUTE ON FUNCTION get_walking_experiences_near_route(TEXT, DOUBLE PRECISION, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_walking_experiences_near_route(TEXT, DOUBLE PRECISION, INTEGER) TO anon;

GRANT EXECUTE ON FUNCTION get_walking_experiences_by_districts(TEXT[], INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_walking_experiences_by_districts(TEXT[], INTEGER) TO anon;
