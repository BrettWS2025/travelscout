-- ============================================================================
-- ACTIVITIES TABLE
-- ============================================================================
-- Activities on trip days
CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  day_id UUID NOT NULL REFERENCES trip_days(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('note', 'accommodation', 'attraction', 'event', 'transport')),
  provider TEXT NOT NULL DEFAULT 'manual' CHECK (provider IN ('manual', 'everythingnz', 'eventbookings', 'other')),
  title TEXT NOT NULL,
  description TEXT,
  place_name TEXT,
  place_id TEXT,
  start_date_time TIMESTAMPTZ,
  end_date_time TIMESTAMPTZ,
  provider_ref TEXT,
  confirmation_code TEXT,
  booking_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for activities
CREATE INDEX idx_activities_trip_id ON activities(trip_id);
CREATE INDEX idx_activities_day_id ON activities(day_id);
CREATE INDEX idx_activities_kind ON activities(kind);

-- Enable RLS
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

-- Policies for activities (users can only access activities for their own trips)
CREATE POLICY "Users can view activities for own trips"
  ON activities FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM trips
      WHERE trips.id = activities.trip_id
      AND trips.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create activities for own trips"
  ON activities FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM trips
      WHERE trips.id = activities.trip_id
      AND trips.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update activities for own trips"
  ON activities FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM trips
      WHERE trips.id = activities.trip_id
      AND trips.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete activities for own trips"
  ON activities FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM trips
      WHERE trips.id = activities.trip_id
      AND trips.user_id = auth.uid()
    )
  );

-- Trigger for activities updated_at
CREATE TRIGGER update_activities_updated_at
  BEFORE UPDATE ON activities
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

