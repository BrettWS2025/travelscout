-- ============================================================================
-- TRAVEL_SCOUT_RECORDS TABLE
-- ============================================================================
-- Unified records for events & places (attractions/activities)
CREATE TABLE IF NOT EXISTS travel_scout_records (
  id TEXT PRIMARY KEY,
  record_type TEXT NOT NULL CHECK (record_type IN ('event', 'place')),
  name TEXT NOT NULL,
  description TEXT,
  categories TEXT[] DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  url TEXT NOT NULL,
  source TEXT DEFAULT 'christchurchnz.com',
  images TEXT[] DEFAULT '{}',
  location JSONB DEFAULT '{}',
  price JSONB DEFAULT '{}',
  booking JSONB DEFAULT '{}',
  event_dates JSONB,
  opening_hours TEXT,
  operating_months TEXT[],
  data_collected_at TIMESTAMPTZ,
  text_for_embedding TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for travel_scout_records
CREATE INDEX idx_travel_scout_records_type ON travel_scout_records(record_type);
CREATE INDEX idx_travel_scout_records_source ON travel_scout_records(source);
CREATE INDEX idx_travel_scout_records_categories ON travel_scout_records USING GIN(categories);
CREATE INDEX idx_travel_scout_records_tags ON travel_scout_records USING GIN(tags);
CREATE INDEX idx_travel_scout_records_data_collected_at ON travel_scout_records(data_collected_at DESC);

-- Full text search index
CREATE INDEX idx_travel_scout_records_name_search ON travel_scout_records USING GIN(to_tsvector('english', name));
CREATE INDEX idx_travel_scout_records_description_search ON travel_scout_records USING GIN(to_tsvector('english', COALESCE(description, '')));

-- Enable RLS (records are public for reading, writes via service role only)
ALTER TABLE travel_scout_records ENABLE ROW LEVEL SECURITY;

-- Policies for travel_scout_records (read-only for authenticated users)
CREATE POLICY "Authenticated users can view travel scout records"
  ON travel_scout_records FOR SELECT
  USING (auth.role() = 'authenticated');

-- Trigger for travel_scout_records updated_at
CREATE TRIGGER update_travel_scout_records_updated_at
  BEFORE UPDATE ON travel_scout_records
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

