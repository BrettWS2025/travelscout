-- ============================================================================
-- FIX TRANSFORMATION FUNCTION - Remove unsupported 'g' flag from regexp_split_to_array
-- ============================================================================
-- This migration fixes the parse_completion_time_range function to remove
-- the unsupported 'g' flag from regexp_split_to_array calls.

-- Helper function to parse completion time range (FIXED VERSION)
CREATE OR REPLACE FUNCTION parse_completion_time_range(time_str TEXT)
RETURNS TABLE(min_minutes INTEGER, max_minutes INTEGER, is_range BOOLEAN) AS $$
DECLARE
    parts TEXT[];
    min_str TEXT;
    max_str TEXT;
    min_mins INTEGER;
    max_mins INTEGER;
    numbers TEXT[];
    normalized_str TEXT;
BEGIN
    IF time_str IS NULL OR TRIM(time_str) = '' THEN
        RETURN QUERY SELECT NULL::INTEGER, NULL::INTEGER, FALSE;
        RETURN;
    END IF;

    -- Normalize dashes (replace Unicode dashes with ASCII dash)
    normalized_str := regexp_replace(time_str, '[\u2013\u2014–—]+', '-', 'g');
    
    -- Check if it's a range (contains "-")
    IF normalized_str ~ '-' THEN
        -- Split on "-" (regexp_split_to_array always splits on all occurrences, no 'g' flag needed)
        parts := regexp_split_to_array(normalized_str, '-');
        
        IF array_length(parts, 1) >= 2 THEN
            min_str := TRIM(parts[1]);
            max_str := TRIM(parts[2]);
            
            -- Handle cases like "2-3 hr" where unit is only on second part
            IF min_str !~ '(?i)(hr|min|day)' AND max_str ~ '(?i)(hr|min|day)' THEN
                -- Extract number from min_str and append unit from max_str
                min_str := (SELECT (regexp_matches(min_str, '(\d+(?:\.\d+)?)', 'i'))[1]) || ' ' || 
                          (SELECT (regexp_matches(max_str, '(?i)(hr|hrs|min|mins|day|days)', 'i'))[1]);
            END IF;
            
            min_mins := parse_completion_time_to_minutes(min_str);
            max_mins := parse_completion_time_to_minutes(max_str);
            
            -- If parsing failed, try to extract numbers directly
            IF (min_mins IS NULL OR min_mins = 0) AND (max_mins IS NULL OR max_mins = 0) THEN
                SELECT array_agg(matches[1]) INTO numbers
                FROM regexp_matches(normalized_str, '(\d+(?:\.\d+)?)', 'g') AS matches;
                IF numbers IS NOT NULL AND array_length(numbers, 1) >= 2 THEN
                    IF normalized_str ~* 'hr' THEN
                        min_mins := (numbers[1]::DOUBLE PRECISION * 60)::INTEGER;
                        max_mins := (numbers[2]::DOUBLE PRECISION * 60)::INTEGER;
                    ELSIF normalized_str ~* 'min' THEN
                        min_mins := numbers[1]::INTEGER;
                        max_mins := numbers[2]::INTEGER;
                    ELSE
                        -- Default to hours if no unit specified
                        min_mins := (numbers[1]::DOUBLE PRECISION * 60)::INTEGER;
                        max_mins := (numbers[2]::DOUBLE PRECISION * 60)::INTEGER;
                    END IF;
                END IF;
            END IF;
            
            RETURN QUERY SELECT min_mins, max_mins, TRUE;
            RETURN;
        END IF;
    END IF;
    
    -- Single value
    min_mins := parse_completion_time_to_minutes(normalized_str);
    RETURN QUERY SELECT min_mins, min_mins, FALSE;
END;
$$ LANGUAGE plpgsql;
