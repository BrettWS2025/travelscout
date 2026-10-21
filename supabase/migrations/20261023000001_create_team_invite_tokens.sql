-- ============================================================================
-- Deals platform Chunk 40: team invite tokens
-- ============================================================================
-- Signed invite links emailed on POST .../team/invite (and resend).
-- Only the token hash is stored; raw token is emailed once.
-- Accept links the authenticated user to TeamMember (user_id + accepted).
-- ============================================================================

CREATE TABLE marketplace.team_invite_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_member_id UUID NOT NULL
    REFERENCES marketplace.team_members(id) ON DELETE CASCADE,
  operator_id UUID NOT NULL
    REFERENCES marketplace.operators(id) ON DELETE CASCADE,

  -- SHA-256 hex of the raw signed token (never store the raw token)
  token_hash TEXT NOT NULL UNIQUE,

  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_marketplace_team_invite_tokens_member
  ON marketplace.team_invite_tokens (team_member_id);

CREATE INDEX idx_marketplace_team_invite_tokens_operator
  ON marketplace.team_invite_tokens (operator_id);

CREATE INDEX idx_marketplace_team_invite_tokens_expires
  ON marketplace.team_invite_tokens (expires_at)
  WHERE used_at IS NULL AND revoked_at IS NULL;

CREATE TRIGGER update_marketplace_team_invite_tokens_updated_at
  BEFORE UPDATE ON marketplace.team_invite_tokens
  FOR EACH ROW
  EXECUTE FUNCTION marketplace.update_updated_at_column();

COMMENT ON TABLE marketplace.team_invite_tokens IS
  'Chunk 40: hashed invite tokens for team email invites (accept links user_id)';
