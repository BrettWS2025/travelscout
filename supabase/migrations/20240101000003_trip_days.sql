-- ============================================================================
-- TRIP_DAYS TABLE
-- ============================================================================
-- Days within a trip
CREATE TABLE IF NOT EXISTS trip_days (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  "order" INTEGER NOT NULL,
  date DATE NOT NULL,
  location_id TEXT NOT NULL,
  location_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT trip_days_trip_order_unique UNIQUE (trip_id, "order")
);

-- Indexes for trip_days
CREATE INDEX idx_trip_days_trip_id ON trip_days(trip_id);
CREATE INDEX idx_trip_days_date ON trip_days(date);

-- Enable RLS
ALTER TABLE trip_days ENABLE ROW LEVEL SECURITY;

-- Policies for trip_days (users can only access days for their own trips)
CREATE POLICY "Users can view trip days for own trips"
  ON trip_days FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM trips
      WHERE trips.id = trip_days.trip_id
      AND trips.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create trip days for own trips"
  ON trip_days FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM trips
      WHERE trips.id = trip_days.trip_id
      AND trips.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update trip days for own trips"
  ON trip_days FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM trips
      WHERE trips.id = trip_days.trip_id
      AND trips.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete trip days for own trips"
  ON trip_days FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM trips
      WHERE trips.id = trip_days.trip_id
      AND trips.user_id = auth.uid()
    )
  );

-- Trigger for trip_days updated_at
CREATE TRIGGER update_trip_days_updated_at
  BEFORE UPDATE ON trip_days
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

