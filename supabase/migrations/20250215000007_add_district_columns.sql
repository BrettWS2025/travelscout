-- ============================================================================
-- ADD DISTRICT COLUMNS TO WALKING EXPERIENCES PROCESSED
-- ============================================================================
-- Adds district_name and district_osm_id columns to enable fast filtering
-- and display of district information without spatial joins at query time.

ALTER TABLE public.walking_experiences_processed
ADD COLUMN IF NOT EXISTS district_name TEXT,
ADD COLUMN IF NOT EXISTS district_osm_id TEXT;

-- Create index on district for fast filtering
CREATE INDEX IF NOT EXISTS idx_walking_experiences_district 
ON public.walking_experiences_processed(district_name);

-- Create composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_walking_experiences_district_location 
ON public.walking_experiences_processed(district_name, latitude, longitude)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
