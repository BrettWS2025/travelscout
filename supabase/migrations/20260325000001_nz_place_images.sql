-- ============================================================================
-- NZ_PLACE_IMAGES TABLE
-- ============================================================================
-- Stores per-place images for rows in nz_places_final without modifying that
-- table (so nz_places_final can be rebuilt safely).
--
-- Note: This implementation stores `image_url` directly.
-- Best practice is usually to store a Supabase Storage object path instead,
-- then derive a public URL, but direct URLs are simplest to wire up.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.nz_place_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  place_id UUID NOT NULL REFERENCES public.nz_places_final(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  alt_text TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nz_place_images_place_id ON public.nz_place_images(place_id);
CREATE INDEX IF NOT EXISTS idx_nz_place_images_is_primary ON public.nz_place_images(is_primary) WHERE is_primary;
CREATE INDEX IF NOT EXISTS idx_nz_place_images_sort_order ON public.nz_place_images(place_id, sort_order);

-- Enforce at most one primary image per place.
CREATE UNIQUE INDEX IF NOT EXISTS nz_place_images_primary_unique
  ON public.nz_place_images(place_id)
  WHERE is_primary = TRUE;

-- updated_at trigger (same helper used elsewhere in this repo)
CREATE TRIGGER nz_place_images_updated_at
  BEFORE UPDATE ON public.nz_place_images
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.nz_place_images ENABLE ROW LEVEL SECURITY;

-- Public can read images (needed for the trip planner UI)
CREATE POLICY "Public can view nz_place_images"
  ON public.nz_place_images
  FOR SELECT
  USING (true);

-- Only authenticated users can write (and only to their own rows)
CREATE POLICY "Authenticated can insert own nz_place_images"
  ON public.nz_place_images
  FOR INSERT
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Authenticated can update own nz_place_images"
  ON public.nz_place_images
  FOR UPDATE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Authenticated can delete own nz_place_images"
  ON public.nz_place_images
  FOR DELETE
  USING (created_by = auth.uid());

