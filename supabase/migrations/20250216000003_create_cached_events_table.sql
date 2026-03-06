-- Create table for cached events
-- This table stores events that users have "hearted" (pinned)
-- Events are stored once and can be referenced by multiple users

CREATE TABLE IF NOT EXISTS public.cached_events (
  id BIGSERIAL PRIMARY KEY,
  eventfinda_id INTEGER UNIQUE NOT NULL, -- The ID from Eventfinda API
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  datetime_start TIMESTAMPTZ,
  datetime_end TIMESTAMPTZ,
  datetime_summary TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create index on eventfinda_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_cached_events_eventfinda_id ON public.cached_events(eventfinda_id);

-- Create index on url for duplicate checking
CREATE INDEX IF NOT EXISTS idx_cached_events_url ON public.cached_events(url);

-- Enable RLS
ALTER TABLE public.cached_events ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anyone to read cached events (they're public data)
CREATE POLICY "Allow public read access to cached events"
  ON public.cached_events
  FOR SELECT
  USING (true);

-- Policy: Allow authenticated users to insert events (when hearting)
CREATE POLICY "Allow authenticated users to insert cached events"
  ON public.cached_events
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Policy: Allow system to update events (for syncing data)
CREATE POLICY "Allow authenticated users to update cached events"
  ON public.cached_events
  FOR UPDATE
  USING (auth.role() = 'authenticated');

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_cached_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_cached_events_updated_at
  BEFORE UPDATE ON public.cached_events
  FOR EACH ROW
  EXECUTE FUNCTION update_cached_events_updated_at();
