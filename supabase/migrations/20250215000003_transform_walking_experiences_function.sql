-- ============================================================================
-- TRANSFORMATION FUNCTION FOR WALKING EXPERIENCES
-- ============================================================================
-- This function transforms data from the two raw CSV tables into the
-- processed walking_experiences_processed table.
--
-- Usage: SELECT transform_walking_experiences();
-- This will clear and repopulate the processed table.

-- Helper function to parse completion time to minutes
CREATE OR REPLACE FUNCTION parse_completion_time_to_minutes(time_str TEXT)
RETURNS INTEGER AS $$
DECLARE
    total_minutes INTEGER := 0;
    days_match TEXT;
    hours_match TEXT;
    mins_match TEXT;
    decimal_match TEXT;
BEGIN
    IF time_str IS NULL OR TRIM(time_str) = '' THEN
        RETURN NULL;
    END IF;

    -- Extract days
    days_match := (SELECT (regexp_matches(time_str, '(\d+)\s*days?', 'i'))[1]);
    IF days_match IS NOT NULL THEN
        total_minutes := total_minutes + days_match::INTEGER * 24 * 60;
    END IF;

    -- Extract hours
    hours_match := (SELECT (regexp_matches(time_str, '(\d+(?:\.\d+)?)\s*hrs?', 'i'))[1]);
    IF hours_match IS NOT NULL THEN
        total_minutes := total_minutes + (hours_match::DOUBLE PRECISION * 60)::INTEGER;
    END IF;

    -- Extract minutes
    mins_match := (SELECT (regexp_matches(time_str, '(\d+)\s*m(?:in|ins?)?', 'i'))[1]);
    IF mins_match IS NOT NULL THEN
        total_minutes := total_minutes + mins_match::INTEGER;
    END IF;

    -- Handle decimal hours if no other matches (e.g., "3.5 hr")
    IF days_match IS NULL AND hours_match IS NULL AND mins_match IS NULL THEN
        decimal_match := (SELECT (regexp_matches(time_str, '(\d+\.\d+)', 'i'))[1]);
        IF decimal_match IS NOT NULL THEN
            total_minutes := (decimal_match::DOUBLE PRECISION * 60)::INTEGER;
        END IF;
    END IF;

    RETURN total_minutes;
END;
$$ LANGUAGE plpgsql;

-- Helper function to parse completion time range
CREATE OR REPLACE FUNCTION parse_completion_time_range(time_str TEXT)
RETURNS TABLE(min_minutes INTEGER, max_minutes INTEGER, is_range BOOLEAN) AS $$
DECLARE
    parts TEXT[];
    min_str TEXT;
    max_str TEXT;
    min_mins INTEGER;
    max_mins INTEGER;
    numbers TEXT[];
BEGIN
    IF time_str IS NULL OR TRIM(time_str) = '' THEN
        RETURN QUERY SELECT NULL::INTEGER, NULL::INTEGER, FALSE;
        RETURN;
    END IF;

    -- Check if it's a range (contains "-" or "–")
    IF time_str ~ '[-–]' THEN
        -- Split on first occurrence of "-" or "–"
        IF time_str ~ '-' THEN
            parts := regexp_split_to_array(time_str, '-', 'g');
        ELSE
            parts := regexp_split_to_array(time_str, '–', 'g');
        END IF;
        
        IF array_length(parts, 1) >= 2 THEN
            min_str := TRIM(parts[1]);
            max_str := TRIM(parts[2]);
            
            -- Handle cases like "2-3 hr" where unit is only on second part
            IF min_str !~ '(hr|min|day)' AND max_str ~ '(hr|min|day)' THEN
                -- Extract number from min_str and append unit from max_str
                min_str := (SELECT (regexp_matches(min_str, '(\d+(?:\.\d+)?)', 'i'))[1]) || ' ' || 
                          (SELECT (regexp_matches(max_str, '(hr|hrs|min|mins|day|days)', 'i'))[1]);
            END IF;
            
            min_mins := parse_completion_time_to_minutes(min_str);
            max_mins := parse_completion_time_to_minutes(max_str);
            
            -- If parsing failed, try to extract numbers
            IF min_mins = 0 AND max_mins = 0 THEN
                SELECT array_agg(matches[1]) INTO numbers
                FROM regexp_matches(time_str, '(\d+(?:\.\d+)?)', 'g') AS matches;
                IF numbers IS NOT NULL AND array_length(numbers, 1) >= 2 THEN
                    IF time_str ~* 'hr' THEN
                        min_mins := (numbers[1]::DOUBLE PRECISION * 60)::INTEGER;
                        max_mins := (numbers[2]::DOUBLE PRECISION * 60)::INTEGER;
                    ELSIF time_str ~* 'min' THEN
                        min_mins := numbers[1]::INTEGER;
                        max_mins := numbers[2]::INTEGER;
                    END IF;
                END IF;
            END IF;
            
            RETURN QUERY SELECT min_mins, max_mins, TRUE;
            RETURN;
        END IF;
    END IF;
    
    -- Single value
    min_mins := parse_completion_time_to_minutes(time_str);
    RETURN QUERY SELECT min_mins, min_mins, FALSE;
