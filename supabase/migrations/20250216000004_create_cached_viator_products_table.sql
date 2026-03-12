-- Create table for cached Viator products
-- This table stores Viator products that users have added to their itinerary
-- Products are stored once and can be referenced by multiple users

CREATE TABLE IF NOT EXISTS public.cached_viator_products (
  id BIGSERIAL PRIMARY KEY,
  product_code TEXT UNIQUE NOT NULL, -- The product code from Viator API
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  url TEXT NOT NULL,
  -- Rating information
  rating NUMERIC(3, 2), -- Average rating (e.g., 4.5)
  total_reviews INTEGER, -- Total number of reviews
  -- Pricing information
  price NUMERIC(10, 2), -- Price as number
  price_formatted TEXT, -- Formatted price string (e.g., "NZD $99.00")
  currency_code TEXT, -- Currency code (e.g., "NZD", "USD")
  -- Duration information
  duration TEXT, -- Duration string (e.g., "2 hours", "3-4 hours")
  duration_minutes INTEGER, -- Duration in minutes for sorting/filtering
  -- Location information
  latitude NUMERIC(10, 7),
  longitude NUMERIC(10, 7),
  destination_id INTEGER, -- Viator destination ID
  destination_name TEXT, -- Destination name
  -- Additional metadata
  tag_ids INTEGER[], -- Array of tag IDs for filtering
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create index on product_code for fast lookups
CREATE INDEX IF NOT EXISTS idx_cached_viator_products_product_code ON public.cached_viator_products(product_code);

-- Create index on url for duplicate checking
CREATE INDEX IF NOT EXISTS idx_cached_viator_products_url ON public.cached_viator_products(url);

-- Create index on destination_id for location-based queries
CREATE INDEX IF NOT EXISTS idx_cached_viator_products_destination_id ON public.cached_viator_products(destination_id);

-- Create GIN index on tag_ids for array queries
CREATE INDEX IF NOT EXISTS idx_cached_viator_products_tag_ids ON public.cached_viator_products USING GIN(tag_ids);

-- Enable RLS
ALTER TABLE public.cached_viator_products ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anyone to read cached Viator products (they're public data)
CREATE POLICY "Allow public read access to cached viator products"
  ON public.cached_viator_products
  FOR SELECT
  USING (true);

-- Policy: Allow authenticated users to insert products (when adding to itinerary)
CREATE POLICY "Allow authenticated users to insert cached viator products"
  ON public.cached_viator_products
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Policy: Allow authenticated users to update products (for syncing data)
CREATE POLICY "Allow authenticated users to update cached viator products"
  ON public.cached_viator_products
  FOR UPDATE
  USING (auth.role() = 'authenticated');

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_cached_viator_products_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_cached_viator_products_updated_at
  BEFORE UPDATE ON public.cached_viator_products
  FOR EACH ROW
  EXECUTE FUNCTION update_cached_viator_products_updated_at();
