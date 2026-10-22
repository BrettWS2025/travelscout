-- ============================================================================
-- Security S8: Narrow public SELECT on operators (no internal PII / tax IDs)
-- ============================================================================
-- Problem: policy "Public can view active operators" + GRANT SELECT TO anon
-- exposed the full marketplace.operators row (internal_email, internal_phone,
-- gst_number, nzbn, legal_name, admin flags, etc.) via PostgREST.
--
-- Fix:
--   1. marketplace.operators_public — brand / contact columns only for
--      account_status = 'active' (aligned with serializeOperatorPreview).
--   2. Drop the wide public SELECT policy on the base table.
--   3. REVOKE SELECT on the base table from anon (and PUBLIC).
--   4. Members keep full-row SELECT via "Members can view their operators"
--      (authenticated GRANT SELECT unchanged).
--
-- View ownership (default, NOT security_invoker): the view runs with the
-- privileges of its owner so anon can read safe columns without SELECT on
-- the base table. Do not set security_invoker = true on this view.
-- ============================================================================

CREATE OR REPLACE VIEW marketplace.operators_public AS
SELECT
  id,
  trading_name,
  slug,
  logo,
  cover_image,
  short_description,
  long_description,
  website,
  public_email,
  public_phone,
  address,
  regions_served,
  timezone,
  currency,
  languages,
  social_links
FROM marketplace.operators
WHERE account_status = 'active';

COMMENT ON VIEW marketplace.operators_public IS
  'S8: public brand fields for active operators only; no internal PII / tax IDs / admin flags. Prefer this (or the Next.js preview serializer) over base-table SELECT for travellers.';

-- Explicit: invoker mode would break anon after REVOKE SELECT on the base table.
ALTER VIEW marketplace.operators_public SET (security_invoker = false);

GRANT SELECT ON marketplace.operators_public TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Public can view active operators"
  ON marketplace.operators;

REVOKE SELECT ON TABLE marketplace.operators FROM PUBLIC, anon;

-- authenticated + service_role retain SELECT on the base table (member RLS /
-- service-role bypass). Re-assert in case PUBLIC revoke cascaded oddly.
GRANT SELECT ON TABLE marketplace.operators TO authenticated, service_role;
