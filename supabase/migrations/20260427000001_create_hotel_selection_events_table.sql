-- Track hotel selection intent and booking clicks from trip planner surfaces.
-- Includes LiteAPI and Google Places hotel sources.

CREATE TABLE IF NOT EXISTS public.hotel_selection_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  provider TEXT NOT NULL CHECK (provider IN ('liteapi', 'google_places')),
  action_type TEXT NOT NULL CHECK (action_type IN ('add_to_itinerary', 'book_now')),
  hotel_name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  rating NUMERIC(3, 2),
  average_nightly_rate NUMERIC(10, 2),
  currency_code TEXT,
  search_checkin DATE,
  search_checkout DATE,
  search_nights INTEGER,
  product_id TEXT,
  hotel_id TEXT,
  booking_url TEXT,
  google_maps_uri TEXT,
  latitude NUMERIC(10, 7),
  longitude NUMERIC(10, 7),
  trip_day_date DATE,
  trip_location TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hotel_selection_events_created_at
  ON public.hotel_selection_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hotel_selection_events_action_type
  ON public.hotel_selection_events(action_type);

CREATE INDEX IF NOT EXISTS idx_hotel_selection_events_provider
  ON public.hotel_selection_events(provider);

CREATE INDEX IF NOT EXISTS idx_hotel_selection_events_user_id
  ON public.hotel_selection_events(user_id);

CREATE INDEX IF NOT EXISTS idx_hotel_selection_events_product_id
  ON public.hotel_selection_events(product_id);

ALTER TABLE public.hotel_selection_events ENABLE ROW LEVEL SECURITY;

-- Allow inserts from both authenticated and anonymous users to preserve booking funnel signals.
CREATE POLICY "Allow public insert on hotel selection events"
  ON public.hotel_selection_events
  FOR INSERT
  WITH CHECK (true);

-- Restrict reads to authenticated users for back-office analytics usage.
CREATE POLICY "Allow authenticated read on hotel selection events"
  ON public.hotel_selection_events
  FOR SELECT
  USING ((select auth.role()) = 'authenticated');
