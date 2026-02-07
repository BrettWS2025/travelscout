-- ============================================================================
-- FIX NEAR POINT FUNCTION NAME
-- ============================================================================
-- Fixes the get_walking_experiences_near_point function to use the correct
-- function name: st_distancesphere (lowercase, no underscores) instead of ST_Distance_Sphere

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
    WITH center_point AS (
        SELECT extensions.ST_SetSRID(extensions.ST_MakePoint(center_lng, center_lat), 4326) AS center_geom
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
        -- Calculate distance in km using st_distancesphere (correct function name)
        extensions.st_distancesphere(
            extensions.ST_SetSRID(extensions.ST_MakePoint(wep.longitude, wep.latitude), 4326),
            cp.center_geom
        ) / 1000.0 AS distance_km
    FROM public.walking_experiences_processed wep
    CROSS JOIN center_point cp
    WHERE wep.latitude IS NOT NULL
        AND wep.longitude IS NOT NULL
        -- Use st_distancesphere for accurate distance filtering (works with geometry)
        AND extensions.st_distancesphere(
            extensions.ST_SetSRID(extensions.ST_MakePoint(wep.longitude, wep.latitude), 4326),
            cp.center_geom
        ) <= (radius_km * 1000.0)  -- radius_km in meters
    ORDER BY distance_km ASC
    LIMIT result_limit;
END;
$$;
