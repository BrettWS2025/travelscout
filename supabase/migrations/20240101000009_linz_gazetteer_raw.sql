-- ============================================================================
-- STEP 1: LINZ GAZETTEER RAW STAGING TABLE
-- ============================================================================
-- Purpose: Hold LINZ data exactly as provided
-- - Never edit rows manually
-- - Safe to truncate/reload
-- - Raw staging, untouched

CREATE TABLE IF NOT EXISTS linz_gazetteer_raw (
  name_id TEXT,
  name TEXT,
  status TEXT,
  feat_id TEXT,
  feat_type TEXT,
  nzgb_ref TEXT,
  nzgb_sub_ref TEXT,
  land_district TEXT,
  crd_projection TEXT,
  crd_north TEXT,
  crd_east TEXT,
  crd_datum TEXT,
  crd_latitude TEXT,
  crd_longitude TEXT,
  info_ref TEXT,
  info_origin TEXT,
  info_description TEXT,
  info_note TEXT,
  feat_note TEXT,
  maori_name TEXT,
  label_hierarchy TEXT,
  cpa_legislation TEXT,
  conservancy TEXT,
  doc_cons_unit_no TEXT,
  doc_gaz_ref TEXT,
  doc_gaz_sub_ref TEXT,
  treaty_legislation TEXT,
  geom_type TEXT,
  accuracy TEXT,
  gebco TEXT,
  region TEXT,
  scufn TEXT,
  height TEXT,
  ant_pn_ref TEXT,
  ant_pgaz_ref TEXT,
  scar_id TEXT,
  scar_rec_by TEXT,
  accuracy_rating TEXT,
  desc_code TEXT,
  rev_gaz_ref TEXT,
  rev_gaz_sub_ref TEXT,
  rev_treaty_legislation TEXT,
  loaded_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Index on name_id for lookups
CREATE INDEX IF NOT EXISTS idx_linz_gazetteer_raw_name_id ON linz_gazetteer_raw(name_id);

-- Index on feat_id for lookups
CREATE INDEX IF NOT EXISTS idx_linz_gazetteer_raw_feat_id ON linz_gazetteer_raw(feat_id);

-- Index on feat_type for filtering
CREATE INDEX IF NOT EXISTS idx_linz_gazetteer_raw_feat_type ON linz_gazetteer_raw(feat_type);

-- Index on status for filtering
CREATE INDEX IF NOT EXISTS idx_linz_gazetteer_raw_status ON linz_gazetteer_raw(status);

-- Index on region for filtering
CREATE INDEX IF NOT EXISTS idx_linz_gazetteer_raw_region ON linz_gazetteer_raw(region);

-- Index on geom_type to filter POINT features
CREATE INDEX IF NOT EXISTS idx_linz_gazetteer_raw_geom_type ON linz_gazetteer_raw(geom_type);

-- Note: No RLS on staging table - this is for internal data processing only
-- Access should be restricted via service role
