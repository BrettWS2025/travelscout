-- ============================================================================
-- STEP 6: PLACE_NAMES TABLE FOR SEARCH
-- ============================================================================
-- Purpose: Search should never depend on raw display names
-- Stores multiple name variants for each place

CREATE TABLE IF NOT EXISTS place_names (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  place_id TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                    -- The actual name variant
  name_type TEXT NOT NULL,               -- 'official', 'normalized', 'macronless', 'maori'
  is_primary BOOLEAN DEFAULT false,      -- Primary name for display
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(place_id, name, name_type)      -- Prevent duplicate name variants
);

-- Create index on place_id for lookups
CREATE INDEX IF NOT EXISTS idx_place_names_place_id ON place_names(place_id);

-- Create index on name for search (case-insensitive)
CREATE INDEX IF NOT EXISTS idx_place_names_name ON place_names(LOWER(name));

-- Create GIN index for full-text search
CREATE INDEX IF NOT EXISTS idx_place_names_name_search ON place_names USING GIN(to_tsvector('english', name));

-- Create index on name_type for filtering
CREATE INDEX IF NOT EXISTS idx_place_names_name_type ON place_names(name_type);

-- Create index on is_primary for quick primary name lookups
CREATE INDEX IF NOT EXISTS idx_place_names_is_primary ON place_names(is_primary) WHERE is_primary = true;

-- Enable RLS (same as places - public read)
ALTER TABLE place_names ENABLE ROW LEVEL SECURITY;

-- Policy: Allow public read access to place_names
CREATE POLICY "Public can view place_names"
  ON place_names FOR SELECT
  USING (true);

-- ============================================================================
-- HELPER FUNCTION: Normalize name (remove diacritics, lowercase)
-- ============================================================================
CREATE OR REPLACE FUNCTION normalize_name(input_name TEXT)
RETURNS TEXT AS $$
BEGIN
  -- Convert to lowercase
  -- Remove common diacritics (simplified - for full support, use unaccent extension)
  RETURN LOWER(
    REPLACE(
      REPLACE(
        REPLACE(
          REPLACE(
            REPLACE(input_name, 'ā', 'a'),
            'ē', 'e'
          ),
          'ī', 'i'
        ),
        'ō', 'o'
      ),
      'ū', 'u'
    )
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- HELPER FUNCTION: Remove macrons (NZ-important)
-- ============================================================================
CREATE OR REPLACE FUNCTION remove_macrons(input_name TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN REPLACE(
    REPLACE(
      REPLACE(
        REPLACE(
          REPLACE(input_name, 'ā', 'a'),
          'ē', 'e'
        ),
        'ī', 'i'
      ),
      'ō', 'o'
    ),
    'ū', 'u'
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- FUNCTION: Populate place_names from places
-- ============================================================================
CREATE OR REPLACE FUNCTION populate_place_names()
RETURNS TABLE (
  inserted_count BIGINT
) AS $$
DECLARE
  v_inserted BIGINT := 0;
  v_before_count BIGINT;
BEGIN
  -- Count before
  SELECT COUNT(*) INTO v_before_count FROM place_names;

  -- Insert official names (primary)
  INSERT INTO place_names (place_id, name, name_type, is_primary)
  SELECT 
    id,
    name,
    'official',
    true
  FROM places
  WHERE name IS NOT NULL
    AND name != ''
  ON CONFLICT (place_id, name, name_type) DO NOTHING;

  -- Insert normalized names (for search)
  INSERT INTO place_names (place_id, name, name_type, is_primary)
  SELECT 
    id,
    normalize_name(name),
    'normalized',
    false
  FROM places
  WHERE name IS NOT NULL
    AND name != ''
    AND normalize_name(name) != LOWER(name)  -- Only if different
  ON CONFLICT (place_id, name, name_type) DO NOTHING;

  -- Insert macronless names (NZ-important)
  INSERT INTO place_names (place_id, name, name_type, is_primary)
  SELECT 
    id,
    remove_macrons(name),
    'macronless',
    false
  FROM places
  WHERE name IS NOT NULL
    AND name != ''
    AND remove_macrons(name) != name  -- Only if different
  ON CONFLICT (place_id, name, name_type) DO NOTHING;

  -- Insert Māori names if available
  INSERT INTO place_names (place_id, name, name_type, is_primary)
  SELECT 
    id,
    maori_name,
    'maori',
    false
  FROM places
  WHERE maori_name IS NOT NULL
    AND maori_name != ''
  ON CONFLICT (place_id, name, name_type) DO NOTHING;

  -- Count inserted
  SELECT COUNT(*) - v_before_count INTO v_inserted FROM place_names;
  RETURN QUERY SELECT v_inserted;
END;
$$ LANGUAGE plpgsql;

-- Note: This function should be called after places are populated:
-- SELECT * FROM populate_place_names();
