-- ============================================================================
-- FIX TIME PARSING EDGE CASES
-- ============================================================================
-- This migration fixes specific edge cases in time parsing:
-- 1. "days" and "hrs" not being recognized
-- 2. Unicode dashes not being normalized
-- 3. Extra text ("one way", "return", "Various from") interfering
-- 4. Ranges not being detected properly

-- Improved helper function to extract time portion from text with extra words
CREATE OR REPLACE FUNCTION extract_time_portion(text_with_time TEXT)
RETURNS TEXT AS $$
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
$$ LANGUAGE plpgsql;

-- Completely rewritten parse_completion_time_range with better edge case handling
CREATE OR REPLACE FUNCTION parse_completion_time_range(time_str TEXT)
RETURNS TABLE(min_minutes INTEGER, max_minutes INTEGER, is_range BOOLEAN) AS $$
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
    extracted_time := extract_time_portion(time_str);
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
                right_mult := get_unit_multiplier(right_part);
                
                -- Try to parse left part as number only
                BEGIN
                    left_num_only := left_part::DOUBLE PRECISION;
                EXCEPTION
                    WHEN OTHERS THEN
                        left_num_only := NULL;
                END;
                
                -- Calculate left minutes
                IF left_has_unit THEN
                    left_minutes := parse_time_part_to_minutes(left_part);
                ELSIF left_num_only IS NOT NULL AND right_mult > 0 THEN
                    -- Left is just a number, use the unit from right
                    left_minutes := (left_num_only * right_mult)::INTEGER;
                ELSE
                    left_minutes := parse_time_part_to_minutes(left_part);
                END IF;
                
                -- Calculate right minutes
                right_minutes := parse_time_part_to_minutes(right_part);
                
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
                seg_min := parse_time_part_to_minutes(seg);
                seg_max := seg_min;
            END IF;
        ELSE
            -- Single value (no hyphen)
            seg_min := parse_time_part_to_minutes(seg);
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
$$ LANGUAGE plpgsql;

-- Also update parse_time_part_to_minutes to handle "day", "hr", "min" after normalization
CREATE OR REPLACE FUNCTION parse_time_part_to_minutes(part TEXT)
RETURNS INTEGER AS $$
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
$$ LANGUAGE plpgsql;
