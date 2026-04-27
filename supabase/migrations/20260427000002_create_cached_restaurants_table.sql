-- Cache selected restaurants from trip planner actions.
-- Stores restaurant details when users click Interested or Check it out.

CREATE TABLE IF NOT EXISTS public.cached_restaurants (
  id BIGSERIAL PRIMARY KEY,
  place_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  location TEXT,
  city TEXT,
  rating NUMERIC(3, 2),
  user_rating_count INTEGER,
  google_maps_uri TEXT,
  website_uri TEXT,
  latitude NUMERIC(10, 7),
  longitude NUMERIC(10, 7),
  selected_action TEXT NOT NULL CHECK (selected_action IN ('interested', 'check_it_out')),
  selected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  trip_day_date DATE,
  trip_location TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cached_restaurants_place_id
  ON public.cached_restaurants(place_id);

CREATE INDEX IF NOT EXISTS idx_cached_restaurants_selected_at
  ON public.cached_restaurants(selected_at DESC);

CREATE INDEX IF NOT EXISTS idx_cached_restaurants_selected_action
  ON public.cached_restaurants(selected_action);

ALTER TABLE public.cached_restaurants ENABLE ROW LEVEL SECURITY;

-- Public inserts/updates allow both authenticated and anonymous trip planning usage.
CREATE POLICY "Allow public insert on cached restaurants"
  ON public.cached_restaurants
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update on cached restaurants"
  ON public.cached_restaurants
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow public read on cached restaurants"
  ON public.cached_restaurants
  FOR SELECT
  USING (true);

CREATE OR REPLACE FUNCTION update_cached_restaurants_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_cached_restaurants_updated_at ON public.cached_restaurants;
CREATE TRIGGER update_cached_restaurants_updated_at
  BEFORE UPDATE ON public.cached_restaurants
  FOR EACH ROW
  EXECUTE FUNCTION update_cached_restaurants_updated_at();
