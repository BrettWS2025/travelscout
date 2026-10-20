-- ============================================================================
-- Deals platform Chunk 8 — DEV ONLY seed
-- ============================================================================
-- Apply against local Supabase only (never production):
--   psql "$DATABASE_URL" -f supabase/seeds/deals_platform_dev.sql
--   # or: supabase db reset  (if configured as a seed in config.toml)
--
-- Seeded logins (password for all: DevSeed123!):
--   owner@harbour-kayaks.dev   — Harbour Kayaks owner
--   manager@harbour-kayaks.dev — Harbour Kayaks manager
--   staff@harbour-kayaks.dev   — Harbour Kayaks staff
--   owner@bay-cruises.dev      — Bay Cruises owner (Rezdy not_connected)
--
-- IDs match web/lib/marketplace/seed-dev.ts DEV_SEED_IDS.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Auth users (local Supabase auth schema)
-- ---------------------------------------------------------------------------
-- Idempotent: skip users that already exist by email or id.

INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change
)
SELECT
  '00000000-0000-0000-0000-000000000000'::uuid,
  u.id,
  'authenticated',
  'authenticated',
  u.email,
  crypt('DevSeed123!', gen_salt('bf')),
  NOW(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  NOW(),
  NOW(),
  '',
  '',
  '',
  ''
FROM (
  VALUES
    ('a1000000-0000-4000-8000-000000000011'::uuid, 'owner@harbour-kayaks.dev'),
    ('a1000000-0000-4000-8000-000000000012'::uuid, 'manager@harbour-kayaks.dev'),
    ('a1000000-0000-4000-8000-000000000013'::uuid, 'staff@harbour-kayaks.dev'),
    ('b2000000-0000-4000-8000-000000000011'::uuid, 'owner@bay-cruises.dev')
) AS u(id, email)
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users existing
  WHERE existing.id = u.id OR lower(existing.email) = lower(u.email)
);

-- auth.identities (required for email login in recent Supabase versions)
INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
)
SELECT
  u.id,
  u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email),
  'email',
  u.id::text,
  NOW(),
  NOW(),
  NOW()
FROM (
  VALUES
    ('a1000000-0000-4000-8000-000000000011'::uuid, 'owner@harbour-kayaks.dev'),
    ('a1000000-0000-4000-8000-000000000012'::uuid, 'manager@harbour-kayaks.dev'),
    ('a1000000-0000-4000-8000-000000000013'::uuid, 'staff@harbour-kayaks.dev'),
    ('b2000000-0000-4000-8000-000000000011'::uuid, 'owner@bay-cruises.dev')
) AS u(id, email)
WHERE EXISTS (SELECT 1 FROM auth.users au WHERE au.id = u.id)
  AND NOT EXISTS (
    SELECT 1 FROM auth.identities i
    WHERE i.user_id = u.id AND i.provider = 'email'
  );

-- ---------------------------------------------------------------------------
-- Operator A: Harbour Kayaks (manual, no integration)
-- ---------------------------------------------------------------------------
INSERT INTO marketplace.operators (
  id, legal_name, trading_name, slug, short_description,
  regions_served, languages, account_status, public_email,
  timezone, currency
)
VALUES (
  'a1000000-0000-4000-8000-000000000001',
  'Harbour Kayaks Limited',
  'Harbour Kayaks',
  'harbour-kayaks',
  'Guided harbour kayak tours from the city waterfront.',
  ARRAY['Auckland']::text[],
  ARRAY['en']::text[],
  'active',
  'hello@harbour-kayaks.dev',
  'Pacific/Auckland',
  'NZD'
)
ON CONFLICT (id) DO NOTHING;

-- booking defaults created by trigger; ensure row exists if operator was pre-seeded
INSERT INTO marketplace.operator_booking_defaults (operator_id)
VALUES ('a1000000-0000-4000-8000-000000000001')
ON CONFLICT (operator_id) DO NOTHING;

