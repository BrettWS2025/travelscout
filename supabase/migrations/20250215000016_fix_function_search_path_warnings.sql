-- ============================================================================
-- FIX FUNCTION SEARCH PATH MUTABLE WARNINGS
-- ============================================================================
-- This migration fixes WARN-level security issues by setting search_path
-- on all remaining functions to prevent search path injection attacks.
-- ============================================================================

-- ============================================================================
-- FIX 1: parse_completion_time_range
-- ============================================================================
CREATE OR REPLACE FUNCTION public.parse_completion_time_range(time_str text)
 RETURNS TABLE(min_minutes integer, max_minutes integer, is_range boolean)
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
DECLARE
    normalized TEXT;
    segments TEXT[];
    seg TEXT;
    seg_min INTEGER;
    seg_max INTEGER;
    seg_mins INTEGER[];
    seg_maxs INTEGER[];
    left_part TEXT;
    right_part TEXT;
    parts TEXT[];
    is_hyphen_split BOOLEAN;
    left_has_unit BOOLEAN;
    right_has_unit BOOLEAN;
    left_num_only DOUBLE PRECISION;
    right_mult INTEGER;
    left_minutes INTEGER;
    right_minutes INTEGER;
    overall_min INTEGER;
    overall_max INTEGER;
    extracted_time TEXT;
BEGIN
    IF time_str IS NULL OR TRIM(time_str) = '' THEN
        RETURN QUERY SELECT NULL::INTEGER, NULL::INTEGER, FALSE;
        RETURN;
    END IF;

    -- First, extract the time portion (removes extra text like "one way", "return", "Various from")
    extracted_time := public.extract_time_portion(time_str);
    IF extracted_time IS NULL OR TRIM(extracted_time) = '' THEN
        RETURN QUERY SELECT NULL::INTEGER, NULL::INTEGER, FALSE;
        RETURN;
    END IF;

    -- Normalize: lowercase, trim, replace ALL types of dashes with ASCII dash
    normalized := LOWER(TRIM(extracted_time));
    normalized := regexp_replace(normalized, '[\u2013\u2014–—]', '-', 'g');
    normalized := regexp_replace(normalized, '\u00A0', ' ', 'g');
    normalized := regexp_replace(normalized, '\bto\b', ' - ', 'gi');
    normalized := regexp_replace(normalized, '/', '|', 'g');
    normalized := regexp_replace(normalized, '\s+', ' ', 'g');
    
    -- Normalize units: MUST do this before splitting
    normalized := regexp_replace(normalized, '\bhours?\b', 'hr', 'gi');
    normalized := regexp_replace(normalized, '\bhrs\b', 'hr', 'gi');
    normalized := regexp_replace(normalized, '\bh\b', 'hr', 'gi');
    normalized := regexp_replace(normalized, '\bminutes?\b', 'min', 'gi');
    normalized := regexp_replace(normalized, '\bmins\b', 'min', 'gi');
    normalized := regexp_replace(normalized, '\bm\b', 'min', 'gi');
    normalized := regexp_replace(normalized, '\bdays?\b', 'day', 'gi');
    normalized := regexp_replace(normalized, '\bd\b', 'day', 'gi');
    normalized := regexp_replace(normalized, '\s+', ' ', 'g');
    normalized := TRIM(normalized);
    
    -- Split by "|" to handle multiple segments
    segments := regexp_split_to_array(normalized, '\|');
    
    -- Process each segment
    seg_mins := ARRAY[]::INTEGER[];
    seg_maxs := ARRAY[]::INTEGER[];
    
    FOREACH seg IN ARRAY segments
    LOOP
        seg := TRIM(seg);
        IF seg = '' THEN
            CONTINUE;
        END IF;
        
        -- Add spaces around dashes for splitting
        seg := regexp_replace(seg, '-', ' - ', 'g');
        seg := regexp_replace(seg, '\s+', ' ', 'g');
        seg := TRIM(seg);
        
        parts := regexp_split_to_array(seg, ' - ');
        is_hyphen_split := array_length(parts, 1) >= 2;
        
        IF is_hyphen_split THEN
            left_part := TRIM(parts[1]);
            right_part := TRIM(parts[2]);
            
            -- Check for units (after normalization, should be 'day', 'hr', or 'min')
            left_has_unit := left_part ~ '\b(day|hr|min)\b';
            right_has_unit := right_part ~ '\b(day|hr|min)\b';
            
            IF left_has_unit OR right_has_unit THEN
                right_mult := public.get_unit_multiplier(right_part);
                
                -- Try to parse left part as number only
                BEGIN
                    left_num_only := left_part::DOUBLE PRECISION;
                EXCEPTION
                    WHEN OTHERS THEN
                        left_num_only := NULL;
                END;
                
                -- Calculate left minutes
                IF left_has_unit THEN
                    left_minutes := public.parse_time_part_to_minutes(left_part);
                ELSIF left_num_only IS NOT NULL AND right_mult > 0 THEN
                    -- Left is just a number, use the unit from right
                    left_minutes := (left_num_only * right_mult)::INTEGER;
                ELSE
                    left_minutes := public.parse_time_part_to_minutes(left_part);
                END IF;
                
                -- Calculate right minutes
                right_minutes := public.parse_time_part_to_minutes(right_part);
                
                -- Ensure min <= max
                IF left_minutes <= right_minutes THEN
                    seg_min := left_minutes;
                    seg_max := right_minutes;
                ELSE
                    seg_min := right_minutes;
                    seg_max := left_minutes;
                END IF;
            ELSE
                -- No units found, treat as single value
                seg_min := public.parse_time_part_to_minutes(seg);
                seg_max := seg_min;
            END IF;
        ELSE
            -- Single value (no hyphen)
            seg_min := public.parse_time_part_to_minutes(seg);
            seg_max := seg_min;
        END IF;
        
        seg_mins := array_append(seg_mins, seg_min);
        seg_maxs := array_append(seg_maxs, seg_max);
    END LOOP;
    
    -- Get overall min and max
    IF array_length(seg_mins, 1) = 0 THEN
        RETURN QUERY SELECT NULL::INTEGER, NULL::INTEGER, FALSE;
        RETURN;
    END IF;
    
    SELECT MIN(val) INTO overall_min FROM unnest(seg_mins) AS val;
    SELECT MAX(val) INTO overall_max FROM unnest(seg_maxs) AS val;
    
    -- Clean: if both are 0, return NULL
    IF overall_min = 0 AND overall_max = 0 THEN
        RETURN QUERY SELECT NULL::INTEGER, NULL::INTEGER, FALSE;
        RETURN;
    END IF;
    
    -- Determine if it's a range
    IF overall_min IS NOT NULL AND overall_max IS NOT NULL AND overall_min <> overall_max THEN
        RETURN QUERY SELECT overall_min, overall_max, TRUE;
    ELSE
        RETURN QUERY SELECT overall_min, overall_max, FALSE;
    END IF;
