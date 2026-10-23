# Security remediation chunks

> Save this file in the repo at `docs/security-remediation-chunks.md`.
> Source: Oct 2026 security audit (Supabase RLS, permissions, secrets, API authz).
> Each chunk is a self-contained prompt. Copy **one** chunk (from its heading down to the next `---`) into a Cloud Agent / Cursor chat, let it build, deploy to **dev**, then run the **Test it** steps and review before starting the next chunk.
> Do **not** batch multiple chunks in one run unless a chunk explicitly says it depends on another and must ship together.
> Standing rules still apply: `docs/deals-spec.md`, `.cursor/rules/deals-platform.mdc`. If behaviour changes, update the spec in the same change.
> Prefer small migrations + automated tests. Fail closed. No secrets in logs or client responses.

## How to run a chunk

1. Open a new agent chat (or Cloud Agent) on the current `main` / `Dev` branch as appropriate.
2. Paste the **Example runner prompt** (at the bottom of this file), filling in the chunk number.
3. Paste the full chunk section (Goal → Done when).
4. After the PR merges to **dev**, smoke-test there, then promote onward per your usual path.

## Progress

Tick these as chunks are finished. Add one line of notes (files touched, anything deferred).

**Phase A: Privilege escalation (do first)**
- [x] S0. Stop trusting `user_metadata` for platform admin — Notes: `isPlatformAdminUser` in `web/lib/marketplace/permissions.ts` no longer reads `user_metadata`; tests in `permissions.test.ts`; spec §5 clarified. App-only; no migration. Deferred: backfill `app_metadata` for any admins who relied on `user_metadata` only (use profile flag / Auth Admin API).
- [x] S1. Cookie auth: validate session with `getUser()` not `getSession()` — Notes: `getMarketplaceAuth` + `getServerUser` cookie paths use `auth.getUser()`; session token only after verify; tests in `auth.test.ts`; spec §5.9 + Project context. App-only; no migration. Deferred: none.

**Phase B: Database locks (RLS / system-owned fields)**
- [x] S2. Lock system-owned deal columns at the database — Notes: migration `20261024000001_lock_system_owned_deal_columns.sql` BEFORE UPDATE triggers on `operator_deals` (status/pause_*/discount_verification) and legacy `deals` (status); service_role/postgres/supabase_admin only; tests in `deal-system-columns-db.test.ts`; spec §4.2. Deferred: legacy `updateDeal` still sends `status` with user JWT (fails at DB until S14); wire inventory status persistence through service-role when leaving in-memory stores.
- [x] S3. Lock operator admin fields and team role escalation at RLS — Notes: migration `20261026000001_lock_operator_admin_and_team_roles.sql` BEFORE triggers on `operators` (account_status/requires_manual_review), `team_members` (owner-only role=owner + last accepted owner), legacy `organization_members`; tests in `operator-admin-team-roles-db.test.ts`; spec §3.9 / §6.5 / §6.8. Deferred: persist admin field changes + account close via service-role when leaving in-memory stores.
- [x] S4. Enable RLS on token / reminder tables (fail closed) — Notes: migration `20261027000001_enable_rls_token_reminder_tables.sql` RLS ON + no client policies + REVOKE ALL from PUBLIC/anon/authenticated + GRANT ALL to service_role on `quick_update_tokens`, `attestation_reminders`, `team_invite_tokens`; tests in `token-reminder-tables-db.test.ts`; spec §5.6 / §6.5 / Project context. App still in-memory for tokens; deferred: wire DB persistence via service-role when leaving maps.
- [x] S5. Fix `operator_booking_defaults` INSERT policy — Notes: migration `20261028000001_fix_operator_booking_defaults_insert.sql` drops `"System can insert booking defaults"` (`WITH CHECK (true)`), revokes INSERT from PUBLIC/anon/authenticated, keeps service_role INSERT + authenticated SELECT/UPDATE/DELETE; asserts `create_operator_booking_defaults` stays SECURITY DEFINER; tests in `operator-booking-defaults-insert-db.test.ts`; spec §3.9 / §6.3. Deferred: none (no owner/manager INSERT policy — trigger always seeds the row).
- [x] S6. Lock compliance `review_status` (operators cannot self-approve) — Notes: migration `20261029000001_lock_compliance_review_status.sql` BEFORE INSERT/UPDATE trigger on `compliance_documents` (`review_status`/`reviewer_notes`); service_role/postgres/supabase_admin only; INSERT clients must stay pending + null notes; tests in `compliance-review-columns-db.test.ts`; constants in `operator-compliance.ts`; spec §3 / §6.6. App still in-memory for compliance; deferred: wire approve/reject/expiry DB writes via service-role (no `reviewed_at` column today).
- [x] S7. Harden `profiles` INSERT so `is_platform_admin` cannot be set by clients — Notes: migration `20261030000001_harden_profiles_insert_platform_admin.sql` INSERT policy `auth.uid() = id AND is_platform_admin IS NOT TRUE`; tests in `profiles-platform-admin-insert-db.test.ts` + `profiles.test.ts`; spec §5.9. Deferred: none (signup trigger / ensureUserProfile already omit the flag).

