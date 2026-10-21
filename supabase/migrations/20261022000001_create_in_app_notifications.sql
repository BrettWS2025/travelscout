-- ============================================================================
-- Deals platform Chunk 39: in-app notifications
-- ============================================================================
-- Inbox rows created by notify() when a member has in_app enabled for
-- the event. Preferences stay in marketplace.notification_preferences
-- (Chunk 8). Deduped deliveries are application-level (incident keys).
-- ============================================================================

CREATE TABLE marketplace.in_app_notifications (
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
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_marketplace_in_app_notifications_user_unread
  ON marketplace.in_app_notifications (user_id, operator_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX idx_marketplace_in_app_notifications_operator
  ON marketplace.in_app_notifications (operator_id, created_at DESC);

ALTER TABLE marketplace.in_app_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view own in-app notifications"
  ON marketplace.in_app_notifications FOR SELECT
  USING (
    user_id = (SELECT auth.uid())
    AND marketplace.is_operator_member(operator_id)
  );

CREATE POLICY "Members can mark own in-app notifications read"
  ON marketplace.in_app_notifications FOR UPDATE
  USING (
    user_id = (SELECT auth.uid())
    AND marketplace.is_operator_member(operator_id)
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND marketplace.is_operator_member(operator_id)
  );

-- Inserts are service-role / backend only (notify()); no INSERT policy for
-- authenticated clients.

GRANT SELECT, UPDATE ON marketplace.in_app_notifications TO authenticated;
GRANT ALL ON marketplace.in_app_notifications TO service_role;
