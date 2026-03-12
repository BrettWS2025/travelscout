-- ============================================================================
-- VIATOR_TAGS TABLE
-- ============================================================================
-- Stores all tags from Viator API for filtering products
-- Updated weekly via scheduled workflow
CREATE TABLE IF NOT EXISTS viator_tags (
  tag_id INTEGER PRIMARY KEY,
  tag_name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  group_name TEXT,
  metadata JSONB DEFAULT '{}',
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for viator_tags
CREATE INDEX idx_viator_tags_name ON viator_tags(tag_name);
CREATE INDEX idx_viator_tags_category ON viator_tags(category) WHERE category IS NOT NULL;
CREATE INDEX idx_viator_tags_group ON viator_tags(group_name) WHERE group_name IS NOT NULL;
CREATE INDEX idx_viator_tags_last_synced ON viator_tags(last_synced_at DESC);

-- Full text search index for tag names
CREATE INDEX idx_viator_tags_name_search ON viator_tags USING GIN(to_tsvector('english', tag_name));

-- Enable RLS (tags are public for reading, writes via service role only)
ALTER TABLE viator_tags ENABLE ROW LEVEL SECURITY;

-- Policies for viator_tags (read-only for authenticated users, writes via service role only)
CREATE POLICY "Authenticated users can view viator tags"
  ON viator_tags FOR SELECT
  USING (auth.role() = 'authenticated');

-- Trigger for viator_tags updated_at
CREATE TRIGGER update_viator_tags_updated_at
  BEFORE UPDATE ON viator_tags
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to upsert tags (used by sync script)
CREATE OR REPLACE FUNCTION upsert_viator_tags(
  p_tag_id INTEGER,
  p_tag_name TEXT,
  p_description TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_group_name TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS void AS $$
BEGIN
  INSERT INTO viator_tags (
    tag_id,
    tag_name,
    description,
    category,
    group_name,
    metadata,
    last_synced_at
  )
  VALUES (
    p_tag_id,
    p_tag_name,
    p_description,
    p_category,
    p_group_name,
    p_metadata,
    NOW()
  )
  ON CONFLICT (tag_id) DO UPDATE SET
    tag_name = EXCLUDED.tag_name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    group_name = EXCLUDED.group_name,
    metadata = EXCLUDED.metadata,
    last_synced_at = NOW(),
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
