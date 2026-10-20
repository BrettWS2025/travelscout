-- ============================================================================
-- Deals platform Chunk 5: DealMedia
-- ============================================================================
-- Child table of marketplace.operator_deals (inventory Deal — not the legacy
-- marketplace.deals feed). Max 12 images per deal; at most one is_cover
-- (enforced here). Exactly-one-cover-once-images-exist and cover promotion on
-- delete are enforced in web/lib/marketplace/deal-media.ts.
-- video_embed URLs must be YouTube or Vimeo (app + CHECK).
-- Enum string values match web/lib/marketplace/enums.ts.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- deal_media
-- ---------------------------------------------------------------------------
CREATE TABLE marketplace.deal_media (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_id UUID NOT NULL
    REFERENCES marketplace.operator_deals(id) ON DELETE CASCADE,

  media_type TEXT NOT NULL
    CHECK (media_type IN ('image', 'video_embed')),
  source TEXT NOT NULL
    CHECK (source IN ('upload', 'provider')),

  storage_key TEXT,
  url TEXT NOT NULL,

  is_cover BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,

  alt_text TEXT NOT NULL
    CHECK (char_length(alt_text) >= 5 AND char_length(alt_text) <= 150),
  caption TEXT
    CHECK (caption IS NULL OR char_length(caption) <= 150),

  width INTEGER
    CHECK (width IS NULL OR width > 0),
  height INTEGER
    CHECK (height IS NULL OR height > 0),
  focal_x NUMERIC
    CHECK (focal_x IS NULL OR (focal_x >= 0 AND focal_x <= 1)),
  focal_y NUMERIC
    CHECK (focal_y IS NULL OR (focal_y >= 0 AND focal_y <= 1)),
  file_size_bytes BIGINT
    CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Cover only allowed on images (not video embeds)
  CONSTRAINT deal_media_cover_image_only
    CHECK (is_cover = false OR media_type = 'image'),

  -- video_embed: YouTube or Vimeo host only
  CONSTRAINT deal_media_video_embed_url
    CHECK (
      media_type <> 'video_embed'
      OR (
        url ~* '^https?://([a-z0-9-]+\.)*(youtube\.com|youtu\.be|vimeo\.com|player\.vimeo\.com)(/|$|\?)'
      )
    )
);

-- At most one cover image per deal
CREATE UNIQUE INDEX idx_marketplace_deal_media_one_cover
  ON marketplace.deal_media (deal_id)
  WHERE is_cover = true;

CREATE INDEX idx_marketplace_deal_media_deal_sort
  ON marketplace.deal_media (deal_id, sort_order);

CREATE TRIGGER update_marketplace_deal_media_updated_at
  BEFORE UPDATE ON marketplace.deal_media
  FOR EACH ROW
  EXECUTE FUNCTION marketplace.update_updated_at_column();

-- Max 12 images per deal (video_embed rows do not count)
CREATE OR REPLACE FUNCTION marketplace.enforce_deal_media_image_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = marketplace, public
AS $$
DECLARE
  image_count INTEGER;
BEGIN
  IF NEW.media_type <> 'image' THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)::INTEGER INTO image_count
  FROM marketplace.deal_media
  WHERE deal_id = NEW.deal_id
    AND media_type = 'image'
    AND (TG_OP = 'INSERT' OR id <> NEW.id);

  IF image_count >= 12 THEN
    RAISE EXCEPTION 'deal may have at most 12 images'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER marketplace_deal_media_image_limit
  BEFORE INSERT OR UPDATE OF media_type, deal_id ON marketplace.deal_media
  FOR EACH ROW
  EXECUTE FUNCTION marketplace.enforce_deal_media_image_limit();

-- ---------------------------------------------------------------------------
-- Row Level Security (via parent operator_deals.operator_id)
-- ---------------------------------------------------------------------------
ALTER TABLE marketplace.deal_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view deal media"
  ON marketplace.deal_media FOR SELECT
  USING (
    marketplace.is_operator_member(
      marketplace.operator_id_for_deal(deal_id)
    )
  );

CREATE POLICY "Public can view media for live deals"
  ON marketplace.deal_media FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM marketplace.operator_deals d
      WHERE d.id = deal_id AND d.status = 'live'
    )
  );

CREATE POLICY "Owners and managers can insert deal media"
  ON marketplace.deal_media FOR INSERT
  WITH CHECK (
    marketplace.is_operator_owner_or_manager(
      marketplace.operator_id_for_deal(deal_id)
    )
  );

CREATE POLICY "Owners and managers can update deal media"
  ON marketplace.deal_media FOR UPDATE
  USING (
    marketplace.is_operator_owner_or_manager(
      marketplace.operator_id_for_deal(deal_id)
    )
  );

CREATE POLICY "Owners and managers can delete deal media"
  ON marketplace.deal_media FOR DELETE
  USING (
    marketplace.is_operator_owner_or_manager(
      marketplace.operator_id_for_deal(deal_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
GRANT SELECT ON marketplace.deal_media TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON marketplace.deal_media
  TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION marketplace.enforce_deal_media_image_limit()
  TO authenticated, service_role;