END;
$$ LANGUAGE plpgsql;

-- Helper function to determine if walk is kid-friendly
CREATE OR REPLACE FUNCTION is_kid_friendly(difficulty TEXT, description TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    difficulty_lower TEXT;
    description_lower TEXT;
    is_easy BOOLEAN;
BEGIN
    IF difficulty IS NULL OR description IS NULL THEN
        RETURN FALSE;
    END IF;

    difficulty_lower := LOWER(difficulty);
    description_lower := LOWER(description);

    -- Check difficulty
    is_easy := difficulty_lower LIKE '%easy%' OR difficulty_lower LIKE '%easiest%';

    -- Check description for kid-friendly phrases
    IF is_easy OR
       description_lower LIKE '%kid friendly%' OR
       description_lower LIKE '%kid-friendly%' OR
       description_lower LIKE '%kids friendly%' OR
       description_lower LIKE '%kids-friendly%' OR
       description_lower LIKE '%suitable for kid%' OR
       description_lower LIKE '%suitable for kids%' OR
       description_lower LIKE '%suitable for children%' OR
       description_lower LIKE '%suitable for child%' OR
       description_lower LIKE '%families with kids%' OR
       description_lower LIKE '%family with kids%' OR
       description_lower LIKE '%great for kids%' OR
       description_lower LIKE '%great for children%' OR
       description_lower LIKE '%kids will love%' OR
       description_lower LIKE '%children will love%' OR
       description_lower LIKE '%family friendly%' OR
       description_lower LIKE '%family-friendly%' OR
       description_lower LIKE '%suitable for older children%' OR
       description_lower LIKE '%suitable for younger children%' OR
       description_lower LIKE '%ideal for children%' OR
       description_lower LIKE '%ideal for kids%' OR
       description_lower LIKE '%good for children%' OR
       description_lower LIKE '%good for kids%' OR
       description_lower LIKE '%perfect for children%' OR
       description_lower LIKE '%perfect for kids%' THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Main transformation function
CREATE OR REPLACE FUNCTION transform_walking_experiences()
RETURNS TABLE(rows_processed BIGINT) AS $$
DECLARE
    result_count BIGINT;
BEGIN
    -- Clear existing processed data
    TRUNCATE TABLE public.walking_experiences_processed;

    -- Transform and insert data
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
        y_original
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
        loc.y AS y_original
    FROM public.doc_walking_experiences_locations loc
    LEFT JOIN public.doc_walking_experiences_shape shape
        ON loc."URL to webpage" = shape."URL to webpage"
    CROSS JOIN LATERAL parse_completion_time_range(loc."Completion time") AS time_range
    WHERE loc."URL to webpage" IS NOT NULL AND loc."URL to webpage" != '';

    GET DIAGNOSTICS result_count = ROW_COUNT;

    RETURN QUERY SELECT result_count;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission (adjust as needed)
GRANT EXECUTE ON FUNCTION transform_walking_experiences() TO authenticated;
GRANT EXECUTE ON FUNCTION transform_walking_experiences() TO anon;
