-- ============================================================================
-- Security S6: Lock compliance review_status (operators cannot self-approve)
-- ============================================================================
-- Pattern (same as S2 / S3): BEFORE INSERT/UPDATE trigger. Client roles
-- (anon / authenticated) cannot set or change review fields via PostgREST even
-- if they bypass the Next.js API.
-- Only PostgREST `service_role` (and postgres / supabase_admin for migrations
-- and SECURITY DEFINER / server writers) may set them.
--
-- marketplace.compliance_documents:
--   review_status, reviewer_notes — platform-admin / service-role only
--   (no reviewed_at column exists today; lock these two)
--
-- Owners/managers keep SELECT + INSERT/UPDATE/DELETE of document content
-- (file, doc_type, issuer, dates, etc.) via existing RLS. On INSERT, clients
-- may only create rows with review_status = 'pending' and reviewer_notes NULL
-- (the table defaults). Approve approve/reject and the compliance expiry job must
-- persist via a service-role client when leaving in-memory stores.
-- ============================================================================

CREATE OR REPLACE FUNCTION marketplace.enforce_compliance_review_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- service_role: PostgREST with service key. postgres / supabase_admin:
  -- migrations and SECURITY DEFINER writers.
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.review_status IS DISTINCT FROM 'pending'
       OR NEW.reviewer_notes IS DISTINCT FROM NULL
    THEN
      RAISE EXCEPTION
        'marketplace.compliance_documents review columns (review_status, reviewer_notes) can only be set by service_role'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.review_status IS DISTINCT FROM OLD.review_status
     OR NEW.reviewer_notes IS DISTINCT FROM OLD.reviewer_notes
  THEN
    RAISE EXCEPTION
      'marketplace.compliance_documents review columns (review_status, reviewer_notes) can only be changed by service_role'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION marketplace.enforce_compliance_review_columns() IS
  'S6: block authenticated/anon from setting review_status / reviewer_notes on compliance_documents';

DROP TRIGGER IF EXISTS marketplace_compliance_documents_enforce_review_columns
  ON marketplace.compliance_documents;
CREATE TRIGGER marketplace_compliance_documents_enforce_review_columns
  BEFORE INSERT OR UPDATE ON marketplace.compliance_documents
  FOR EACH ROW
  EXECUTE FUNCTION marketplace.enforce_compliance_review_columns();

GRANT EXECUTE ON FUNCTION marketplace.enforce_compliance_review_columns()
  TO anon, authenticated, service_role;
