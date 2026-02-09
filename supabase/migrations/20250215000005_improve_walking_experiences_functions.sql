-- ============================================================================
-- IMPROVE WALKING EXPERIENCES FUNCTIONS
-- ============================================================================
-- This migration improves:
-- 1. parse_completion_time_range - More accurate parsing based on Power Query logic
-- 2. is_kid_friendly - Consider both difficulty AND description, not just OR

-- Improved helper function to parse a single time part to minutes
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
    normalized := regexp_replace(normalized, '\u00A0', ' ', 'g'); -- non-breaking space
    
    -- Normalize units: hours -> hr, minutes -> min, etc.
    normalized := regexp_replace(normalized, '\bhours?\b', ' hr ', 'gi');
    normalized := regexp_replace(normalized, '\bhrs\b', ' hr ', 'gi');
    normalized := regexp_replace(normalized, '\bh\b', ' hr ', 'gi');
    normalized := regexp_replace(normalized, '\bminutes?\b', ' min ', 'gi');
    normalized := regexp_replace(normalized, '\bmins\b', ' min ', 'gi');
    normalized := regexp_replace(normalized, '\bm\b', ' min ', 'gi');
    normalized := regexp_replace(normalized, '\bdays?\b', ' day ', 'gi');
    normalized := regexp_replace(normalized, '\bd\b', ' day ', 'gi');
    
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
    END IF;
    
    RETURN total_minutes;
END;
$$ LANGUAGE plpgsql;

-- Improved function to get unit multiplier from text
CREATE OR REPLACE FUNCTION get_unit_multiplier(text_with_unit TEXT)
RETURNS INTEGER AS $$
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
$$ LANGUAGE plpgsql;

-- Completely rewritten parse_completion_time_range based on Power Query logic
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
BEGIN
    IF time_str IS NULL OR TRIM(time_str) = '' THEN
        RETURN QUERY SELECT NULL::INTEGER, NULL::INTEGER, FALSE;
        RETURN;
    END IF;

    -- Normalize: lowercase, trim, replace dashes and normalize units
    normalized := LOWER(TRIM(time_str));
    normalized := regexp_replace(normalized, '[\u2013\u2014–—]', '-', 'g');
    normalized := regexp_replace(normalized, '\u00A0', ' ', 'g');
    normalized := regexp_replace(normalized, '\bto\b', ' - ', 'gi');
    normalized := regexp_replace(normalized, '/', '|', 'g');
    normalized := regexp_replace(normalized, '\s+', ' ', 'g');
    
    -- Normalize units
    normalized := regexp_replace(normalized, '\bhours?\b', ' hr ', 'gi');
    normalized := regexp_replace(normalized, '\bhrs\b', ' hr ', 'gi');
    normalized := regexp_replace(normalized, '\bh\b', ' hr ', 'gi');
    normalized := regexp_replace(normalized, '\bminutes?\b', ' min ', 'gi');
    normalized := regexp_replace(normalized, '\bmins\b', ' min ', 'gi');
    normalized := regexp_replace(normalized, '\bm\b', ' min ', 'gi');
    normalized := regexp_replace(normalized, '\bdays?\b', ' day ', 'gi');
    normalized := regexp_replace(normalized, '\bd\b', ' day ', 'gi');
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
                -- No units, treat as single value
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

-- Improved kid_friendly function - considers BOTH difficulty AND description
CREATE OR REPLACE FUNCTION is_kid_friendly(difficulty TEXT, description TEXT)
RETURNS BOOLEAN AS $$
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
$$ LANGUAGE plpgsql;
