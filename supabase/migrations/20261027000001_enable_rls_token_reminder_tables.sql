-- ============================================================================
-- Security S4: Enable RLS on token / reminder tables (fail closed)
-- ============================================================================
-- Pattern (same as marketplace.encrypted_secrets): RLS ON + no client policies
-- + revoke client grants. anon / authenticated cannot SELECT/INSERT/UPDATE/DELETE
-- via PostgREST even if schema USAGE is granted. service_role bypasses RLS and
-- retains full table privileges for server-side persistence when leaving
-- in-memory stores.
--
-- Tables:
--   marketplace.quick_update_tokens
--   marketplace.attestation_reminders
--   marketplace.team_invite_tokens
--
-- App token flows today use in-memory maps in deal-attestation.ts / team.ts
-- (HMAC-signed tokens; only SHA-256 hashes would be persisted). Any future
-- DB-backed path must use a service-role client — never the anon key.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Row Level Security (no policies for anon / authenticated)
-- ---------------------------------------------------------------------------
ALTER TABLE marketplace.quick_update_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace.attestation_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace.team_invite_tokens ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Grants: revoke clients; service_role only
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE marketplace.quick_update_tokens
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE marketplace.attestation_reminders
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE marketplace.team_invite_tokens
  FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE marketplace.quick_update_tokens TO service_role;
GRANT ALL ON TABLE marketplace.attestation_reminders TO service_role;
GRANT ALL ON TABLE marketplace.team_invite_tokens TO service_role;

COMMENT ON TABLE marketplace.quick_update_tokens IS
  'Chunk 20 / security S4: hashed single-use quick-update tokens; RLS on, service_role only (no client policies)';
COMMENT ON TABLE marketplace.attestation_reminders IS
  'Chunk 20 / security S4: attestation reminder dedupe; RLS on, service_role only (no client policies)';
COMMENT ON TABLE marketplace.team_invite_tokens IS
  'Chunk 40 / security S4: hashed team invite tokens; RLS on, service_role only (no client policies)';
