-- ============================================================================
-- FIX ERROR-LEVEL SECURITY ISSUES
-- ============================================================================
-- This migration fixes:
-- 1. Security Definer View - places_search_view
-- 2. RLS Disabled - linz_gazetteer_raw table
-- 3. RLS Disabled - feature_type_map table
-- ============================================================================

-- ============================================================================
-- FIX 1: Remove SECURITY DEFINER from places_search_view
-- ============================================================================
-- Recreate the view with SECURITY INVOKER (default, but explicit for clarity)
-- This ensures the view runs with the permissions of the querying user,
-- not the view creator, which is more secure.

DROP VIEW IF EXISTS places_search_view CASCADE;

CREATE VIEW places_search_view
WITH (security_invoker = true) AS
SELECT 
  p.id,
  p.name,
  p.lat,
  p.lng,
  p.rank,
  p.category,
  p.region,
  p.status,
  p.maori_name,
  p.is_active,
  p.geometry,
  p.created_at,
  p.updated_at,
  -- Array of all searchable names (ordered and distinct)
  COALESCE(
    (
      SELECT ARRAY_AGG(DISTINCT ordered_names.name)
      FROM (
        SELECT DISTINCT ON (pn.name) pn.name
        FROM place_names pn
        WHERE pn.place_id = p.id
          AND pn.name IS NOT NULL
        ORDER BY 
          pn.name,
          CASE pn.name_type
            WHEN 'official' THEN 1
            WHEN 'maori' THEN 2
            WHEN 'normalized' THEN 3
            WHEN 'macronless' THEN 4
            ELSE 5
          END
      ) ordered_names
    ),
    ARRAY[]::TEXT[]
  ) AS search_names
FROM places p
WHERE p.is_active = true;

-- Re-grant access to the view
GRANT SELECT ON places_search_view TO authenticated;
GRANT SELECT ON places_search_view TO anon;

-- ============================================================================
-- FIX 2: Enable RLS on linz_gazetteer_raw table
-- ============================================================================
-- This is a staging table for internal data processing.
-- We'll enable RLS and create a policy that denies access via PostgREST
-- (service role can still access it directly via SQL)

ALTER TABLE linz_gazetteer_raw ENABLE ROW LEVEL SECURITY;

-- Policy: Deny all access via PostgREST (authenticated and anon roles)
-- Service role can still access directly via SQL for data processing
CREATE POLICY "Deny all access via PostgREST"
ON linz_gazetteer_raw
FOR ALL
TO authenticated, anon
USING (false)
WITH CHECK (false);

-- ============================================================================
-- FIX 3: Enable RLS on feature_type_map table
-- ============================================================================
-- This is a reference/lookup table for internal use.
-- We'll enable RLS and create a policy that denies access via PostgREST
-- (service role can still access it directly via SQL)

ALTER TABLE feature_type_map ENABLE ROW LEVEL SECURITY;

-- Policy: Deny all access via PostgREST (authenticated and anon roles)
-- Service role can still access directly via SQL for data processing
CREATE POLICY "Deny all access via PostgREST"
ON feature_type_map
FOR ALL
TO authenticated, anon
USING (false)
WITH CHECK (false);