**Phase C: Public data exposure**
- [x] S8. Narrow public SELECT on operators (no internal PII / tax IDs) — Notes: migration `20261031000001_narrow_public_operators_select.sql` adds `marketplace.operators_public` (safe columns for active ops), drops `"Public can view active operators"`, revokes anon SELECT on base `operators`; `OPERATOR_PUBLIC_COLUMNS` / `OPERATOR_INTERNAL_COLUMNS` + tests in `operators-public-select-db.test.ts`; preview API stays on `serializeOperatorPreview`; spec §3.9 / §6.2 / Project context. Deferred: none (app has no PostgREST public operator reads today).
- [x] S9. Narrow public SELECT on live deals (hide promo codes and internal fields) — Notes: migration `20261032000001_narrow_public_deals_select.sql` adds `operator_deals_public` / `deal_price_options_public` / `discount_steps_public`, drops wide public SELECT policies, revokes anon SELECT on those base tables; `is_live_operator_deal` for sessions/media public RLS; constants in `deal-public.ts`; tests in `deals-public-select-db.test.ts`; spec §3 / §4.4 / Project context. Deferred: none (app inventory still in-memory; Book now already applies promo server-side).
- [x] S10. Align public deal RLS with fail-closed traveller visibility (or force public reads through API) — Notes: migration `20261033000001_align_public_deal_visibility.sql` adds `is_visible_to_travellers` (live + sellable session within MAX_LEAD_HOURS=72 default + cutoff); public views + sessions/media policies use it; `is_live_operator_deal` delegates; `PUBLIC_DEAL_VISIBILITY_MAX_LEAD_HOURS` + tests in `deals-public-visibility-db.test.ts`; spec §3 / Project context. Deferred: SQL lead window uses platform default 72 (not env `MAX_LEAD_HOURS` override); app inventory still in-memory.

**Phase D: Integrations, tokens, webhooks**
- [x] S11. Fail closed when token HMAC secrets / encryption keys are unset in production — Notes: `allowsDevSecretFallback` in `secrets.ts`; `resolveQuickUpdateTokenSecret` / `resolveTeamInviteTokenSecret` / `ensureIntegrationSecretsConfigured` throw 503 (no `dev-…` / `DEV_TEST_KEY_HEX`) outside test/development/seed; `resolveSecretsKey` already required the env key; tests in `secrets-production-fail-closed.test.ts`; spec Project context env checklist. App-only; no migration. Deferred: none (confirm Dev/prod env vars are set before deploy).
- [x] S12. Require webhook secrets; reject unsigned provider webhooks — Notes: `handleIntegrationWebhook` fails closed without `webhookSecretRef` (401 `webhook_secret_missing`); invalid HMAC/token → 401; connect + settings PATCH mint secret when sync_mode is webhook/hybrid; tests in `integration-sync.test.ts` + connect settings case; spec § Chunk 27/28 + Project context. App-only; no migration. Deferred: none.
- [x] S13. Strip `credentials_ref` / secret refs from any path that could leak (and consider column-level / view lockdown) — Notes: migration `20261034000001_strip_integration_secret_refs.sql` adds `integrations_member` (no refs, security_invoker), revokes SELECT/INSERT/UPDATE on `credentials_ref`/`webhook_secret_ref` from clients, re-asserts `encrypted_secrets` service_role-only; `INTEGRATION_MEMBER_COLUMNS` / `INTEGRATION_SECRET_REF_COLUMNS` + tests in `integrations-secret-refs-db.test.ts`; serializers already strip (regression covered); spec §3.8 / Project context. Deferred: wire DB persistence reads through `integrations_member` / service-role writes when leaving in-memory stores.

