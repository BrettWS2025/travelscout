-- ============================================================================
-- NZ_PLACE_IMAGES TABLE
-- ============================================================================
-- Stores per-location images keyed by the *stable* OSM identifiers that feed
-- `nz_places_final`:
--   (country_code, osm_type, osm_id)
--
-- This avoids depending on `nz_places_final.id` UUIDs, which can change if the
-- final table is rebuilt.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.nz_place_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Stable foreign key identity (matches nz_places_final UNIQUE(country_code, osm_type, osm_id))
  country_code TEXT NOT NULL DEFAULT 'NZ',
  osm_type TEXT NOT NULL,
  osm_id TEXT NOT NULL,
  place_key TEXT NOT NULL, -- precomputed: country_code || ':' || osm_type || ':' || osm_id

  image_url TEXT NOT NULL,
  alt_text TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,

  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Backfill/compat: if this table already existed from an earlier migration,
-- ensure the new stable-key columns exist.
ALTER TABLE public.nz_place_images
  ADD COLUMN IF NOT EXISTS country_code TEXT DEFAULT 'NZ';
ALTER TABLE public.nz_place_images
  ADD COLUMN IF NOT EXISTS osm_type TEXT;
ALTER TABLE public.nz_place_images
  ADD COLUMN IF NOT EXISTS osm_id TEXT;
ALTER TABLE public.nz_place_images
  ADD COLUMN IF NOT EXISTS place_key TEXT;

-- Populate place_key for existing rows (if any) and keep it consistent.
-- (If table was created with the earlier place_id-based schema, we attempt to
-- backfill from nz_places_final.id.)
DO $$
BEGIN
  -- If an old schema column exists, backfill from nz_places_final using that UUID.
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'nz_place_images'
      AND column_name = 'place_id'
  ) THEN
    UPDATE public.nz_place_images i
    SET
      country_code = p.country_code,
      osm_type = p.osm_type,
      osm_id = p.osm_id,
      place_key = p.country_code || ':' || p.osm_type || ':' || p.osm_id
    FROM public.nz_places_final p
    WHERE i.place_id = p.id;
  END IF;

  -- For rows that already have country_code/osm_type/osm_id but missing place_key, compute it.
  UPDATE public.nz_place_images
  SET place_key = country_code || ':' || osm_type || ':' || osm_id
  WHERE place_key IS NULL OR place_key = '';
END $$;

-- Composite FK (stable identity) - rely on nz_places_final unique constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'nz_place_images_place_fk'
  ) THEN
    -- Only add the FK if the stable key columns are populated.
    IF NOT EXISTS (
      SELECT 1
      FROM public.nz_place_images
      WHERE country_code IS NULL OR osm_type IS NULL OR osm_id IS NULL OR place_key IS NULL OR place_key = ''
    ) THEN
      ALTER TABLE public.nz_place_images
        ADD CONSTRAINT nz_place_images_place_fk
        FOREIGN KEY (country_code, osm_type, osm_id)
        REFERENCES public.nz_places_final(country_code, osm_type, osm_id)
        ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_nz_place_images_place_key ON public.nz_place_images(place_key);
CREATE INDEX IF NOT EXISTS idx_nz_place_images_is_primary ON public.nz_place_images(is_primary) WHERE is_primary;
CREATE INDEX IF NOT EXISTS idx_nz_place_images_sort_order ON public.nz_place_images(place_key, sort_order);

-- Enforce at most one primary image per place.
CREATE UNIQUE INDEX IF NOT EXISTS nz_place_images_primary_unique
  ON public.nz_place_images(place_key)
  WHERE is_primary = TRUE;

-- updated_at trigger (same helper used elsewhere in this repo)
CREATE TRIGGER nz_place_images_updated_at
  BEFORE UPDATE ON public.nz_place_images
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.nz_place_images ENABLE ROW LEVEL SECURITY;

-- Public can read images (needed for the trip planner UI)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'nz_place_images' AND policyname = 'Public can view nz_place_images'
  ) THEN
    CREATE POLICY "Public can view nz_place_images"
      ON public.nz_place_images
      FOR SELECT
      USING (true);
  END IF;
END $$;

-- Only authenticated users can write (and only to their own rows)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'nz_place_images' AND policyname = 'Authenticated can insert own nz_place_images'
  ) THEN
    CREATE POLICY "Authenticated can insert own nz_place_images"
      ON public.nz_place_images
      FOR INSERT
      WITH CHECK (created_by = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'nz_place_images' AND policyname = 'Authenticated can update own nz_place_images'
  ) THEN
    CREATE POLICY "Authenticated can update own nz_place_images"
      ON public.nz_place_images
      FOR UPDATE
      USING (created_by = auth.uid())
      WITH CHECK (created_by = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'nz_place_images' AND policyname = 'Authenticated can delete own nz_place_images'
  ) THEN
    CREATE POLICY "Authenticated can delete own nz_place_images"
      ON public.nz_place_images
      FOR DELETE
      USING (created_by = auth.uid());
  END IF;
END $$;