END;
$function$;

-- ============================================================================
-- FIX 2: update_walking_experiences_processed_updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_walking_experiences_processed_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$;

-- ============================================================================
-- FIX 3: get_unit_multiplier
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_unit_multiplier(text_with_unit text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
DECLARE
    t TEXT;
BEGIN
    IF text_with_unit IS NULL THEN
        RETURN 0;
    END IF;
    
    t := LOWER(text_with_unit);
    
    IF t ~ '\bday' THEN
        RETURN 1440;
    ELSIF t ~ '\bhr' THEN
        RETURN 60;
    ELSIF t ~ '\bmin' THEN
        RETURN 1;
    ELSE
        RETURN 0;
    END IF;
END;
$function$;

-- ============================================================================
-- FIX 4: parse_time_part_to_minutes
-- ============================================================================
CREATE OR REPLACE FUNCTION public.parse_time_part_to_minutes(part text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
DECLARE
    normalized TEXT;
    words TEXT[];
    i INTEGER;
    num_val DOUBLE PRECISION;
    unit TEXT;
    total_minutes INTEGER := 0;
    word_count INTEGER;
BEGIN
    IF part IS NULL OR TRIM(part) = '' THEN
        RETURN 0;
    END IF;

    -- Normalize: lowercase, trim, replace various dashes and non-breaking spaces
    normalized := LOWER(TRIM(part));
    normalized := regexp_replace(normalized, '[\u2013\u2014–—]', '-', 'g');
    normalized := regexp_replace(normalized, '\u00A0', ' ', 'g');
    
    -- Normalize units FIRST (before splitting)
    normalized := regexp_replace(normalized, '\bhours?\b', 'hr', 'gi');
    normalized := regexp_replace(normalized, '\bhrs\b', 'hr', 'gi');
    normalized := regexp_replace(normalized, '\bh\b', 'hr', 'gi');
    normalized := regexp_replace(normalized, '\bminutes?\b', 'min', 'gi');
    normalized := regexp_replace(normalized, '\bmins\b', 'min', 'gi');
    normalized := regexp_replace(normalized, '\bm\b', 'min', 'gi');
    normalized := regexp_replace(normalized, '\bdays?\b', 'day', 'gi');
    normalized := regexp_replace(normalized, '\bd\b', 'day', 'gi');
    
    -- Clean up multiple spaces
    normalized := regexp_replace(normalized, '\s+', ' ', 'g');
    normalized := TRIM(normalized);
    
    -- Split into words
    words := regexp_split_to_array(normalized, '\s+');
    word_count := array_length(words, 1);
    
    -- Parse number + unit pairs
    IF word_count >= 2 THEN
        FOR i IN 1..(word_count - 1) LOOP
            BEGIN
                num_val := words[i]::DOUBLE PRECISION;
                unit := words[i + 1];
                
                IF unit = 'day' THEN
                    total_minutes := total_minutes + (num_val * 1440)::INTEGER;
                ELSIF unit = 'hr' THEN
                    total_minutes := total_minutes + (num_val * 60)::INTEGER;
                ELSIF unit = 'min' THEN
                    total_minutes := total_minutes + num_val::INTEGER;
                END IF;
            EXCEPTION
                WHEN OTHERS THEN
                    -- Not a number, skip
                    NULL;
            END;
        END LOOP;
    ELSIF word_count = 1 THEN
        -- Single word - might be just a number or just a unit
        -- Try to parse as number
        BEGIN
            num_val := words[1]::DOUBLE PRECISION;
            -- If it's just a number with no unit, assume hours
            total_minutes := (num_val * 60)::INTEGER;
        EXCEPTION
            WHEN OTHERS THEN
                NULL;
        END;
    END IF;
    
    RETURN total_minutes;
END;
$function$;

-- ============================================================================
-- FIX 5: transform_walking_experiences
-- ============================================================================
CREATE OR REPLACE FUNCTION public.transform_walking_experiences()
 RETURNS TABLE(rows_processed bigint)
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
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
        public.is_kid_friendly(loc."Difficulty", loc."Description") AS kid_friendly,
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
    CROSS JOIN LATERAL public.parse_completion_time_range(loc."Completion time") AS time_range
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
$function$;

-- ============================================================================
-- FIX 6: update_nz_places_raw_geometry
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_nz_places_raw_geometry()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
BEGIN
  NEW.geometry = ST_SetSRID(ST_MakePoint(NEW.lon, NEW.lat), 4326);
  RETURN NEW;
END;
$function$;

-- ============================================================================
-- FIX 7: rebuild_nz_places_final
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rebuild_nz_places_final(p_country_code text DEFAULT 'NZ'::text)
 RETURNS TABLE(inserted_count bigint, updated_count bigint, deleted_count bigint)
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
DECLARE
  v_inserted BIGINT := 0;
  v_updated BIGINT := 0;
  v_deleted BIGINT := 0;
BEGIN
  -- Delete existing records for this country
  DELETE FROM public.nz_places_final WHERE country_code = p_country_code;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  
  -- Insert enriched places with spatial joins
  -- Use DISTINCT ON to handle duplicate dedupe_keys (keep first occurrence)
  WITH enriched_places AS (
    SELECT DISTINCT ON (
      p_country_code || ':' ||
      LOWER(TRIM(REGEXP_REPLACE(pr.name, '\s+', ' ', 'g'))) || ':' ||
      COALESCE(LOWER(TRIM(REGEXP_REPLACE(district.name, '\s+', ' ', 'g'))), '') || ':' ||
      COALESCE(LOWER(TRIM(REGEXP_REPLACE(region.name, '\s+', ' ', 'g'))), '')
    )
      pr.country_code,
      pr.osm_type,
      pr.osm_id,
      pr.place_type,
      pr.name,
      -- Normalize name: lowercase, trim, remove extra spaces
      LOWER(TRIM(REGEXP_REPLACE(pr.name, '\s+', ' ', 'g'))) AS name_norm,
      -- Search-friendly name: strip macrons, lowercase, trim, remove extra spaces
      LOWER(TRIM(REGEXP_REPLACE(
        public.remove_macrons(pr.name), 
        '\s+', ' ', 'g'
      ))) AS name_search,
      -- Build display_name: name + district + region
      CASE
        WHEN district.name IS NOT NULL AND region.name IS NOT NULL THEN
          pr.name || ', ' || district.name || ', ' || region.name
        WHEN district.name IS NOT NULL THEN
          pr.name || ', ' || district.name
        WHEN region.name IS NOT NULL THEN
          pr.name || ', ' || region.name
        ELSE
          pr.name
      END AS display_name,
      -- Build dedupe_key: country:name_norm:district:region
      p_country_code || ':' ||
      LOWER(TRIM(REGEXP_REPLACE(pr.name, '\s+', ' ', 'g'))) || ':' ||
      COALESCE(LOWER(TRIM(REGEXP_REPLACE(district.name, '\s+', ' ', 'g'))), '') || ':' ||
      COALESCE(LOWER(TRIM(REGEXP_REPLACE(region.name, '\s+', ' ', 'g'))), '') AS dedupe_key,
      pr.name_variants,
      pr.lat,
      pr.lon,
      pr.geometry,
      district.name AS district_name,
      district.osm_id AS district_osm_id,
      region.name AS region_name,
      region.osm_id AS region_osm_id,
      pr.tags
    FROM public.nz_places_raw pr
    LEFT JOIN LATERAL (
      SELECT name, osm_id
      FROM public.nz_admin_areas
      WHERE admin_level = '6'
        AND country_code = pr.country_code
        AND ST_Within(pr.geometry, geometry)
      ORDER BY ST_Area(geometry) ASC -- Prefer smaller (more specific) districts
      LIMIT 1
    ) district ON true
    LEFT JOIN LATERAL (
      SELECT name, osm_id
      FROM public.nz_admin_areas
      WHERE admin_level = '4'
        AND country_code = pr.country_code
        AND ST_Within(pr.geometry, geometry)
      ORDER BY ST_Area(geometry) ASC -- Prefer smaller (more specific) regions
      LIMIT 1
    ) region ON true
    WHERE pr.country_code = p_country_code
    -- Order by: prefer places with admin area info, then by osm_id for consistency
    ORDER BY 
      p_country_code || ':' ||
      LOWER(TRIM(REGEXP_REPLACE(pr.name, '\s+', ' ', 'g'))) || ':' ||
      COALESCE(LOWER(TRIM(REGEXP_REPLACE(district.name, '\s+', ' ', 'g'))), '') || ':' ||
      COALESCE(LOWER(TRIM(REGEXP_REPLACE(region.name, '\s+', ' ', 'g'))), ''),
      CASE WHEN district.name IS NOT NULL OR region.name IS NOT NULL THEN 0 ELSE 1 END,
      pr.osm_id
  )
  INSERT INTO public.nz_places_final (
    country_code,
    osm_type,
    osm_id,
    place_type,
    name,
    name_norm,
    name_search,
    display_name,
    dedupe_key,
    name_variants,
    lat,
    lon,
    geometry,
    district_name,
    district_osm_id,
    region_name,
    region_osm_id,
    tags
  )
  SELECT
    country_code,
    osm_type,
    osm_id,
    place_type,
    name,
    name_norm,
    name_search,
    display_name,
    dedupe_key,
    name_variants,
    lat,
    lon,
    geometry,
    district_name,
    district_osm_id,
    region_name,
    region_osm_id,
    tags
  FROM enriched_places
  ON CONFLICT (country_code, osm_type, osm_id) DO UPDATE SET
    place_type = EXCLUDED.place_type,
    name = EXCLUDED.name,
    name_norm = EXCLUDED.name_norm,
    name_search = EXCLUDED.name_search,
    display_name = EXCLUDED.display_name,
    dedupe_key = EXCLUDED.dedupe_key,
    name_variants = EXCLUDED.name_variants,
    lat = EXCLUDED.lat,
    lon = EXCLUDED.lon,
    geometry = EXCLUDED.geometry,
    district_name = EXCLUDED.district_name,
    district_osm_id = EXCLUDED.district_osm_id,
    region_name = EXCLUDED.region_name,
    region_osm_id = EXCLUDED.region_osm_id,
    tags = EXCLUDED.tags,
    updated_at = NOW();
  
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  
  RETURN QUERY SELECT v_inserted, v_updated, v_deleted;
END;
$function$;

-- ============================================================================
-- FIX 8: parse_completion_time_to_minutes
-- ============================================================================
CREATE OR REPLACE FUNCTION public.parse_completion_time_to_minutes(time_str text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
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
$function$;

-- ============================================================================
-- FIX 9: is_kid_friendly
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_kid_friendly(difficulty text, description text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
DECLARE
    difficulty_lower TEXT;
    description_lower TEXT;
    is_easy BOOLEAN;
    has_kid_phrase BOOLEAN;
BEGIN
    IF difficulty IS NULL OR description IS NULL THEN
        RETURN FALSE;
    END IF;

    difficulty_lower := LOWER(difficulty);
    description_lower := LOWER(description);

    -- Check difficulty
    is_easy := difficulty_lower LIKE '%easy%' OR difficulty_lower LIKE '%easiest%';

    -- Check description for kid-friendly phrases
    has_kid_phrase := 
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
       description_lower LIKE '%perfect for kids%' OR
       description_lower LIKE '%great day walk for families%' OR
       description_lower LIKE '%great day walk for families with kids%';

    -- Kid-friendly logic:
    -- Must have explicit kid-friendly wording in description
    -- Just being "Easy" is not enough (could be too long for kids)
    -- So we require the description to explicitly mention it's kid/family friendly
    IF has_kid_phrase THEN
        RETURN TRUE;
    END IF;

    -- If it's Easy/Easiest but no explicit kid-friendly wording, it's NOT kid-friendly
    -- (because it might be too long or otherwise not suitable)
    RETURN FALSE;
END;
$function$;

-- ============================================================================
-- FIX 10: set_updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

-- ============================================================================
-- FIX 11: extract_time_portion
-- ============================================================================
CREATE OR REPLACE FUNCTION public.extract_time_portion(text_with_time text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
DECLARE
    cleaned TEXT;
    time_match TEXT;
BEGIN
    IF text_with_time IS NULL THEN
        RETURN NULL;
    END IF;
    
    -- Remove common prefixes that might interfere
    cleaned := regexp_replace(text_with_time, '^(various\s+from|from|up\s+to|about|approximately|around)\s+', '', 'gi');
    
    -- Try to extract time patterns: number-unit or number - number unit
    -- Match patterns like: "2-3 days", "3 - 4 hr", "2 days", "2 - 3 hours", etc.
    time_match := (SELECT (regexp_matches(cleaned, '(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)\s*(day|days|hr|hrs|hours?|min|mins|minutes?)', 'i'))[0]);
    
    IF time_match IS NOT NULL THEN
        RETURN time_match;
    END IF;
    
    -- Try single value with unit
    time_match := (SELECT (regexp_matches(cleaned, '(\d+(?:\.\d+)?)\s*(day|days|hr|hrs|hours?|min|mins|minutes?)', 'i'))[0]);
    
    IF time_match IS NOT NULL THEN
        RETURN time_match;
    END IF;
    
    -- Try range without unit on first number: "2 - 3 hr"
    time_match := (SELECT (regexp_matches(cleaned, '(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)\s*(day|days|hr|hrs|hours?|min|mins|minutes?)', 'i'))[0]);
    
    IF time_match IS NOT NULL THEN
        RETURN time_match;
    END IF;
    
    -- Return original if no pattern found
    RETURN cleaned;
END;
$function$;