INSERT INTO marketplace.team_members (
  id, operator_id, user_id, role, invited_email, invite_status, invited_at, last_active_at
)
VALUES
  (
    'a1000000-0000-4000-8000-000000000021',
    'a1000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000011',
    'owner',
    'owner@harbour-kayaks.dev',
    'accepted',
    NOW(),
    NOW()
  ),
  (
    'a1000000-0000-4000-8000-000000000022',
    'a1000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000012',
    'manager',
    'manager@harbour-kayaks.dev',
    'accepted',
    NOW(),
    NOW()
  ),
  (
    'a1000000-0000-4000-8000-000000000023',
    'a1000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000013',
    'staff',
    'staff@harbour-kayaks.dev',
    'accepted',
    NOW(),
    NOW()
  )
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Operator B: Bay Cruises + Rezdy integration (not_connected)
-- ---------------------------------------------------------------------------
INSERT INTO marketplace.operators (
  id, legal_name, trading_name, slug, short_description,
  regions_served, languages, account_status, public_email,
  timezone, currency
)
VALUES (
  'b2000000-0000-4000-8000-000000000001',
  'Bay Cruises Limited',
  'Bay Cruises',
  'bay-cruises',
  'Scenic bay cruises with live booking via Rezdy.',
  ARRAY['Bay of Plenty']::text[],
  ARRAY['en']::text[],
  'active',
  'hello@bay-cruises.dev',
  'Pacific/Auckland',
  'NZD'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO marketplace.operator_booking_defaults (operator_id)
VALUES ('b2000000-0000-4000-8000-000000000001')
ON CONFLICT (operator_id) DO NOTHING;

INSERT INTO marketplace.team_members (
  id, operator_id, user_id, role, invited_email, invite_status, invited_at, last_active_at
)
VALUES (
  'b2000000-0000-4000-8000-000000000021',
  'b2000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000011',
  'owner',
  'owner@bay-cruises.dev',
  'accepted',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO marketplace.integrations (
  id, operator_id, provider, status, conversion_tracking_method, auto_enable_new_products
)
VALUES (
  'b2000000-0000-4000-8000-000000000041',
  'b2000000-0000-4000-8000-000000000001',
  'rezdy',
  'not_connected',
  'none',
  false
)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Billing accounts
-- ---------------------------------------------------------------------------
INSERT INTO marketplace.billing_accounts (
  id, operator_id, plan, billing_model, billing_email, status
)
VALUES
  (
    'a1000000-0000-4000-8000-000000000031',
    'a1000000-0000-4000-8000-000000000001',
    'starter',
    'subscription',
    'billing@harbour-kayaks.dev',
    'active'
  ),
  (
    'b2000000-0000-4000-8000-000000000031',
    'b2000000-0000-4000-8000-000000000001',
    'starter',
    'subscription',
    'billing@bay-cruises.dev',
    'active'
  )
ON CONFLICT (operator_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Default notification preferences (spec §6.4) for each seeded member
-- ---------------------------------------------------------------------------
INSERT INTO marketplace.notification_preferences (
  user_id, operator_id, event_type, email, sms, in_app
)
SELECT
  m.user_id,
  m.operator_id,
  e.event_type,
  e.email,
  e.sms,
  e.in_app
FROM (
  VALUES
    ('a1000000-0000-4000-8000-000000000011'::uuid, 'a1000000-0000-4000-8000-000000000001'::uuid),
    ('a1000000-0000-4000-8000-000000000012'::uuid, 'a1000000-0000-4000-8000-000000000001'::uuid),
    ('a1000000-0000-4000-8000-000000000013'::uuid, 'a1000000-0000-4000-8000-000000000001'::uuid),
    ('b2000000-0000-4000-8000-000000000011'::uuid, 'b2000000-0000-4000-8000-000000000001'::uuid)
) AS m(user_id, operator_id)
CROSS JOIN (
  VALUES
    ('integration_sync_failing', true, true, true),
    ('deal_auto_paused', true, false, true),
    ('attestation_due', true, true, false),
    ('booking_link_broken', true, false, true),
    ('deal_review_update', true, false, true),
    ('deal_lifecycle', false, false, true),
    ('auto_rule_created_deals', false, false, true),
    ('daily_performance_summary', true, false, false),
    ('compliance_expiring', true, false, false)
) AS e(event_type, email, sms, in_app)
ON CONFLICT (user_id, operator_id, event_type) DO NOTHING;

COMMIT;