**Phase E: Legacy / mass assignment / abuse**
- [x] S14. Legacy deals API: stop client-controlled `status` (or retire routes) — Notes: migration `20261035000001_legacy_deals_status_and_staff_write.sql` INSERT forces draft, owner/admin-only writes, `transition_legacy_deal_status` RPC; `createDeal`/`updateDeal`/`stripLegacyDealStatus` + routes route status via RPC; tests in `legacy-deals-status-db.test.ts` + `marketplace.test.ts`; spec §3 / §4.2 / Project context. Deferred: retire legacy org UI when unused; inventory status persistence still service-role when leaving in-memory.
- [x] S15. Strip system fields from inventory client patches (`link_status`, `slug`, etc.) — Notes: `SYSTEM_OWNED_DEAL_FIELDS` + `stripSystemOwnedDealFields` / `applyClientDealFieldPatch` also strip `slug`/`linkStatus`; `updateDraftDeal` clears `link_*` on booking URL/type change; publish `booking_destination` fails closed unless fresh check or successful probe; tests in `deal-status.test.ts`, `deal-draft.test.ts`, `deal-publish-validation.test.ts`; spec §3.1 / §4.1 / §4.2. App-only; no migration. Deferred: DB column lock for `slug`/`link_*` (optional; inventory still in-memory).
- [x] S16. Rate-limit book / click / track endpoints (IP-bound, fail closed under abuse) — Notes: `public-rate-limit.ts` in-process fixed-window (IP + optional visitor for Book now; IP for legacy click + track impressions/detail-view); wired in `deal-book-now.ts` + click/track routes; tests in `public-rate-limit.test.ts`, `deal-book-now.test.ts`, `marketplace.test.ts`, `track-rate-limit.test.ts`; spec §4.4 / Chunk 45 / Project context. App-only; no migration. Deferred: Redis/shared multi-instance store.

**Phase F: Hygiene (lower priority)**
- [ ] S17. Stop returning raw `err.message` / stacks to clients in production
- [ ] S18. Tighten unnecessary GRANTs and SECURITY DEFINER EXECUTE on helpers
- [ ] S19. Deal ID oracle / error timing (auth before existence where practical)

---

## Chunk S0. Stop trusting `user_metadata` for platform admin

**Goal:** only server-controlled flags can make someone a platform admin.

**Why it matters:** Today `isPlatformAdminUser` treats `user.user_metadata.is_platform_admin` as true. Users can set their own `user_metadata` via Supabase Auth, so a normal account can unlock `admin.*` routes.

**Build:**
1. In `web/lib/marketplace/permissions.ts`, remove the `user_metadata` check. Keep only:
   - `profiles.is_platform_admin` (DB), and/or
   - `user.app_metadata.is_platform_admin` (set only by service role / admin).
2. Update unit tests in `web/lib/marketplace/__tests__/permissions.test.ts` so `user_metadata` alone must **not** grant admin; add cases for profile flag and `app_metadata`.
3. Grep for other `user_metadata.is_platform_admin` usages and fix them the same way.
4. If the spec still mentions user_metadata for admin, correct `docs/deals-spec.md`.

**Test it:**
- Unit tests: metadata-only user → not admin; profile flag → admin; app_metadata → admin.
- Manually (dev): as a normal user, call `supabase.auth.updateUser({ data: { is_platform_admin: true } })` then hit an admin route → must get 403.

**Done when:** no code path grants platform admin from client-writable metadata; tests green; deployed to dev and reviewed.

**Deploy notes:** app-only change; no migration required unless you also backfill `app_metadata` for existing admins.

---

## Chunk S1. Cookie auth: validate session with `getUser()` not `getSession()`

**Goal:** server routes never trust a cookie session without revalidating the JWT with Supabase Auth.

**Why it matters:** `getSession()` can return a stale or tampered local session object. `getUser()` asks Auth to verify the token.

