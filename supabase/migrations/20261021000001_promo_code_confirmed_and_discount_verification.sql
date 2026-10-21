-- ============================================================================
-- Deals platform Chunk 33: integrated pricing / discount verification
-- ============================================================================
-- promo_code_confirmed_by_operator: when adapter.verifyDiscount returns
-- cannot_verify, the operator must confirm the code exists and pass Test link
-- before publish (Chunk 35 fills the publish check).
-- discount_verification: last POST .../verify-discount result (jsonb).
-- ============================================================================

ALTER TABLE marketplace.operator_deals
  ADD COLUMN IF NOT EXISTS promo_code_confirmed_by_operator BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE marketplace.operator_deals
  ADD COLUMN IF NOT EXISTS discount_verification JSONB;

COMMENT ON COLUMN marketplace.operator_deals.promo_code_confirmed_by_operator IS
  'Chunk 33: operator attested promo/discount when provider cannot_verify';

COMMENT ON COLUMN marketplace.operator_deals.discount_verification IS
  'Chunk 33: last verify-discount payload {status, checked_at, options[]}';
