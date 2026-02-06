-- ============================================================================
-- CREATE PROCESSED WALKING EXPERIENCES TABLE
-- ============================================================================
-- This table holds the transformed/processed data from the two raw tables.

CREATE TABLE IF NOT EXISTS public.walking_experiences_processed (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    object_id TEXT,
    track_name TEXT NOT NULL,
    description TEXT,
    difficulty TEXT,
    completion_time TEXT,
    completion_min INTEGER,
    completion_max INTEGER,
    is_range BOOLEAN DEFAULT FALSE,
    kid_friendly BOOLEAN DEFAULT FALSE,
    has_alerts TEXT,
    url_to_thumbnail TEXT,
    url_to_webpage TEXT UNIQUE NOT NULL,
    date_loaded_to_gis TIMESTAMP,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    shape_length DOUBLE PRECISION,
    x_original DOUBLE PRECISION,
    y_original DOUBLE PRECISION,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_walking_experiences_url ON public.walking_experiences_processed(url_to_webpage);
CREATE INDEX IF NOT EXISTS idx_walking_experiences_coords ON public.walking_experiences_processed(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_walking_experiences_kid_friendly ON public.walking_experiences_processed(kid_friendly);
CREATE INDEX IF NOT EXISTS idx_walking_experiences_completion ON public.walking_experiences_processed(completion_min, completion_max);

-- Enable RLS
ALTER TABLE public.walking_experiences_processed ENABLE ROW LEVEL SECURITY;

-- Create policy to allow public read access
CREATE POLICY "Allow public read access" ON public.walking_experiences_processed
    FOR SELECT USING (true);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_walking_experiences_processed_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_walking_experiences_processed_updated_at
    BEFORE UPDATE ON public.walking_experiences_processed
    FOR EACH ROW
    EXECUTE FUNCTION update_walking_experiences_processed_updated_at();