**Build:**
1. In `web/lib/marketplace/auth.ts` (and any cookie fallback in `web/lib/supabase/server.ts`), replace cookie-path `getSession()` with `getUser()` (or equivalent verified user lookup).
2. Keep the bearer-header path that already uses `getUser(token)`.
3. Add/adjust tests for cookie vs header auth if present; otherwise add a focused unit/integration test for the helper.

**Test it:**
- Valid cookie/session still authenticates.
- Expired / revoked user is rejected.
- Existing marketplace permission tests still pass.

**Done when:** no server auth path relies on unverified `getSession()` for authorization; deployed to dev.

---

## Chunk S2. Lock system-owned deal columns at the database

**Goal:** clients cannot set `status`, `pause_reason`, or `pause_detail` (and related system columns) via PostgREST even if they bypass the Next.js API.

**Why it matters:** Spec says status is system-owned. App strips fields; RLS currently allows unrestricted UPDATE for owners/managers on `marketplace.operator_deals` (and legacy `marketplace.deals` may also allow member writes of `status`).

**Build:**
1. Add a migration that prevents client roles from changing system-owned columns, e.g.:
   - BEFORE UPDATE trigger that rejects changes to `status` / `pause_reason` / `pause_detail` / promo-confirmation / discount_verification (as appropriate) unless `current_user` / `auth.role()` is `service_role`, **or**
   - revoke UPDATE from `authenticated` on those tables and route all status changes through service-role server code, **or**
   - column-level privileges if you use that pattern consistently.
2. Prefer one clear pattern and document it in the migration comment + `docs/deals-spec.md`.
3. Ensure status transitions still go through `transitionDeal` / server APIs (service role or SECURITY DEFINER function that writes `DealEvent`).
4. Automated tests: SQL or API-level tests proving authenticated JWT cannot PATCH status via Supabase client; server transition still works.

**Test it:**
- As operator owner JWT, `supabase.from('operator_deals').update({ status: 'live' })` fails or leaves status unchanged.
- Publish / pause / resume via API still works on dev.

**Done when:** DB enforces system-owned fields; API flows still work; migration applied on dev; reviewed.

**Depends on:** none strictly, but deploy after S0 if admin routes are involved in testing.

---

## Chunk S3. Lock operator admin fields and team role escalation at RLS

**Goal:** managers cannot promote themselves to owner; operators cannot self-activate or clear manual-review flags via the database.

**Why it matters:** UPDATE policies on `marketplace.operators` and `marketplace.team_members` are membership-only with no column/`WITH CHECK` constraints. App strips some fields; PostgREST does not.

**Build:**
1. Migration for `marketplace.operators`: block client changes to `account_status`, `requires_manual_review`, and any other admin-only columns (trigger or service-role-only updates).
2. Migration for `marketplace.team_members`: only owners may set `role = 'owner'`; managers may not escalate; last-owner rules remain enforced server-side (and preferably in DB).
3. Mirror for legacy `organization_members` if still in use.
4. Tests covering: manager cannot UPDATE own/other role to owner; owner can invite/change roles as today; operator cannot set `account_status = 'active'` via client.

**Test it:**
- Manager JWT attempts role escalation → denied.
- Owner JWT can still manage team via API.
- Admin (platform) path can still change `account_status` if that is a product feature.

**Done when:** RLS/triggers enforce role and account-status rules; tests green; on dev.

---

## Chunk S4. Enable RLS on token / reminder tables (fail closed)

**Goal:** `quick_update_tokens`, `attestation_reminders`, and `team_invite_tokens` have RLS enabled and are inaccessible to `anon` / `authenticated`.

**Why it matters:** Tables currently have no RLS. They may have no GRANTs today, but that is fragile.

