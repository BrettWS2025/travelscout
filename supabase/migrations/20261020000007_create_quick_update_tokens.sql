-- ============================================================================
-- Deals platform Chunk 20: quick-update tokens + attestation reminder dedupe
-- ============================================================================
-- Signed single-use tokens for email/SMS reconfirm links (no login).
-- Only the token hash is stored; raw token is emailed/SMS'd once.
-- Reminder rows prevent duplicate sends for the same attestation window.
-- ============================================================================

CREATE TABLE marketplace.quick_update_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  operator_id UUID NOT NULL
    REFERENCES marketplace.operators(id) ON DELETE CASCADE,

  -- SHA-256 hex of the raw signed token (never store the raw token)
  token_hash TEXT NOT NULL UNIQUE,
  channel TEXT NOT NULL
    CHECK (channel IN ('email', 'sms')),
  deal_ids UUID[] NOT NULL DEFAULT '{}',

  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_marketplace_quick_update_tokens_operator
  ON marketplace.quick_update_tokens (operator_id);

CREATE INDEX idx_marketplace_quick_update_tokens_expires
  ON marketplace.quick_update_tokens (expires_at)
  WHERE used_at IS NULL;

CREATE TRIGGER update_marketplace_quick_update_tokens_updated_at
  BEFORE UPDATE ON marketplace.quick_update_tokens
  FOR EACH ROW
  EXECUTE FUNCTION marketplace.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- attestation_reminders (dedupe: one reminder per deal + attestation window)
-- ---------------------------------------------------------------------------

CREATE TABLE marketplace.attestation_reminders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_id UUID NOT NULL
    REFERENCES marketplace.operator_deals(id) ON DELETE CASCADE,

  -- The attestation_expires_at this reminder covers (dedupe key with deal_id)
  attestation_expires_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  token_id UUID
    REFERENCES marketplace.quick_update_tokens(id) ON DELETE SET NULL,
  channels TEXT[] NOT NULL DEFAULT ARRAY['email', 'sms']::TEXT[],

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (deal_id, attestation_expires_at)
);

CREATE INDEX idx_marketplace_attestation_reminders_deal
  ON marketplace.attestation_reminders (deal_id, sent_at DESC);

CREATE TRIGGER update_marketplace_attestation_reminders_updated_at
  BEFORE UPDATE ON marketplace.attestation_reminders
  FOR EACH ROW
  EXECUTE FUNCTION marketplace.update_updated_at_column();

COMMENT ON TABLE marketplace.quick_update_tokens IS
  'Chunk 20: hashed single-use quick-update tokens for manual attestation reconfirm';
COMMENT ON TABLE marketplace.attestation_reminders IS
  'Chunk 20: tracks attestation due reminders so each attestation window is reminded once';
