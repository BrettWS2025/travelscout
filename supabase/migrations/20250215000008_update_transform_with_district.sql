-- ============================================================================
-- UPDATE TRANSFORM FUNCTION TO POPULATE DISTRICT DATA
-- ============================================================================
-- Updates the transform_walking_experiences function to include district
-- lookup using spatial join with nz_admin_areas table.

CREATE OR REPLACE FUNCTION transform_walking_experiences()
RETURNS TABLE(rows_processed BIGINT) AS $$
DECLARE
    result_count BIGINT;
BEGIN
    -- Clear existing processed data
    TRUNCATE TABLE public.walking_experiences_processed;

    -- Transform and insert data with district lookup
    INSERT INTO public.walking_experiences_processed (
        object_id,
        track_name,
        description,
        difficulty,
        completion_time,
        completion_min,
        completion_max,
        is_range,
        kid_friendly,
        has_alerts,
        url_to_thumbnail,
        url_to_webpage,
        date_loaded_to_gis,
        latitude,
        longitude,
        shape_length,
        x_original,
        y_original,
        district_name,
        district_osm_id
    )
    SELECT
        loc."Object ID" AS object_id,
        loc."Track name" AS track_name,
        loc."Description" AS description,
        loc."Difficulty" AS difficulty,
        loc."Completion time" AS completion_time,
        time_range.min_minutes AS completion_min,
        time_range.max_minutes AS completion_max,
        time_range.is_range AS is_range,
        is_kid_friendly(loc."Difficulty", loc."Description") AS kid_friendly,
        loc."Has alerts" AS has_alerts,
        loc."URL to thumbnail" AS url_to_thumbnail,
        loc."URL to webpage" AS url_to_webpage,
        -- Parse date string to timestamp
        CASE 
            WHEN loc."Date loaded to GIS" IS NULL OR TRIM(loc."Date loaded to GIS") = '' THEN NULL
            ELSE TO_TIMESTAMP(loc."Date loaded to GIS", 'DD/MM/YYYY HH12:MI:SS AM')::TIMESTAMP
        END AS date_loaded_to_gis,
        -- Convert NZTM2000 (EPSG:2193) to WGS84 (EPSG:4326) and extract lat/long
        CASE 
            WHEN loc.x IS NOT NULL AND loc.y IS NOT NULL THEN
                ST_Y(ST_Transform(ST_SetSRID(ST_MakePoint(loc.x, loc.y), 2193), 4326))
            ELSE NULL
        END AS latitude,
        CASE 
            WHEN loc.x IS NOT NULL AND loc.y IS NOT NULL THEN
                ST_X(ST_Transform(ST_SetSRID(ST_MakePoint(loc.x, loc.y), 2193), 4326))
            ELSE NULL
        END AS longitude,
        shape."Shape__Length" AS shape_length,
        loc.x AS x_original,
        loc.y AS y_original,
        -- Spatial join to find district (admin_level = 6)
        district.name AS district_name,
        district.osm_id AS district_osm_id
    FROM public.doc_walking_experiences_locations loc
    LEFT JOIN public.doc_walking_experiences_shape shape
        ON loc."URL to webpage" = shape."URL to webpage"
    CROSS JOIN LATERAL parse_completion_time_range(loc."Completion time") AS time_range
    -- Spatial join to find district using point-in-polygon check
    LEFT JOIN LATERAL (
        SELECT name, osm_id
        FROM public.nz_admin_areas
        WHERE admin_level = '6'
            AND country_code = 'NZ'
            AND loc.x IS NOT NULL 
            AND loc.y IS NOT NULL
            AND ST_Within(
                ST_Transform(ST_SetSRID(ST_MakePoint(loc.x, loc.y), 2193), 4326),
                geometry
            )
        ORDER BY ST_Area(geometry) ASC -- Prefer smaller (more specific) districts
        LIMIT 1
    ) district ON true
    WHERE loc."URL to webpage" IS NOT NULL AND loc."URL to webpage" != '';

    GET DIAGNOSTICS result_count = ROW_COUNT;

    RETURN QUERY SELECT result_count;
END;
$$ LANGUAGE plpgsql;