**Build:**
1. Migration: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` on all three tables.
2. Do **not** add client policies (service role bypasses RLS).
3. Explicitly `REVOKE ALL ON TABLE ... FROM PUBLIC, anon, authenticated;` and `GRANT ALL ... TO service_role` (or the minimal grants your server needs).
4. Confirm app token flows use service-role / server-only access (or in-memory store paths); update if any path used the anon key against these tables.
5. Tests: authenticated client SELECT/INSERT on these tables fails; server token issue/redeem still works.

**Test it:**
- Issue invite / quick-update on dev → works.
- Direct PostgREST select as user → empty/denied.

**Done when:** all three tables RLS-on + no client policies/grants; on dev.

---

## Chunk S5. Fix `operator_booking_defaults` INSERT policy

**Goal:** only the SECURITY DEFINER trigger / service role can insert booking-default rows.

**Why it matters:** Policy `"System can insert booking defaults"` uses `WITH CHECK (true)` with `GRANT INSERT TO authenticated`.

**Build:**
1. Drop the open INSERT policy.
2. Ensure the create-operator trigger still inserts defaults (SECURITY DEFINER).
3. If owners/managers need to create a missing row, replace with a tight `WITH CHECK (is_operator_owner_or_manager(operator_id))` — never `true`.
4. Tests: random authenticated user cannot insert defaults for another operator; creating an operator still creates defaults.

**Done when:** open INSERT gone; trigger path verified on dev.

---

## Chunk S6. Lock compliance `review_status` (operators cannot self-approve)

**Goal:** operators cannot set compliance documents to approved via RLS.

**Build:**
1. Migration: trigger or column privileges so only service_role / platform admin path may set `review_status`, `reviewer_notes`, reviewed-at fields.
2. Keep owner/manager upload + replace of document content as today.
3. Tests: operator UPDATE of `review_status` denied; admin approve/reject API still works.

**Done when:** self-approve via PostgREST impossible; admin API works on dev.

---

## Chunk S7. Harden `profiles` INSERT so `is_platform_admin` cannot be set by clients

**Goal:** new profile rows cannot be inserted with `is_platform_admin = true`.

**Why it matters:** UPDATE is already locked (`20261020000006`); INSERT still only checks `auth.uid() = id`.

**Build:**
1. Migration: tighten INSERT policy `WITH CHECK (auth.uid() = id AND is_platform_admin IS NOT TRUE)` (or force false via trigger).
2. Ensure signup / profile bootstrap still works.
3. Test: insert with admin true fails; normal insert succeeds.

**Done when:** INSERT cannot elevate; on dev. (Pairs with S0.)

---

## Chunk S8. Narrow public SELECT on operators (no internal PII / tax IDs)

**Goal:** anonymous users cannot read `internal_email`, `internal_phone`, `gst_number`, `nzbn`, and similar via PostgREST.

**Build:**
1. Prefer a public view (e.g. `marketplace.operators_public`) with only safe columns + RLS/grants on the view; revoke anon SELECT on the base table **or** replace the wide policy with a column-restricted approach your stack supports.
2. Point any public marketing/API reads at the safe view or a server serializer.
3. Keep member SELECT on full row for their own operator.
4. Tests: anon cannot select internal columns; public brand fields still readable for active operators.

**Done when:** anon key + PostgREST cannot exfiltrate internal PII; public pages still render on dev.

---

## Chunk S9. Narrow public SELECT on live deals (hide promo codes and internal fields)

**Goal:** travellers/anon cannot read `promo_code` and other non-public fields from live deals / discount steps / price options via the database.

**Build:**
1. Same pattern as S8: public views or server-only reads for traveller surfaces; revoke/narrow anon SELECT on base tables for sensitive columns.
2. Book-now / listing APIs continue to expose only what the product needs (promo may be applied server-side without listing the code publicly if that matches product intent — confirm against `docs/deals-spec.md`).
3. Tests: anon select of `promo_code` denied or null; listing/book still works.

**Done when:** promo codes not anonymously enumerable; on dev.

---

## Chunk S10. Align public deal RLS with fail-closed traveller visibility

**Goal:** a deal with `status = 'live'` but outside the lead window / fail-closed rules is not visible via direct DB SELECT if the product would hide it.

**Build:**
1. Either tighten the `"Public can view live deals"` policy to mirror `isVisibleToTravellers` (lead window, cutoff, etc.), **or**
2. Revoke anon SELECT on inventory tables and force all traveller reads through the Next.js API (recommended if SQL parity is hard).
3. Update child-table public policies (sessions, media, price options) consistently.
4. Tests: live-but-not-visible deal hidden from anon; visible deal still shown via intended public API.

**Done when:** public DB surface matches fail-closed product rules (or public DB surface is removed); on dev.

**Depends on:** S8/S9 if you are already reshaping public views — can combine carefully, but prefer separate PRs if large.

---

## Chunk S11. Fail closed when token HMAC secrets / encryption keys are unset in production

**Goal:** production never falls back to `"dev-…"` HMAC secrets or hardcoded encryption keys.

**Build:**
1. `deal-attestation.ts` / `team.ts`: if `NODE_ENV === 'production'` (or equivalent) and secret env vars are missing → throw / return 503, do not use `"dev-quick-update-token-secret"` / `"dev-team-invite-token-secret"`.
2. Same for `SECRETS_ENCRYPTION_KEY` / `DEV_TEST_KEY_HEX` paths in secrets helpers.
3. Document required env vars in `docs/deals-spec.md` Project context or ops notes.
4. Tests: production-mode missing secret fails closed; development still allows explicit test secrets.

**Done when:** no silent production fallbacks; env checklist documented; on dev with secrets set.

---

## Chunk S12. Require webhook secrets; reject unsigned provider webhooks

**Goal:** provider webhook routes fail closed when `webhookSecretRef` is missing.

**Build:**
1. In `integration-sync.ts` `handleIntegrationWebhook` (and route), if no secret configured → 401/503, do not process body.
2. Connect flow must always create a webhook secret when webhooks are enabled.
3. Tests: missing secret → rejected; valid HMAC → accepted; invalid HMAC → rejected.

**Done when:** unsigned webhooks cannot mutate inventory; on dev.

---

## Chunk S13. Strip secret refs from client-visible surfaces

**Goal:** `credentials_ref` / `webhook_secret_ref` never reach browsers or member PostgREST selects if avoidable.

**Build:**
1. Confirm API serializers already strip refs; add regression tests.
2. Prefer a DB view for members that omits ref columns, or revoke SELECT on those columns for `authenticated` if practical.
3. Ciphertext table (`encrypted_secrets`) must remain service-role only (already correct — do not weaken).

**Done when:** member JWT cannot read secret UUIDs via PostgREST (or product accepts refs as non-secret and documents that); ciphertext still locked.

---

## Chunk S14. Legacy deals API: stop client-controlled `status`

**Goal:** legacy `marketplace.deals` create/update routes (and RLS) cannot set `status` from the client, matching inventory rules — or retire the routes if unused.

**Build:**
1. Audit usage of `/api/marketplace/deals` and `db.ts` createDeal/updateDeal.
2. Either strip/ignore client `status` and route through transition helpers, or remove/disable legacy write endpoints if the inventory path fully replaced them.
3. Tighten legacy RLS so staff cannot write; status not client-writable.
4. Tests + note in build/spec if legacy is deprecated.

**Done when:** no legacy path lets a client force `live`; on dev.

---

## Chunk S15. Strip system fields from inventory client patches

**Goal:** clients cannot forge `link_status`, `slug`, or other system/gated fields on deal PATCH.

**Why it matters:** `dealFieldInputFromClient` / `applyClientDealFieldPatch` may still map `linkStatus` / `slug` while only stripping status/pause fields. Publish can trust a forged `link_status === "ok"`.

**Build:**
1. Expand strip/allow-list so only explicitly editable draft fields are accepted.
2. Always re-run link check on publish when required (do not trust stored `link_status` alone unless freshly verified).
3. Tests: PATCH with `link_status: ok` is ignored; publish still requires real check.

**Done when:** mass assignment of system fields blocked; publish tests green; on dev.

---

## Chunk S16. Rate-limit book / click / track endpoints

**Goal:** public book/click/track cannot be trivially abused to DoS provider rechecks or pollute metrics.

**Build:**
1. Bind Book now limits to IP (and optionally visitor_id), not visitor_id alone.
2. Add rate limits to legacy click and track impressions/detail-view.
3. Prefer a shared store if multi-instance (document if still in-process and acceptable for v1).
4. Tests for limit exceeded responses.

**Done when:** abuse paths return 429 under load in tests; on dev.

---

## Chunk S17. Stop returning raw `err.message` / stacks to clients in production

**Goal:** production error responses are generic; details stay in server logs.

**Build:**
1. `serverError()` in `auth.ts` and similar helpers: log full error server-side; return stable code/message to client when `NODE_ENV === 'production'`.
2. Remove stack from Viator sync (and any other) production responses.
3. Tests for production vs development behaviour.

**Done when:** production responses do not leak internals; on dev verified.

---

## Chunk S18. Tighten unnecessary GRANTs and SECURITY DEFINER EXECUTE

**Goal:** reduce probing surface — revoke EXECUTE on membership helper RPCs from `anon` where not required; clean useless grants (e.g. anon SELECT on tables with no public policy).

**Build:**
1. Review `is_operator_*` / `operator_id_for_*` EXECUTE grants; keep only what PostgREST policies need (policies call them as definer — often clients do not need EXECUTE).
2. Revoke redundant grants on `deal_events` / `click_events` if RLS already denies.
3. Document intentional public grants.

**Done when:** `anon`/`authenticated` privileges match least privilege; on dev; no RLS regressions.

---

## Chunk S19. Deal ID oracle / error timing (optional hardening)

**Goal:** unauthenticated callers cannot distinguish “deal exists” vs “not allowed” where it matters for admin/operator IDs.

**Build:**
1. Prefer auth check before existence on sensitive operator/admin deal routes, or return the same 404 for both missing and forbidden when unauthenticated.
2. Do not break legitimate 404 UX for authenticated owners.
3. Tests for unauthenticated responses.

**Done when:** behaviour documented and consistent; on dev.

---

## Example runner prompt

Copy this into a new agent chat, replace `S0` with the chunk you want, then paste the full chunk section from this file underneath.

```text
You are working on the TravelScout deals platform.

