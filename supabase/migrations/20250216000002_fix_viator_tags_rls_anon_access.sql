-- ============================================================================
-- FIX VIATOR_TAGS RLS POLICY FOR ANONYMOUS ACCESS
-- ============================================================================
-- The API uses the anon key, so we need to allow anonymous users to read tags
-- Tags are public data, so this is safe

-- Drop the existing policy that requires authentication
DROP POLICY IF EXISTS "Authenticated users can view viator tags" ON viator_tags;

-- Create a new policy that allows both authenticated and anonymous users to read tags
CREATE POLICY "Public can view viator tags"
  ON viator_tags FOR SELECT
  USING (true);
