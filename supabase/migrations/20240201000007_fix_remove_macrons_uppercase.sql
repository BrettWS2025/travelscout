-- ============================================================================
-- FIX remove_macrons FUNCTION TO HANDLE UPPERCASE MACRONS
-- ============================================================================
-- Purpose: The remove_macrons function only handled lowercase macrons (ā, ē, ī, ō, ū)
-- but not uppercase macrons (Ā, Ē, Ī, Ō, Ū). This caused names starting with
-- uppercase macrons (like "Ōtorohanga") to not have their macrons stripped in
-- the name_search field, making them unsearchable when users type without macrons.
--
-- This migration:
-- 1. Updates remove_macrons to handle both uppercase and lowercase macrons
-- 2. Recalculates name_search for all rows in nz_places_final

-- ============================================================================
-- UPDATE remove_macrons FUNCTION
-- ============================================================================
CREATE OR REPLACE FUNCTION remove_macrons(input_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
BEGIN
  RETURN REPLACE(
    REPLACE(
      REPLACE(
        REPLACE(
          REPLACE(
            REPLACE(
              REPLACE(
                REPLACE(
                  REPLACE(
                    REPLACE(input_name, 'ā', 'a'),
                    'Ā', 'A'
                  ),
                  'ē', 'e'
                ),
                'Ē', 'E'
              ),
              'ī', 'i'
            ),
            'Ī', 'I'
          ),
          'ō', 'o'
        ),
        'Ō', 'O'
      ),
      'ū', 'u'
    ),
    'Ū', 'U'
  );
END;
$$;

-- ============================================================================
-- RECALCULATE name_search FOR ALL ROWS
-- ============================================================================
-- Recalculate name_search using the fixed remove_macrons function
UPDATE nz_places_final
SET name_search = LOWER(TRIM(REGEXP_REPLACE(
  public.remove_macrons(name), 
  '\s+', ' ', 'g'
)))
WHERE name_search IS NULL 
   OR name_search != LOWER(TRIM(REGEXP_REPLACE(
     public.remove_macrons(name), 
     '\s+', ' ', 'g'
   )));
