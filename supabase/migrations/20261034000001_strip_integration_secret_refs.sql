-- ============================================================================
-- Security S13: Strip secret refs from client-visible surfaces
-- ============================================================================
-- Problem: members with SELECT on marketplace.integrations (RLS:
-- "Members can view integrations") can read credentials_ref and
-- webhook_secret_ref via PostgREST. Those are UUIDs into
-- marketplace.encrypted_secrets — not the ciphertext, but still useful
-- for correlation / confusion / future IDOR if grants ever weaken.
-- API serializers already omit both fields; the DB did not.
--
-- Fix:
--   1. marketplace.integrations_member — all integration columns except
--      credentials_ref / webhook_secret_ref (aligned with
--      serializeIntegration / INTEGRATION_MEMBER_COLUMNS).
--   2. View uses security_invoker = true so member RLS on the base table
--      still applies (is_operator_member).
--   3. REVOKE SELECT/INSERT/UPDATE on the two ref columns from
--      PUBLIC / anon / authenticated; service_role keeps full table access.
--   4. Re-assert marketplace.encrypted_secrets remains service_role only
--      (RLS on, no client policies, no client GRANTs).
--
-- App inventory/integrations still primarily in-memory; when wiring DB
-- persistence, prefer integrations_member (or the Next.js serializers) for
-- member reads, and write refs only via service_role.
-- ============================================================================

CREATE OR REPLACE VIEW marketplace.integrations_member AS
SELECT
  id,
  operator_id,
  provider,
  status,
  auth_type,
  external_account_id,
  external_account_name,
  sync_mode,
  poll_interval_seconds,
  webhook_last_received_at,
  last_sync_at,
  last_successful_sync_at,
  last_error_code,
  last_error_message,
  default_booking_destination_type,
  booking_base_url,
  conversion_tracking_method,
  booking_source_label,
  auto_enable_new_products,
  connected_at,
  connected_by,
  created_at,
  updated_at
FROM marketplace.integrations;

COMMENT ON VIEW marketplace.integrations_member IS
  'S13: member-safe integration rows without credentials_ref / webhook_secret_ref. Prefer this (or Next.js serializeIntegration) over base-table SELECT for operator clients.';

-- Invoker mode: callers must pass base-table RLS (Members can view integrations).
ALTER VIEW marketplace.integrations_member SET (security_invoker = true);

GRANT SELECT ON marketplace.integrations_member TO authenticated, service_role;

-- Column-level lockdown on the base table (PostgREST SELECT * / explicit
-- credentials_ref fails for client roles).
REVOKE SELECT (credentials_ref, webhook_secret_ref)
  ON TABLE marketplace.integrations
  FROM PUBLIC, anon, authenticated;

REVOKE INSERT (credentials_ref, webhook_secret_ref)
  ON TABLE marketplace.integrations
  FROM PUBLIC, anon, authenticated;

REVOKE UPDATE (credentials_ref, webhook_secret_ref)
  ON TABLE marketplace.integrations
  FROM PUBLIC, anon, authenticated;

-- service_role retains full access (table-level GRANT ALL from create migration).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE marketplace.integrations
  TO service_role;

-- ---------------------------------------------------------------------------
-- encrypted_secrets: fail closed (already correct — do not weaken)
-- ---------------------------------------------------------------------------
ALTER TABLE marketplace.encrypted_secrets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE marketplace.encrypted_secrets
  FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE marketplace.encrypted_secrets TO service_role;

COMMENT ON TABLE marketplace.encrypted_secrets IS
  'AES-GCM ciphertext for provider credentials / webhook secrets. Security S13: service_role only (RLS on, no client policies/grants). Refs live on integrations.credentials_ref / webhook_secret_ref — never return refs or ciphertext to clients.';
