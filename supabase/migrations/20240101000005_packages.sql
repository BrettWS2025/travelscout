-- ============================================================================
-- PACKAGES TABLE
-- ============================================================================
-- Travel packages from scrapers
CREATE TABLE IF NOT EXISTS packages (
  package_id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  destinations TEXT[] DEFAULT '{}',
  duration_days INTEGER,
  nights INTEGER,
  price DECIMAL(10, 2),
  currency TEXT DEFAULT 'NZD',
  price_basis TEXT,
  price_nzd DECIMAL(10, 2),
  price_pppn DECIMAL(10, 2),
  includes JSONB DEFAULT '{}',
  hotel JSONB,
  sale_ends_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for packages
CREATE INDEX idx_packages_source ON packages(source);
CREATE INDEX idx_packages_last_seen_at ON packages(last_seen_at DESC);
CREATE INDEX idx_packages_destinations ON packages USING GIN(destinations);
CREATE INDEX idx_packages_price_nzd ON packages(price_nzd) WHERE price_nzd IS NOT NULL;
CREATE INDEX idx_packages_sale_ends_at ON packages(sale_ends_at) WHERE sale_ends_at IS NOT NULL;

-- Full text search index for packages
CREATE INDEX idx_packages_title_search ON packages USING GIN(to_tsvector('english', title));

-- Enable RLS (packages are public, but we'll restrict writes to service role)
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;

-- Policies for packages (read-only for authenticated users, writes via service role only)
CREATE POLICY "Authenticated users can view packages"
  ON packages FOR SELECT
  USING (auth.role() = 'authenticated');

-- Trigger for packages updated_at
CREATE TRIGGER update_packages_updated_at
  BEFORE UPDATE ON packages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

