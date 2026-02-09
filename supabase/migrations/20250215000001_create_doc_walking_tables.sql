-- ============================================================================
-- CREATE RAW TABLES FOR DOC WALKING EXPERIENCES CSV IMPORTS
-- ============================================================================
-- These tables are designed to hold the raw CSV data that will be uploaded
-- manually via Supabase dashboard or CLI.

-- Table for Locations CSV data
CREATE TABLE IF NOT EXISTS public.doc_walking_experiences_locations (
    "Object ID" TEXT,
    "Track name" TEXT,
    "Description" TEXT,
    "Difficulty" TEXT,
    "Completion time" TEXT,
    "Has alerts" TEXT,
    "URL to thumbnail" TEXT,
    "URL to webpage" TEXT,
    "Date loaded to GIS" TEXT,
    x DOUBLE PRECISION,
    y DOUBLE PRECISION,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table for Shape CSV data
CREATE TABLE IF NOT EXISTS public.doc_walking_experiences_shape (
    "Object ID" TEXT,
    "Track name" TEXT,
    "Description" TEXT,
    "Difficulty" TEXT,
    "Completion time" TEXT,
    "Has alerts" TEXT,
    "URL to thumbnail" TEXT,
    "URL to webpage" TEXT,
    "Date loaded to GIS" TEXT,
    "Shape__Length" DOUBLE PRECISION,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes on the join key
CREATE INDEX IF NOT EXISTS idx_locations_url ON public.doc_walking_experiences_locations("URL to webpage");
CREATE INDEX IF NOT EXISTS idx_shape_url ON public.doc_walking_experiences_shape("URL to webpage");

-- Enable RLS
ALTER TABLE public.doc_walking_experiences_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doc_walking_experiences_shape ENABLE ROW LEVEL SECURITY;

-- Allow public read access (adjust as needed for your security requirements)
CREATE POLICY "Allow public read access" ON public.doc_walking_experiences_locations
    FOR SELECT USING (true);

CREATE POLICY "Allow public read access" ON public.doc_walking_experiences_shape
    FOR SELECT USING (true);