Task: implement ONLY security remediation chunk S0 from docs/security-remediation-chunks.md.
Do not start any other security chunks.

Rules:
- Follow docs/deals-spec.md and .cursor/rules/deals-platform.mdc.
- Make the smallest change that fully completes this chunk.
- Ship automated tests for the new rules.
- If behaviour in the spec changes, update docs/deals-spec.md in the same PR.
- After finishing, tick the chunk in docs/security-remediation-chunks.md Progress and add one line of notes (files touched, anything deferred).
- Commit, push, and open/update a PR targeting our Dev branch (or the branch we use for staging). Title it like: "security(S0): stop trusting user_metadata for platform admin".

Deploy / verify:
- Apply any new Supabase migrations to the **dev** project (or document the exact migration command I must run if you cannot apply it).
- Ensure CI / tests pass.
- In your final message, explain in plain English (layman’s terms):
  1) what was wrong,
  2) what you changed,
  3) how to verify on dev,
  4) any risk or follow-up.

Out of scope: anything not listed in chunk S0.
```

### Suggested order for the first week

| Order | Chunk | Rationale |
|------:|-------|-----------|
| 1 | S0 | Stops instant admin takeover |
| 2 | S1 | Hardens every authenticated request |
| 3 | S2 + S3 | Closes DB bypass of app rules |
| 4 | S4 | Fail-closed tokens before any GRANT mistakes |
| 5 | S11 + S12 | Production secrets / webhooks |
| 6 | S5–S7 | Remaining RLS tightness |
| 7 | S8–S10 | Public data exposure |
| 8 | S14–S16 | Legacy + abuse |
| 9 | S13, S17–S19 | Hygiene |

---

## Reference: audit themes → chunks

| Audit theme | Chunks |
|-------------|--------|
| Platform admin via `user_metadata` | S0, S7 |
| Unverified cookie session | S1 |
| Client can write deal status / pause_* | S2, S14 |
| Manager → owner escalation; operator self-activate | S3 |
| Token tables without RLS | S4 |
| Booking defaults `WITH CHECK (true)` | S5 |
| Compliance self-approve | S6 |
| Public operator PII / deal promo codes | S8, S9 |
| Live status ≠ traveller-visible | S10 |
| Dev HMAC / encryption fallbacks | S11 |
| Unsigned webhooks | S12 |
| Secret refs readable | S13 |
| Mass-assign `link_status` / slug | S15 |
| Book/click/track abuse | S16 |
| Error leakage / grants / IDOR oracle | S17–S19 |
