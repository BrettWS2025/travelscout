-- ============================================================================
-- STEP 3: FEATURE TYPE MAPPING TABLE
-- ============================================================================
-- Purpose: Reduce LINZ's feature taxonomy to something usable
-- Maps LINZ feat_type values to internal categories

CREATE TABLE IF NOT EXISTS feature_type_map (
  linz_feat_type TEXT PRIMARY KEY,  -- LINZ feature type (e.g., 'Suburb', 'Town')
  internal_category TEXT NOT NULL,   -- Internal category (e.g., 'locality', 'settlement')
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create index on internal_category for lookups
CREATE INDEX IF NOT EXISTS idx_feature_type_map_category ON feature_type_map(internal_category);

-- ============================================================================
-- POPULATE INITIAL MAPPINGS
-- ============================================================================
-- Populate with top feature types first
-- Anything unmapped stays "other"

INSERT INTO feature_type_map (linz_feat_type, internal_category) VALUES
  ('Suburb', 'locality'),
  ('Locality', 'locality'),
  ('Town', 'settlement'),
  ('City', 'settlement'),
  ('Bay', 'water'),
  ('River', 'water'),
  ('Stream', 'water'),
  ('Lake', 'water'),
  ('Mountain', 'landform'),
  ('Hill', 'landform'),
  ('Peak', 'landform'),
  ('Valley', 'landform'),
  ('Beach', 'coast'),
  ('Cape', 'coast'),
  ('Point', 'coast'),
  ('Island', 'landform'),
  ('Peninsula', 'landform'),
  ('Forest', 'landform'),
  ('Park', 'landform'),
  ('Reserve', 'landform'),
  ('Place', 'locality'),
  ('Area', 'locality'),
  ('District', 'locality'),
  ('Region', 'locality')
ON CONFLICT (linz_feat_type) DO NOTHING;

-- ============================================================================
-- UPDATE PLACES WITH MAPPED CATEGORIES
-- ============================================================================
-- Function to update places.category based on feature_type_map
CREATE OR REPLACE FUNCTION update_places_categories()
RETURNS INTEGER AS $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  UPDATE places p
  SET category = COALESCE(ftm.internal_category, 'other')
  FROM linz_gazetteer_raw lgr
  LEFT JOIN feature_type_map ftm ON ftm.linz_feat_type = lgr.feat_type
  WHERE p.source_id = lgr.name_id
    AND p.category IS DISTINCT FROM COALESCE(ftm.internal_category, 'other');  -- Update if changed

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql;

-- Note: This function should be called after populate_places_from_linz():
-- SELECT update_places_categories();
