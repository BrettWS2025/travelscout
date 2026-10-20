-- ============================================================================
-- Deals platform Chunk 8: NotificationPreference, ComplianceDocument,
-- BillingAccount
-- ============================================================================
-- Remaining settings tables hanging off marketplace.operators.
-- Enum / event string values match web/lib/marketplace/enums.ts and
-- web/lib/marketplace/settings.ts (NOTIFICATION_EVENT_TYPES).
-- Seed data (dev only) lives in supabase/seeds/deals_platform_dev.sql and
-- web/lib/marketplace/seed-dev.ts — not applied by this migration.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- notification_preferences
-- ---------------------------------------------------------------------------
CREATE TABLE marketplace.notification_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  operator_id UUID NOT NULL
    REFERENCES marketplace.operators(id) ON DELETE CASCADE,

  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'integration_sync_failing',
      'deal_auto_paused',
      'attestation_due',
      'booking_link_broken',
      'deal_review_update',
      'deal_lifecycle',
      'auto_rule_created_deals',
      'daily_performance_summary',
      'compliance_expiring'
    )),
  email BOOLEAN NOT NULL DEFAULT false,
  sms BOOLEAN NOT NULL DEFAULT false,
  in_app BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, operator_id, event_type)
);

CREATE INDEX idx_marketplace_notification_preferences_operator
  ON marketplace.notification_preferences (operator_id);

CREATE INDEX idx_marketplace_notification_preferences_user
  ON marketplace.notification_preferences (user_id);

CREATE TRIGGER update_marketplace_notification_preferences_updated_at
  BEFORE UPDATE ON marketplace.notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION marketplace.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- compliance_documents
-- ---------------------------------------------------------------------------
CREATE TABLE marketplace.compliance_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  operator_id UUID NOT NULL
    REFERENCES marketplace.operators(id) ON DELETE CASCADE,

  doc_type TEXT NOT NULL
    CHECK (doc_type IN (
      'public_liability_insurance',
      'adventure_activities_certificate',
      'maritime_licence',
      'business_licence',
      'food_licence',
      'other'
    )),
  -- Storage key (Supabase Storage), not a public URL
  file TEXT NOT NULL,
  issuer TEXT,
  reference_number TEXT,
  issued_on DATE,
  expires_on DATE,
  review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'approved', 'rejected', 'expired')),
  reviewer_notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_marketplace_compliance_documents_operator
  ON marketplace.compliance_documents (operator_id);

CREATE INDEX idx_marketplace_compliance_documents_expires
  ON marketplace.compliance_documents (expires_on)
  WHERE expires_on IS NOT NULL;

CREATE TRIGGER update_marketplace_compliance_documents_updated_at
  BEFORE UPDATE ON marketplace.compliance_documents
  FOR EACH ROW
  EXECUTE FUNCTION marketplace.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- billing_accounts (one row per operator)
-- ---------------------------------------------------------------------------
CREATE TABLE marketplace.billing_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  operator_id UUID NOT NULL UNIQUE
    REFERENCES marketplace.operators(id) ON DELETE CASCADE,

  plan TEXT NOT NULL DEFAULT 'free',
  billing_model TEXT NOT NULL DEFAULT 'subscription'
    CHECK (billing_model IN ('subscription', 'per_click', 'commission')),
  commission_pct NUMERIC(5, 2)
    CHECK (
      commission_pct IS NULL
      OR (commission_pct >= 0 AND commission_pct <= 100)
    ),
  billing_email TEXT,
  -- Pointer to billing provider payment method — never card data
  payment_method_ref TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'past_due', 'cancelled', 'none')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_marketplace_billing_accounts_updated_at
  BEFORE UPDATE ON marketplace.billing_accounts
  FOR EACH ROW
  EXECUTE FUNCTION marketplace.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE marketplace.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace.compliance_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace.billing_accounts ENABLE ROW LEVEL SECURITY;

-- notification_preferences: members see/edit their own prefs for that operator
CREATE POLICY "Members can view own notification preferences"
  ON marketplace.notification_preferences FOR SELECT
  USING (
    user_id = (SELECT auth.uid())
    AND marketplace.is_operator_member(operator_id)
  );

CREATE POLICY "Members can insert own notification preferences"
  ON marketplace.notification_preferences FOR INSERT
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND marketplace.is_operator_member(operator_id)
  );

CREATE POLICY "Members can update own notification preferences"
  ON marketplace.notification_preferences FOR UPDATE
  USING (
    user_id = (SELECT auth.uid())
    AND marketplace.is_operator_member(operator_id)
  );

CREATE POLICY "Members can delete own notification preferences"
  ON marketplace.notification_preferences FOR DELETE
  USING (
    user_id = (SELECT auth.uid())
    AND marketplace.is_operator_member(operator_id)
  );

-- compliance_documents: all members read; owners/managers write
CREATE POLICY "Members can view compliance documents"
  ON marketplace.compliance_documents FOR SELECT
  USING (marketplace.is_operator_member(operator_id));

CREATE POLICY "Owners and managers can insert compliance documents"
  ON marketplace.compliance_documents FOR INSERT
  WITH CHECK (marketplace.is_operator_owner_or_manager(operator_id));

CREATE POLICY "Owners and managers can update compliance documents"
  ON marketplace.compliance_documents FOR UPDATE
  USING (marketplace.is_operator_owner_or_manager(operator_id));

CREATE POLICY "Owners and managers can delete compliance documents"
  ON marketplace.compliance_documents FOR DELETE
  USING (marketplace.is_operator_owner_or_manager(operator_id));

-- billing_accounts: owners only (managers/staff denied)
CREATE POLICY "Owners can view billing accounts"
  ON marketplace.billing_accounts FOR SELECT
  USING (marketplace.is_operator_owner(operator_id));

CREATE POLICY "Owners can insert billing accounts"
  ON marketplace.billing_accounts FOR INSERT
  WITH CHECK (marketplace.is_operator_owner(operator_id));

CREATE POLICY "Owners can update billing accounts"
  ON marketplace.billing_accounts FOR UPDATE
  USING (marketplace.is_operator_owner(operator_id));

CREATE POLICY "Owners can delete billing accounts"
  ON marketplace.billing_accounts FOR DELETE
  USING (marketplace.is_operator_owner(operator_id));

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON marketplace.notification_preferences
  TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON marketplace.compliance_documents
  TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON marketplace.billing_accounts
  TO authenticated, service_role;
