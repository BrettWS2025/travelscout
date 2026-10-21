# Build chunks: Operator Inventory & Settings

> Save this file in the repo at `docs/build-chunks.md`.
> Each chunk is a self-contained prompt. Copy one chunk (from its heading down to the next `---`) into Cursor, let it build, then run the **Test it** steps before moving on.
> Every chunk assumes `docs/deals-spec.md` and `.cursor/rules/deals-platform.mdc` are in the repo (Chunk 0 sets this up).
> Design is handled by your screenshots. These chunks cover data and functions; UI chunks only wire existing screens to the backend.

## Progress
Cursor ticks these as chunks are finished.

**Phase A: Foundations**
- [x] 0. Set up reference files — Notes: filled Project context in `docs/deals-spec.md` (files already present).
- [ ] 1. Constants and enums
- [ ] 2. Operator, defaults and team tables
- [x] 3. Deal table — Notes: `marketplace.operator_deals` (avoids legacy `marketplace.deals`) + `web/lib/marketplace/deal.ts` field validator; highlight item length app-only (no subquery CHECK); integration/product/rule FKs deferred to chunk 7.
- [x] 4. Sessions, price options, discount steps — Notes: `deal_sessions` / `deal_price_options` / `discount_steps` FK → `operator_deals`; `computeSeatsDisplayed` + `withSeatsDisplayed` in `web/lib/marketplace/deal-session.ts`; external_session FK deferred to chunk 7.
- [x] 5. Media table — Notes: `marketplace.deal_media` + `web/lib/marketplace/deal-media.ts` (cover swap/promote, max 12 images, YouTube/Vimeo embed check).
- [x] 6. Audit, attestation, click, metrics, template tables — Notes: `deal_events` (append-only DB triggers + service reject update/delete), `deal_attestations`, `click_events`, `deal_metric_daily`, `deal_templates` + `web/lib/marketplace/deal-audit.ts`.
- [x] 7. Integration and auto-deal rule tables — Notes: `integrations` / `external_products` / `external_sessions` / `sync_logs` / `deal_rules` + `encrypted_secrets`; `secrets.ts` AES-GCM helpers; `serializeIntegration` strips refs; deferred FKs on `operator_deals` + `deal_sessions` wired.
- [x] 8. Remaining settings tables and seed data — Notes: `notification_preferences` / `compliance_documents` / `billing_accounts` + `settings.ts` (`PLATFORM_REGIONS`, notification defaults); dev seed Harbour Kayaks (owner/manager/staff) + Bay Cruises (rezdy `not_connected`) via `seed-dev.ts` + `supabase/seeds/deals_platform_dev.sql`.
- [x] 9. Roles and permissions guard — Notes: `web/lib/marketplace/permissions.ts` (`can`, `requirePermission`, role×action matrix); `forbidden` in `auth.ts`; `profiles.is_platform_admin` migration; tests in `permissions.test.ts`.

**Phase B: Manual deals end to end**
- [x] 10. Pricing maths and the 50% rule — Notes: `web/lib/marketplace/pricing.ts` (`maxDealPrice`, `meetsMinDiscount`, `discountPct`, `priceFromPercentage`, `validateSteps`, `withDiscountPct`); re-exported from `deal-session.ts`; spec §4.0.
- [x] 11. Deal event logger and status transition function — Notes: `web/lib/marketplace/deal-status.ts` (`logDealEvent`, `transitionDeal`, `applyAutoPause`, `clearAutoPause`, client strip of status/pause_*); tests in `deal-status.test.ts`; publish validation stub until chunk 16.
- [x] 12. Deal draft API (create, update, duplicate) — Notes: `web/lib/marketplace/deal-draft.ts` + routes `POST /api/marketplace/operators/:operatorId/deals`, `GET|PATCH|DELETE /api/marketplace/operator-deals/:id`, `POST .../duplicate`; in-memory store; validation stub empty until chunk 16; Supabase persistence deferred.
- [x] 13. Sessions and price options API (manual) — Notes: `deal-inventory.ts` + `timezone.ts`; routes under `operator-deals/:id/sessions|price-options` (+ reorder); open-window max 3 days; live edits need `confirm: true`; 50% reject returns `max_deal_price_minor`; publish validation still stubbed until chunk 16.
- [x] 14. Media upload API — Notes: `deal-media-api.ts` + `media-storage.ts` + `image-dimensions.ts`; routes under `operator-deals/:id/media` (upload/embed/patch/cover/reorder/delete); `importProviderImages` stub → 501 until chunk 32; live edits apply immediately; in-memory storage default.
- [x] 15. Booking destination validation and link checker — Notes: `booking-destination.ts` + `booking-link.ts` (`checkLink`, `runLinkCheck`, `buildTrackedUrl`, `testDealLink`, `runLinkCheckerJob`); `POST .../operator-deals/:id/test-link`; evidence URL results stored for chunk 16; cron scheduler deferred (call `runLinkCheckerJob` every 6h).
- [x] 16. Publish validation engine — Notes: `deal-publish-validation.ts` (`validateForPublish`, `validateDealInStore`, `createValidateForPublishFromStore`); wired into `getDealDetail` + inventory live-confirm; integrated checks stubbed until chunk 35; tests in `deal-publish-validation.test.ts`.
- [x] 17. Publish, schedule, review and attestation — Notes: `deal-publish.ts` (`publishDeal`, `approveDeal`, `rejectDeal`, `adminPauseDeal`, `getPublishButtonLabel`); routes `POST .../operator-deals/:id/publish` + admin approve/reject/pause/manual-review; `publish_button` on GET detail; notify-admins hook stub until chunk 39.
- [x] 18. Status ticker job — Notes: `deal-status-ticker.ts` (`runStatusTickerJob`, `tickDealStatus`, `isVisibleToTravellers`); discount-step hook stub until chunk 43; cron every-minute not wired yet.
- [x] 19. Operator actions (pause, resume, end, seats, bulk) — Notes: `deal-actions.ts` (`pauseDeal`/`resumeDeal`/`endDeal`/`archiveDeal`/`updateDealSeats`/`markDealSoldOut`/`bulkDealActions`); routes under `operator-deals/:id/{pause,resume,end,archive,seats,mark-sold-out}` + `operators/:id/deals/bulk`; `paused`/`auto_paused`→`scheduled` edges added; tests in `deal-actions.test.ts`.
- [x] 20. Attestation expiry, reminders and quick-update token — Notes: `deal-attestation.ts` (`runAttestationJob`, signed quick-update tokens, `attestDeal`); routes `GET|POST /api/marketplace/quick-update/:token`, `POST .../operator-deals/:id/attest`; tables `quick_update_tokens` / `attestation_reminders`; notify stub until chunk 39.
- [x] 21. Deals list API — Notes: `deal-list.ts` (`listOperatorDeals`, `getOperatorDealsCalendar`, tab_counts, banners, row actions); `GET .../operators/:id/deals` + `.../deals/calendar`; staff gets preview/view_stats only; integrations map on draft store.
- [x] 22. Wire deal editor (manual) — Notes: stepped editor under `/account/inventory/deals/{new,[id]}`; `operator-deals-client.ts` + `deal-editor.ts`; `publish_at` on PATCH; `GET /operators/me` + HTTP store seed/email role fallback; Fix jumps to `editorStep`.
- [x] 23. Wire deals list — Notes: `DealsList` + `deals-list-ui.ts` + client list/action helpers; inventory page tabs/calendar/filters/bulk/banners/seats; staff read-only via `allowed_actions`.
- [x] 24. Wire quick-update mobile page — Notes: `/quick-update/[token]` + `QuickUpdatePage` / `SeatStepper` / `quick-update-client.ts`; seat steppers + Still available/Sold out per deal; expired/used → login link; full-bleed in MarketingMain/OperatorMain.
- [x] 25. Templates — Notes: `deal-templates.ts` + routes save-as-template / templates CRUD / create-deal; `TemplatesList` + inventory subnav; createDraftDeal applies media+prices from payload; tests in `deal-templates.test.ts`.

**Phase C: Integrations and Rezdy**
- [x] 26. Provider adapter interface and mock provider — Notes: `web/lib/marketplace/providers/` (`ProviderAdapter`, `getAdapter`, coming-soon FH/Bókun/Checkfront, mock backs rezdy until Chunk 31); contract tests in `providers/__tests__/provider-adapter.contract.test.ts`.
- [x] 27. Connect, test and disconnect integrations — Notes: `integration-connect.ts` + routes under `operators/:id/integrations`; stub full sync until Chunk 28; disconnect auto-pauses live/scheduled (`scheduled→auto_paused`); reconnect clears `integration_disconnected` after sync.
- [x] 28. Sync engine and sync log — Notes: `integration-sync.ts` (`runSync`, poll job, webhook HMAC, product/resync/sync-log APIs); replaces connect stub; Chunk 35 post-sync hooks stubbed; seats update DealSessions; lock + retry.
- [ ] 29. Stale-sync monitor and integration auto-pause
- [ ] 30. Rezdy research (answer open decisions)
- [ ] 31. Rezdy adapter
- [ ] 32. Integrated deal creation and content overrides
- [ ] 33. Integrated pricing and discount verification
- [ ] 34. Integrated availability and capacity
- [ ] 35. Integrated publish checks and provider-driven auto-pauses

**Phase D: Book now**
- [ ] 36. Book now click flow and tracking

**Phase E: Settings**
- [ ] 37. Integrations settings screens
- [ ] 38. Business profile and deal defaults
- [ ] 39. Notifications
- [ ] 40. Team
- [ ] 41. Compliance documents
- [ ] 42. Billing and account

**Phase F: Advanced**
- [ ] 43. Stepped discounts
- [ ] 44. Auto-deal rules
- [ ] 45. Metrics rollup and deal stats

---

## Chunk 0. Set up reference files

**Goal:** put the spec and rules where Cursor will always find them.

**Do:**
1. Create `docs/deals-spec.md` with the contents I'm attaching/pasting.
2. Create `docs/build-chunks.md` with the contents I'm attaching/pasting.
3. Create `.cursor/rules/deals-platform.mdc` with the contents I'm attaching/pasting (keep the frontmatter block at the top exactly).
4. Look through the repo and add a short "Project context" section at the end of `docs/deals-spec.md` listing: framework, language, ORM, database, test runner, job/queue system (or "none yet"), file storage, email/SMS provider (or "none yet"), and where models, API routes, jobs and tests live.

**Test it:** open the three files and check they exist. Ask Cursor "what's the minimum discount and where is it enforced?" It should answer 50%, server-side, from the rules file.

**Done when:** files exist and Project context is filled in.

---

## Chunk 1. Constants and enums

**Goal:** one config module for platform constants and one place for every enum.

**Build:**
- A config module exporting, with admin-overridable values (env vars or a settings table, whichever fits the project):
  `MIN_DISCOUNT_PCT=50`, `MAX_LEAD_HOURS=72`, `MANUAL_ATTESTATION_HOURS=12`, `SYNC_STALE_MINUTES=15`, `CLICK_RECHECK=true`, `MANUAL_REVIEW_COUNT=3`, `LINK_CHECK_TIMEOUT_MS=5000`, `CLICK_RECHECK_TIMEOUT_MS=2000`, `CACHED_AVAILABILITY_MAX_AGE_MINUTES=5`, `ARCHIVE_AFTER_DAYS=30`, `ATTESTATION_REMINDER_HOURS=2`, `ENFORCE_COMPLIANCE_ON_PUBLISH=false`, `DEFAULT_TIMEZONE="Pacific/Auckland"`, `DEFAULT_CURRENCY="NZD"`.
- Enums (as DB enums or validated string constants, matching project style):
  - source_provider: rezdy, fareharbor, bokun, checkfront, manual
  - deal_type: integrated_session, integrated_multi_session, manual_session, manual_open_window
  - deal_status: draft, pending_review, scheduled, live, paused, auto_paused, sold_out, expired, ended, archived
  - pause_reason: operator, admin, sync_failure, session_cancelled, capacity_zero, price_below_threshold, attestation_expired, link_broken, cutoff_passed, integration_disconnected
  - discount_mechanism: promo_code, price_option, separate_product, manual_price, quote_code
  - discount_input_mode: deal_price, percentage
  - capacity_mode: live_provider, live_provider_capped, manual_count
  - booking_destination_type: provider_booking_page, operator_website, phone, email
  - price_option_type: adult, child, infant, senior, student, family, group, per_unit
  - rule_type: daily, weekly, specific_dates
  - integration_status: not_connected, connecting, connected, degraded, error, disconnected
  - user_role: owner, manager, staff
  - cancellation_policy_type: non_refundable, operator_standard, custom
  - category: tour, adventure, water, cruise, food_wine, attraction, wellness, accommodation, rental, transport, other
  - fitness_level: easy, moderate, challenging, extreme
  - link_status: unchecked, ok, broken
  - session_status: live, sold_out, cancelled, expired
  - original_price_source: provider, operator_entered
  - media_type: image, video_embed; media_source: upload, provider
  - attestation_method: dashboard, email_link, sms_link
  - actor_type: user, system, admin
  - recheck_result: available, sold_out, error
  - auth_type: api_key, oauth, marketplace
  - sync_mode: webhook, polling, hybrid
  - conversion_tracking_method: none, promo_code, booking_source, webhook
  - sync_type: full, incremental, webhook, click_recheck, manual
  - account_status: pending_verification, active, suspended
  - invite_status: pending, accepted, revoked
  - compliance_doc_type: public_liability_insurance, adventure_activities_certificate, maritime_licence, business_licence, food_licence, other
  - review_status: pending, approved, rejected, expired
  - billing_model: subscription, per_click, commission
- Helper groupings: `INTEGRATED_DEAL_TYPES`, `MANUAL_DEAL_TYPES`, `INTEGRATED_MECHANISMS = [promo_code, price_option, separate_product]`, `MANUAL_MECHANISMS = [manual_price, quote_code]`, `AUTO_RESUME_REASONS = [sync_failure, integration_disconnected, attestation_expired, link_broken]`.

**Test it:** run the test suite; add a small test that imports every enum and constant and checks the defaults above.

**Done when:** nothing else in the codebase hard-codes 50, 72, 12 or 15 for these purposes.

---

## Chunk 2. Operator, defaults and team tables

**Goal:** the tables every deal hangs off. All tables get `id` uuid, `created_at`, `updated_at`.

**Operator:** legal_name, trading_name, slug (unique), logo, cover_image, short_description (≤160), long_description (≤3,000), website, public_email, public_phone, internal_email, internal_phone, address, regions_served string[], timezone (default Pacific/Auckland), currency (default NZD), languages string[], gst_number, nzbn, social_links json, account_status (pending_verification|active|suspended), requires_manual_review bool default false (admin-only).

**OperatorBookingDefaults** (one row per operator, created automatically with the operator): default_sales_cutoff_minutes (0–1440), default_seat_cap (1–999, nullable), default_discount_pct (≥ MIN_DISCOUNT_PCT), default_discount_mechanism, default_booking_destination_type, default_booking_url, default_booking_phone, default_booking_email, default_booking_instructions (≤300), default_cancellation_policy_type, default_cancellation_policy_text (≤1,000), default_attestation_reminder_hours (default 2).

**TeamMember:** operator_id, user_id (nullable until invite accepted), role (owner|manager|staff), invited_email, invite_status (pending|accepted|revoked), invited_at, last_active_at. Unique (operator_id, user_id).

**Rules:** an operator must always have at least one accepted owner (enforce in a service function used by later chunks; add a test).

**Test it:** run migrations; seed one operator with an owner; check the defaults row was created automatically.

---

## Chunk 3. Deal table

**Goal:** the main Deal table. Drafts may be saved incomplete, so DB columns for "Req" fields are nullable; required-ness is enforced by publish validation later (Chunk 16).

**Table name:** `marketplace.operator_deals` (not `marketplace.deals` — that is the legacy org-scoped feed). Spec §3.1 documents this.

**Fields:** operator_id fk, deal_type, source_provider, integration_id fk nullable, external_product_id fk nullable, deal_rule_id fk nullable, status (default draft), pause_reason nullable, pause_detail text, title (10–80), slug (unique, system), summary (20–160), description rich text (100–5,000; allow bold, lists, links only; sanitise on save), category, tags string[] (max 10), highlights string[] (max 6, each ≤80), inclusions/exclusions/what_to_bring string[] (max 15 each), duration_minutes (15–20,160), duration_label, location_name, address, latitude, longitude, region, meeting_point_notes (≤500), pickup_available bool default false, pickup_notes (≤500), min_age (0–99), age_notes, fitness_level, wheelchair_accessible bool, accessibility_notes (≤500), languages string[] (ISO 639-1), weather_dependent bool, weather_notes, cancellation_policy_type, cancellation_policy_text (≤1,000), important_info (≤1,000), overridden_fields string[] default [], currency (3 chars), discount_mechanism, promo_code (3–30, `^[A-Z0-9_-]+$`), discount_input_mode default deal_price, stepped_discount_enabled bool default false, capacity_mode, seat_cap (1–999), min_booking_qty, max_booking_qty, booking_destination_type, booking_url, booking_phone, booking_email, booking_instructions (≤300), append_tracking_params bool default true, link_status default unchecked, link_last_checked_at, link_consecutive_failures int default 0, publish_at, sales_cutoff_minutes (0–1440), last_attested_at, attestation_expires_at, published_at, ended_at, first_published_at, created_by, updated_by.

**Indexes:** (operator_id, status), (integration_id, status), slug unique.

**Also:** write a field-level validator (lengths, formats, ranges above) that runs on every save, separate from the publish validator. It returns `{field, message}` errors.

**Test it:** tests for each length/range limit and the promo code regex.

---

## Chunk 4. Sessions, price options, discount steps

Parent Deal table is `marketplace.operator_deals` (see Chunk 3 / spec §3). Child tables: `marketplace.deal_sessions`, `deal_price_options`, `discount_steps`.

**DealSession:** deal_id fk → `operator_deals` (cascade), external_session_id fk nullable, start_at (UTC), end_at nullable, provider_seats_available int nullable, manual_seats_available int (0–999) nullable, seat_cap nullable, seats_displayed int (system), status (live|sold_out|cancelled|expired, default live), last_synced_at.
- Add a pure function `computeSeatsDisplayed(session, deal)` = min(available, session.seat_cap ?? deal.seat_cap ?? ∞) where available is provider_seats_available for integrated deals and manual_seats_available for manual. Never below 0. Recompute on every save.

**DealPriceOption:** deal_id fk → `operator_deals`, label, type (price_option_type), external_price_option_id, external_deal_price_option_id, original_price_minor int, original_price_source, original_price_evidence_url, deal_price_minor int, discount_pct decimal (system, computed), sort_order.

**DiscountStep:** deal_id fk → `operator_deals`, price_option_id fk, hours_before_start (1–72), deal_price_minor, promo_code, external_deal_price_option_id.

**Test it:** tests for computeSeatsDisplayed with and without caps, manual vs integrated.

---

## Chunk 5. Media table

**DealMedia:** deal_id fk, media_type (image|video_embed), source (upload|provider), storage_key, url, is_cover bool, sort_order, alt_text (5–150), caption (≤150), width, height, focal_x, focal_y (0–1), file_size_bytes.

**Rules (DB/service level):** max 12 images per deal; exactly one is_cover per deal once any image exists (setting a new cover unsets the old one in the same transaction; deleting the cover promotes the first by sort_order); video_embed URLs must be YouTube or Vimeo.

**Test it:** tests for the cover swap, cover promotion on delete, and the 12-image limit.

---

## Chunk 6. Audit, attestation, click, metrics, template tables

- **DealEvent:** deal_id, event_type (string: created, updated, published, scheduled, submitted_for_review, approved, rejected, paused, auto_paused, resumed, auto_resumed, sold_out, expired, ended, archived, price_changed, seats_changed, session_added, session_removed, attested, link_broken, link_ok), actor_type (user|system|admin), actor_id nullable, detail json (include from_status, to_status, reason where relevant). Append-only: no update or delete.
- **DealAttestation:** deal_id, attested_by (user nullable, for token-based), attested_at, method (dashboard|email_link|sms_link), seats_by_session json `{session_id: seats}`.
- **ClickEvent:** deal_id, deal_session_id, click_id (unique), visitor_id, recheck_result (available|sold_out|error), redirect_url, created_at.
- **DealMetricDaily:** deal_id, date, impressions, detail_views, booking_clicks, sold_out_on_click, attributed_bookings, attributed_revenue_minor. Unique (deal_id, date).
- **DealTemplate:** operator_id, name, payload json.

**Test it:** migration runs; a test that DealEvent rows cannot be updated through the model/service.

---

## Chunk 7. Integration and auto-deal rule tables

- **Integration:** operator_id, provider (source_provider minus manual), status (default not_connected), auth_type, credentials_ref (string pointer to encrypted secret, never the secret), external_account_id, external_account_name, sync_mode, poll_interval_seconds, webhook_secret_ref, webhook_last_received_at, last_sync_at, last_successful_sync_at, last_error_code, last_error_message, default_booking_destination_type, booking_base_url, conversion_tracking_method default none, booking_source_label, auto_enable_new_products bool default false, connected_at, connected_by. Unique (operator_id, provider) where status ≠ disconnected.
- **ExternalProduct:** integration_id, external_id, name, description, images json, duration_minutes, location json, price_options json, is_enabled_for_deals bool default false, archived_in_provider bool default false, raw_payload json, last_synced_at. Unique (integration_id, external_id).
- **ExternalSession:** external_product_id, external_id, start_at, end_at, seats_available, total_capacity, status, prices json, last_synced_at. Unique (external_product_id, external_id).
- **SyncLog:** integration_id, sync_type, status (running|success|failed), started_at, finished_at, items_processed, error_code, error_message, affected_deal_ids uuid[].
- **DealRule:** operator_id, integration_id, external_product_id, name, is_active, rule_type, days_of_week int[] (0–6), specific_dates date[], session_times string[] ("HH:MM"), list_hours_before_start (1–72), min_unsold_seats (≥1), seat_cap, price_config json, discount_mechanism, promo_code, template_deal_id fk Deal, auto_publish bool, start_date, end_date, last_run_at, next_run_at.

**Also:** a secrets helper `storeSecret(value) → ref`, `readSecret(ref)`, `deleteSecret(ref)` using whatever secure store the project has (or encrypted column with a key from env). Ensure API serializers never include credentials_ref or webhook_secret_ref.

**Test it:** a serializer test proving secrets refs are never returned.

---

## Chunk 8. Remaining settings tables and seed data

- **NotificationPreference:** user_id, operator_id, event_type, email, sms, in_app. Unique (user_id, operator_id, event_type).
- **ComplianceDocument:** operator_id, doc_type, file (storage key), issuer, reference_number, issued_on, expires_on, review_status (default pending), reviewer_notes.
- **BillingAccount:** operator_id, plan, billing_model, commission_pct, billing_email, payment_method_ref, status.

**Seed data** (dev only):
- Operator A "Harbour Kayaks" (manual, no integration) with an owner, a manager and a staff user.
- Operator B "Bay Cruises" with an Integration row for provider `rezdy` in status not_connected.
- Platform region list (e.g. Auckland, Northland, Waikato, Bay of Plenty, Rotorua, Taupō, Hawke's Bay, Wellington, Nelson Tasman, Marlborough, Canterbury, West Coast, Otago, Queenstown, Southland) as a constant or table.

**Test it:** reset DB and seed; log in as each seeded user.

---

## Chunk 9. Roles and permissions guard

**Goal:** one server-side permission check used by every operator endpoint.

**Build:** `can(user, operatorId, action)` with actions:
- `inventory.read` → owner, manager, staff
- `inventory.write` → owner, manager
- `settings.integrations`, `settings.defaults`, `settings.team`, `settings.compliance`, `settings.profile.write` → owner, manager
- `settings.profile.read` → all
- `settings.notifications.own` → all
- `settings.billing`, `settings.account` → owner only
- `admin.*` → platform admin only (separate flag on User)

Return 403 with a clear message when denied. Add middleware/helper to apply it to routes.

**Test it:** a test matrix of role × action.

---

## Chunk 10. Pricing maths and the 50% rule

**Goal:** pure, well-tested functions. No DB.

- `maxDealPrice(originalMinor)` = floor(originalMinor × (1 − MIN_DISCOUNT_PCT/100)).
- `meetsMinDiscount(originalMinor, dealMinor)` = dealMinor ≤ maxDealPrice(originalMinor) and dealMinor ≥ 0 and originalMinor > 0.
- `discountPct(originalMinor, dealMinor)` = round((1 − deal/original) × 100, 1 dp).
- `priceFromPercentage(originalMinor, pct)` = round to nearest cent, then if it fails the rule, floor instead (so a valid percentage never produces an invalid price).
- `validateSteps(steps, option)` for stepped discounts: sorted by hours_before_start descending, each price ≤ previous step (and ≤ base deal price), each meets the rule, promo codes distinct.
- On every DealPriceOption save, compute and store discount_pct.

**Test it:** cases: $100 → $50 passes, $50.01 fails; $99.99 at 50% = $49.99; percentage 49% rejected; steps increasing in price rejected; zero original rejected.

---

## Chunk 11. Deal event logger and status transition function

**Goal:** the only way status ever changes.

**Build:**
- `logDealEvent(dealId, eventType, actor, detail)`.
- `transitionDeal(dealId, toStatus, {actor, reason?, detail?})`:
  - Allowed transitions only:
    draft→pending_review, draft→scheduled, draft→live, pending_review→scheduled, pending_review→live, pending_review→draft (rejected), scheduled→live, scheduled→paused, live→paused, paused→live, live→auto_paused, auto_paused→live, live→sold_out, sold_out→live, live/sold_out/auto_paused/paused/scheduled→expired, any except archived→ended, expired/ended→archived.
  - Throws a typed error on anything else.
  - Sets pause_reason/pause_detail when entering paused (reason=operator) or auto_paused (given reason); clears them when leaving.
  - Sets published_at and first_published_at on first entry to live or scheduled; ended_at on ended.
  - Writes a DealEvent with from/to/reason in one transaction.
- `applyAutoPause(dealId, reason, detail)` and `clearAutoPause(dealId, reason)` (only resumes if the deal is auto_paused for that same reason and the reason is in AUTO_RESUME_REASONS; re-runs publish validation before going live).
- Make `status`, `pause_reason`, `pause_detail` read-only in all client-facing update APIs.

**Test it:** tests for every allowed and one disallowed transition; DealEvent written each time; client update ignoring status.

---

## Chunk 12. Deal draft API (create, update, duplicate)

**Endpoints** (adapt to project style), all requiring `inventory.write` (GET requires `inventory.read`):
- `POST /operators/:id/deals` with `{deal_type}` (+ optional `template_id` or `duplicate_of`). Creates a draft:
  - source_provider = manual for manual types.
  - capacity_mode = manual_count for manual types.
  - Pre-fill from OperatorBookingDefaults: sales_cutoff_minutes, seat_cap, discount_mechanism (if valid for type), booking destination fields, booking_instructions, cancellation policy. Currency from operator.
  - Log `created`.
- `GET /deals/:id` returns deal with sessions, price options, steps, media, and a `validation` block (from Chunk 16 once built; return empty for now).
- `PATCH /deals/:id` partial update; runs field-level validator; rejects deal_type change if first_published_at is set; rejects mechanism not valid for type; regenerates slug when title changes while still draft (keep unique with suffix). Log `updated` with changed field names.
- `POST /deals/:id/duplicate` copies content, media references, price options, booking destination; not sessions, attestations, status or stats. New draft titled "Copy of …".
- `DELETE /deals/:id` only for drafts that were never published.

**Test it:** create a manual_session draft as manager (works) and staff (403); check defaults pre-filled; try changing status via PATCH (ignored); duplicate and confirm no sessions copied.

---

## Chunk 13. Sessions and price options API (manual)

**Sessions:**
- `POST/PATCH/DELETE /deals/:id/sessions`.
- manual_session: start_at required (future), manual_seats_available 0–999.
- manual_open_window: one row per day; max 3 days; start_at = start of that day's window in operator timezone converted to UTC (default 00:00), end_at = end of window (default 23:59); manual_seats_available per day; no duplicate days.
- Recompute seats_displayed on save. Log `session_added`, `session_removed`, `seats_changed`.
- When the deal is live, changes re-run publish validation (Chunk 16) and return warnings; the client must resend with `confirm: true` to save.

**Price options:**
- `POST/PATCH/DELETE /deals/:id/price-options`.
- Manual: original_price_minor editable, original_price_source = operator_entered, original_price_evidence_url required on publish (https).
- Accept either deal_price_minor or percentage (per discount_input_mode); always store deal_price_minor using Chunk 10 functions; store discount_pct.
- Reject saves that fail the 50% rule with a clear error showing the maximum allowed deal price.
- Log `price_changed` with old/new. Same live-deal confirm behaviour as sessions.
- Reorder endpoint for sort_order.

**Test it:** add 3 open-window days (4th rejected); add an adult option $200 → $90 (passes), $110 (rejected with max $100 message); percentage 60% stores $80.

---

## Chunk 14. Media upload API

- Upload endpoint (multi-file): accept jpg/png/webp, ≤10 MB, min 1200×800 px. Read real dimensions server-side. Store via project storage. Reject with per-file errors.
- Add video embed by URL (YouTube/Vimeo only).
- Update alt_text, caption, focal point, set cover, reorder, delete.
- `importProviderImages(dealId)` stub for later (Chunk 32).
- Deal content/media edits on a live deal apply immediately (no confirm).

**Test it:** upload a small image (rejected), a large one (accepted), a 13th image (rejected); set cover twice and confirm only one cover.

---

## Chunk 15. Booking destination validation and link checker

- Validators: booking_url https only; booking_phone E.164 (e.g. +6421234567); booking_email valid.
- `checkLink(url)`: HEAD then GET fallback, follow redirects, timeout LINK_CHECK_TIMEOUT_MS; ok = final 2xx/3xx within time. Return `{ok, status, error}`.
- `runLinkCheck(dealId)`: for URL destinations, update link_status, link_last_checked_at, link_consecutive_failures. On second consecutive failure for a live deal → applyAutoPause(link_broken). On success for a deal auto_paused with link_broken → clearAutoPause.
- Also check original_price_evidence_url reachability (store result for the publish validator; doesn't auto-pause).
- `buildTrackedUrl(url, deal, clickId)`: append utm_source=<platform name>, utm_medium=referral, utm_campaign=<deal slug>, click_id. Preserve existing query params.
- `POST /deals/:id/test-link` returns the final tracked URL and check result.
- Background job: every 6 hours, check all live/scheduled/auto_paused(link_broken) deals with URL destinations.

**Test it:** unit tests with mocked HTTP for 200, 301→200, 404, timeout, two failures → auto_paused, then success → live.

---

## Chunk 16. Publish validation engine

**Goal:** `validateForPublish(deal) → { ok, checks: [{key, label, passed, message, editorStep}] }`, used by the editor checklist, publish actions and auto-resume.

**Checks (all deals):**
- `required_fields`: title, summary, description, category, location_name, address, lat/long, region, languages (≥1), cancellation_policy_type (+ text if custom), currency, discount_mechanism, discount_input_mode, capacity_mode, booking_destination_type + matching field, sales_cutoff_minutes, ≥1 price option, duration_minutes unless manual_open_window, pickup_notes if pickup_available, promo_code if promo_code/quote_code, seat_cap if live_provider_capped.
- `min_discount`: every price option and step passes Chunk 10.
- `images`: ≥1 image, exactly 1 cover, all have alt text.
- `session_timing`: ≥1 session with start_at − sales_cutoff_minutes in the future. Report whether any is within MAX_LEAD_HOURS (decides live vs scheduled).
- `booking_destination`: URL link_status ok (run check if unchecked/stale >6h) or valid phone/email.

**Manual only:** `price_evidence` (URL present and reachable), `seats_entered` (any session manual_seats_available > 0), `attestation` (checked at publish time; see Chunk 17).

**Integrated only:** stub checks returning "not yet built" so they exist in the list; Chunk 35 fills them in.

**Optional:** if ENFORCE_COMPLIANCE_ON_PUBLISH, required compliance docs not expired.

editorStep values: type, content, images, pricing, availability, destination, review.

Add the validation block to `GET /deals/:id`.

**Test it:** a seeded incomplete draft returns each failing check with the right editorStep; a complete one passes.

---

## Chunk 17. Publish, schedule, review and attestation

**Endpoint:** `POST /deals/:id/publish` with `{attest: true}` for manual deals.
1. Run validateForPublish; if any fail, return 422 with checks.
2. Manual: require attest=true. Create DealAttestation (method dashboard, seats_by_session snapshot); set last_attested_at=now, attestation_expires_at=now+MANUAL_ATTESTATION_HOURS. Log `attested`.
3. Review needed if operator.requires_manual_review, or deal is manual and the operator has fewer than MANUAL_REVIEW_COUNT manual deals ever approved → transition to pending_review, log `submitted_for_review`, notify admins (simple hook for now).
4. Otherwise: if publish_at in future, or no session within MAX_LEAD_HOURS → scheduled. Else → live.
5. Trigger link check on publish.

**Admin endpoints:** `POST /admin/deals/:id/approve` → re-validate then scheduled/live as in step 4; `POST /admin/deals/:id/reject {notes}` → back to draft with pause_detail holding the notes; `POST /admin/operators/:id/manual-review {on|off}`; `POST /admin/deals/:id/pause {detail}` (reason admin, no auto-resume).

**Response tells the client which button label applies:** "Publish", "Schedule" or "Submit for review" (also expose this on GET so the editor shows the right button before clicking).

**Test it:** new manual operator's first deal → pending_review; approve → live (session tomorrow) or scheduled (session in 5 days); 4th manual deal → straight to live.

---

## Chunk 18. Status ticker job

Runs every minute. Idempotent. Uses transitionDeal for every change.
- scheduled → live when (publish_at null or ≤ now) and a sellable session starts within MAX_LEAD_HOURS and validateForPublish passes.
- Per session: if now ≥ start_at − sales_cutoff_minutes → session status expired.
- Deal: if every session is expired/cancelled → expired (from live, sold_out, auto_paused, paused, scheduled).
- live → sold_out when every non-expired session has seats_displayed = 0; sold_out → live when any non-expired session has seats > 0.
- Apply current discount step (Chunk 43 fills this; leave a hook).
- expired/ended → archived after ARCHIVE_AFTER_DAYS.
- Traveller visibility helper `isVisibleToTravellers(deal)` = status live and has a session starting within MAX_LEAD_HOURS and not past cutoff. Use it in all public queries.

**Test it:** tests with a fake clock covering each rule; run the job twice and confirm no duplicate events.

---

## Chunk 19. Operator actions (pause, resume, end, seats, bulk)

Endpoints (inventory.write):
- `POST /deals/:id/pause` → paused (reason operator).
- `POST /deals/:id/resume` → re-run validateForPublish; if passes → live (or scheduled if nothing within 72 h); else 422 with checks. Manual deals with expired attestation require attest=true in the body (creates attestation).
- `POST /deals/:id/end` → ended.
- `POST /deals/:id/archive` (expired/ended only).
- Manual only: `POST /deals/:id/seats {session_id: seats}` and `POST /deals/:id/mark-sold-out` (sets all sessions' manual seats to 0 → sold_out). Log seats_changed.
- Bulk: `POST /operators/:id/deals/bulk {action: pause|resume|end|mark_sold_out, deal_ids, confirm}` — pause requires confirm=true; returns per-deal result `{id, ok, error}`; mark_sold_out skips integrated deals with an error.

**Test it:** bulk pause 3 deals (one already ended → that one fails, others succeed); resume with an expired manual attestation without attest → 422.

---

## Chunk 20. Attestation expiry, reminders and quick-update token

- Job every minute:
  - Live manual deals past attestation_expires_at → applyAutoPause(attestation_expired, "Seats not reconfirmed in 12 hours").
  - Manual deals whose attestation_expires_at is within default_attestation_reminder_hours (default 2) and no reminder sent for this attestation → send reminder (email + SMS via notification service; stub sending if none yet) containing a quick-update link. Track sent reminders to avoid duplicates.
- Quick-update token: signed, single-use per submission, scoped to operator, expires at the latest attestation_expires_at of the included deals (min 2 h from issue). Store token hash, used_at.
- `GET /quick-update/:token` (no login) → list of the operator's live/auto_paused(attestation_expired) manual deals with sessions and current seats.
- `POST /quick-update/:token {deals: [{deal_id, action: still_available|sold_out, seats_by_session}]}` → for still_available: update seats, create DealAttestation (method email_link or sms_link per link source), reset expiry, clearAutoPause(attestation_expired). For sold_out: seats to 0. Mark token used.
- Dashboard reattest: `POST /deals/:id/attest {seats_by_session}` (method dashboard).

**Test it:** fake clock: publish manual deal, advance 10 h → reminder sent once; advance 12 h → auto_paused; use token → live again; reuse token → rejected.

---

## Chunk 21. Deals list API

`GET /operators/:id/deals` (inventory.read) with:
- `tab`: live | scheduled | needs_attention (auto_paused, pending_review, or manual live with attestation_expires_at within 2 h) | paused | drafts | sold_out | past (expired, ended, archived).
- Filters: deal_type, source_provider, external_product_id, category, date range (on next session start). Search: title (case-insensitive contains). Pagination and sort (default next session soonest).
- Each row: id, cover thumbnail url, title, deal_type, source_provider, from_rule bool, next session start (operator timezone + UTC), lowest-option original and deal price, discount_pct, seats_displayed (next session), cutoff_at (for countdown), status, pause_reason, pause_detail, clicks_today (from ClickEvent), allowed row actions for this user.
- `tab_counts` for all tabs in the same response.
- `banners`: integrations with status error/disconnected or stale sync ("{Provider} sync failing since {time}; {n} deals hidden", fix link to integration settings); manual attestations due within 2 h ("{n} deals need reconfirming", fix = reattest).
- `GET /operators/:id/deals/calendar?from=` → 3 days of sessions grouped by local day with deal summary per session.
- Empty state flags: `has_any_deals`, `has_integration`.

**Test it:** seed deals in several states and check counts and tab contents match; staff sees no write actions.

---

## Chunk 22. Wire deal editor (manual)

Wire the existing editor screens (from screenshots) to Chunks 12–17. No new visual design.
- Step 1: deal type choice (integrated options disabled with link to Settings if no connected integration); start from template or duplicate.
- Step 2: content fields bound to PATCH with debounce autosave; live character counters matching the limits; field errors from the server shown inline.
- Step 3: images per Chunk 14.
- Step 4: price table with live discount % and pass/fail per row (client calc mirrors Chunk 10, server is final); deal-price/percentage toggle; evidence URL.
- Step 5: sessions (manual_session) or up to 3 days (open window) with seats; sales cutoff; publish at; min/max group size.
- Step 6: destination type and field; instructions; tracking toggle; Test link (opens returned URL in new tab).
- Step 7: preview; checklist from the validation block with "Fix" jumping to editorStep; attestation checkbox for manual; button label from server (Publish / Schedule / Submit for review).
- Summary sidebar: lowest price, discount %, session count, validation status.
- Live deals: pricing/session/destination edits show the server's warnings and require confirm.

**Test it:** create a manual deal end to end on phone and desktop; break the price on purpose and see the checklist point to Pricing.

---

## Chunk 23. Wire deals list

Wire the existing list screen to Chunk 21 and actions in Chunk 19: tabs with counts, table and 3-day calendar views, filters, search, columns, countdown to cutoff (client-side tick from cutoff_at), pause-reason tooltip, row actions (only those the API says are allowed), inline Update seats and Mark sold out for manual, bulk actions with the pause confirmation, banners with fix buttons, empty state.

**Test it:** pause a deal and watch it move tabs; staff user sees read-only.

---

## Chunk 24. Wire quick-update mobile page

Wire the existing mobile reconfirm page to Chunk 20: load by token, seat stepper per session/day, Still available and Sold out buttons per deal, success state, clear message for expired or used tokens with a link to log in.

**Test it:** trigger a reminder in dev, open the link on your phone, reconfirm, check the deal is live in the dashboard.

---

## Chunk 25. Templates

- `POST /deals/:id/save-as-template {name}` → DealTemplate payload: content fields, media references, price options (labels, types, original prices, deal prices or percentage), discount mechanism, booking destination and defaults. Never sessions or attestations.
- `GET/PATCH(rename)/DELETE /operators/:id/templates`.
- `POST /operators/:id/templates/:tid/create-deal` → new draft from payload (then defaults fill gaps).
- Wire the Templates screen.

**Test it:** save a deal as template, create a deal from it, confirm no sessions and status draft.

---

## Chunk 26. Provider adapter interface and mock provider

**Interface `ProviderAdapter`:**
- `connect(credentialsInput) → {external_account_id, external_account_name, credentials_ref}`
- `testConnection(integration) → {ok, error?}`
- `listProducts(integration) → NormalisedProduct[]` (external_id, name, description, images[], duration_minutes, location, price_options[{external_id, label, type, price_minor, currency}], archived)
- `listSessions(integration, productExternalId, from, to) → NormalisedSession[]` (external_id, start_at, end_at, seats_available, total_capacity, status, prices)
- `getAvailability(integration, productExternalId, sessionExternalId, {timeoutMs}) → {seats_available, status}`
- `verifyDiscount(integration, {mechanism, promo_code?, external_deal_price_option_id?, expected_price_minor}) → {status: verified|not_found|cannot_verify, actual_price_minor?}`
- `buildBookingUrl(integration, product, session?, promo_code?) → url`
- `capabilities() → {webhooks_availability, promo_code_verify, deep_link_session, deep_link_promo, min_poll_seconds, max_poll_seconds}`
- `handleWebhook(request) → events[]` (optional)

**Registry:** `getAdapter(provider)`; unknown provider → error. FareHarbor, Bókun, Checkfront registered as "coming soon" (throw not implemented, capabilities flag `available:false`).

**Mock adapter** (dev/test only, provider value can reuse rezdy in tests or a `mock` flag): returns 2 products with sessions over the next 3 days and lets tests change seats, cancel sessions, change prices and simulate timeouts/errors.

Normalise all money to minor units and times to UTC inside adapters.

**Test it:** contract tests that any adapter passes (run against mock now, Rezdy later).

---

## Chunk 27. Connect, test and disconnect integrations

Endpoints (settings.integrations):
- `GET /operators/:id/integrations` → card per provider: status, account name, last_successful_sync_at, available flag.
- `POST /operators/:id/integrations/:provider/connect` → status connecting → adapter.connect → store credentials_ref → connected, connected_at/by, sync_mode/poll_interval from capabilities → kick off full sync. On failure → error with readable message.
- `POST .../test` → adapter.testConnection.
- `GET .../disconnect-preview` → count of deals that will be paused.
- `POST .../disconnect {confirm}` → status disconnected, delete secret, applyAutoPause(integration_disconnected) to all its live/scheduled deals.
- On reconnect + successful sync → clearAutoPause(integration_disconnected).
- `PATCH .../settings` → sync_mode, poll_interval_seconds (clamped to adapter min/max), default booking destination, booking_base_url, conversion_tracking_method, booking_source_label, auto_enable_new_products.

**Test it:** with the mock adapter: connect, check sync starts; disconnect with 2 live deals → both auto_paused; reconnect → live after sync.

---

## Chunk 28. Sync engine and sync log

- `runSync(integrationId, type)`: create SyncLog (running); listProducts → upsert ExternalProduct (set archived_in_provider; new products enabled only if auto_enable_new_products); for enabled products, listSessions for now → now+MAX_LEAD_HOURS+24h buffer → upsert ExternalSession; mark missing sessions cancelled. Update last_sync_at always, last_successful_sync_at on success, last_error_* on failure. Record items_processed and affected_deal_ids. Finish log.
- After upsert, update linked DealSessions: provider_seats_available, last_synced_at, recompute seats_displayed. Then hand off to Chunk 35 hooks (price and cancellation checks).
- Never overwrite deal content fields listed in overridden_fields (content refresh happens in Chunk 32).
- Scheduler: poll each connected integration every poll_interval_seconds; webhook endpoint per provider that verifies signature (webhook_secret_ref), updates webhook_last_received_at and runs an incremental sync for affected products.
- Endpoints: `POST .../resync`, `POST .../products/refresh`, `PATCH .../products/:pid {is_enabled_for_deals}`, `GET .../products` (name, price range, sessions in next 72 h, enabled, last synced), `GET .../sync-log` (filter by status/type, readable error, affected deals).
- Rate-limit and retry with backoff; one sync per integration at a time (lock).

**Test it:** mock: change seats → DealSession updates after sync; failing adapter → SyncLog failed with message.

---

## Chunk 29. Stale-sync monitor and integration auto-pause

Job every minute:
- For each connected integration: if last_successful_sync_at older than SYNC_STALE_MINUTES → set status degraded, applyAutoPause(sync_failure, "Rezdy hasn't synced since {local time}") to all its live deals; notify (event integration_sync_failing, once per incident).
- If status error/disconnected → applyAutoPause(integration_disconnected).
- When a sync succeeds again → status connected, clearAutoPause(sync_failure) for its deals (re-validates first).

**Test it:** fake clock with mock adapter failing for 16 minutes → deals auto_paused with banner in list; adapter recovers → deals live.

---

## Chunk 30. Rezdy research (answer open decisions)

**Goal:** no code. Research and write answers into section 7 of `docs/deals-spec.md`.

Using the current Rezdy API documentation (Supplier API and/or marketplace/agent API, whichever applies to a referral marketplace partner), answer:
1. Auth method for a partner like us (API key per supplier vs marketplace connection) and how an operator grants access.
2. Rate limits → minimum safe poll interval.
3. Endpoints for products, sessions/availability and prices; how price options map to our price_option_type.
4. Do webhooks cover availability changes or only bookings? → choose sync_mode (hybrid vs polling).
5. Can promo codes be read or validated via API?
6. Can a booking page URL pre-select a session and/or apply a promo code? Give the URL format.
7. Can bookings be tagged with a source label we can read back for conversion tracking?

Then fill in the Rezdy adapter `capabilities()` values you'd use and list anything the spec assumes that Rezdy can't do, with a suggested workaround.

**Test it:** read the updated section 7 and decide anything flagged before Chunk 31.

---

## Chunk 31. Rezdy adapter

Implement `RezdyAdapter` against the `ProviderAdapter` interface (Chunk 26) using the answers in spec section 7.
- connect/testConnection with the chosen auth method; credentials only via secrets helper.
- listProducts, listSessions, getAvailability (honour timeoutMs), verifyDiscount (return cannot_verify where the API can't confirm), buildBookingUrl (session and promo deep links where supported, else product page).
- Webhook handler if supported, with signature check.
- Map Rezdy fields to normalised shapes; money to minor units; times to UTC.
- Respect rate limits with a shared throttle and backoff.
- Run the adapter contract tests from Chunk 26 against recorded Rezdy fixtures (no live calls in CI). Add an optional manual script to hit a Rezdy sandbox/test account.

**Test it:** connect a real Rezdy test account in dev, refresh products, see sessions for the next 72 h.

---

## Chunk 32. Integrated deal creation and content overrides

- Creating an integrated_session or integrated_multi_session draft requires a connected integration and an enabled, non-archived ExternalProduct. Set source_provider, integration_id, external_product_id, capacity_mode default live_provider.
- Pre-fill from the product: title, description (also derive summary from first 160 chars if empty), duration_minutes, location fields, images (DealMedia source provider, first = cover), price options (one DealPriceOption per provider option: external_price_option_id, original_price_minor, original_price_source provider).
- Booking destination default: provider_booking_page with adapter.buildBookingUrl (or integration default).
- Content overrides: any PATCH to a pre-filled content field adds it to overridden_fields; `POST /deals/:id/revert-field {field}` restores the provider value and removes it from overridden_fields. GET returns `provider_values` and `overridden_fields` so the UI can show "From Rezdy" with Override/Revert.
- Sync refresh: on product sync, update non-overridden content fields of draft/scheduled/live deals for that product.
- Wire editor Step 1 product picker (searchable, thumbnail, price) and Step 2 labels.

**Test it:** create from a mock product; override title; resync → title kept, description updated; revert title → provider title back.

---

## Chunk 33. Integrated pricing and discount verification

- original_price_minor on integrated options is read-only (reject PATCH) and always equals the provider's current price.
- discount_mechanism must be promo_code, price_option or separate_product.
  - price_option: operator selects the provider's discounted option (list from product price_options); store external_deal_price_option_id; deal_price_minor = that option's provider price (read-only).
  - promo_code: operator enters code and deal price; call adapter.verifyDiscount.
  - separate_product: operator selects a second ExternalProduct whose price is the deal price (store reference in external_deal_price_option_id as `product:<id>` or add a column, your choice; document it in the spec).
- `POST /deals/:id/verify-discount` → status verified | not_found | cannot_verify per option. If cannot_verify, require `promo_code_confirmed_by_operator=true` (add boolean column) and a successful Test link before publish.
- All prices still must pass the 50% rule.
- Wire editor Step 4 for integrated (read-only originals, mechanism picker, verification status text: "Verified in Rezdy", "Not found", "Can't verify; confirm manually").

**Test it:** mock: price_option at 55% off → verified; change provider original price lower in mock → verify fails with message.

---

## Chunk 34. Integrated availability and capacity

- `GET /deals/:id/available-sessions` → ExternalSessions for the product in the next MAX_LEAD_HOURS with seats_available, status and last_synced_at.
- integrated_session: exactly one session selected. integrated_multi_session: one or more. Each creates a DealSession with external_session_id and provider_seats_available.
- capacity_mode: live_provider (show all) or live_provider_capped (seat_cap 1–999, per-session override allowed). Include API note text: "A cap is display-only unless your promo code has a matching usage limit."
- seats_displayed recomputed on every sync.
- Wire editor Step 5 for integrated.

**Test it:** multi-session with 3 sessions, cap 4 on one with 10 seats → shows 4; mock sells out one session → that session sold_out, deal stays live.

---

## Chunk 35. Integrated publish checks and provider-driven auto-pauses

Fill the integrated checks in validateForPublish (Chunk 16):
- `integration_healthy`: status connected and last_successful_sync_at within SYNC_STALE_MINUTES.
- `product_active`: enabled and not archived.
- `original_price_locked`: each option's original_price_minor equals current provider price.
- `discount_in_provider` (price_option): discounted option exists and its price equals deal_price_minor.
- `promo_code_confirmed` (promo_code): verified, or operator-confirmed + Test link passed.
- `session_available`: each selected session exists, not cancelled, seats > 0 (at least one for multi).

Sync hooks (called by Chunk 28 after each sync):
- Session cancelled/removed → DealSession cancelled; if none sellable remain → applyAutoPause(session_cancelled) (no auto-resume). Product archived → same for all its deals.
- Provider original or discounted price changes so any option fails 50% (or discounted price ≠ deal_price_minor) → update original_price_minor, applyAutoPause(price_below_threshold) with detail naming the option (no auto-resume; operator fixes pricing and resumes).
- Notify deal_auto_paused with reason.

**Test it:** mock: cancel a session → auto_paused session_cancelled; raise discounted option price → auto_paused price_below_threshold; fix and resume → live.

---

## Chunk 36. Book now click flow and tracking

Public endpoint `POST /deals/:slug/book {session_id, visitor_id}`:
1. Create ClickEvent with unique click_id.
2. If deal not visible (isVisibleToTravellers) → return `{outcome: unavailable}` with other live deals nearby (same region, soonest first, max 4).
3. Integrated and CLICK_RECHECK: adapter.getAvailability with CLICK_RECHECK_TIMEOUT_MS.
   - Seats > 0 → update cache, recheck_result available → `{outcome: redirect, url, instructions}`.
   - 0 → session sold_out (deal sold_out if none left), recheck_result sold_out → `{outcome: just_sold_out, alternatives}`.
   - Timeout/error → recheck_result error; if DealSession.last_synced_at under CACHED_AVAILABILITY_MAX_AGE_MINUTES and seats > 0 → redirect; else `{outcome: cannot_confirm, operator contact (public phone/email/website), message: "We couldn't confirm live availability"}`.
   - Write a SyncLog row of type click_recheck.
4. Manual: attestation current and seats > 0 → `{outcome: show_instructions, booking_instructions, destination}`; else unavailable.
5. URL destinations: use adapter.buildBookingUrl for provider pages, then buildTrackedUrl if append_tracking_params. Phone → tel: link, email → mailto: link.
6. Store redirect_url on the ClickEvent.
- Rate-limit by visitor_id/IP.

**Test it:** mock: available → redirect URL has utm params and click_id; sold out → alternatives; timeout with fresh cache → redirect; timeout with stale cache → contact details.

---

## Chunk 37. Integrations settings screens

Wire the existing Integrations screens to Chunks 27–29:
- Grid: Rezdy card live; FareHarbor, Bókun, Checkfront "Coming soon"; manual-operator explainer card when nothing connected.
- Provider detail: Connection (connect, account name, connected by/date, Test connection, Disconnect with deal count warning), Health (status, last successful sync, webhook last received, current error with plain-language fix text mapped from error codes), Products table (enable toggle, auto-enable toggle, Refresh), Sync (mode, interval within allowed range, Resync now), Booking links (default destination, base URL, Test link), Conversion tracking (method, booking source label), Sync log (filterable).

**Test it:** full connect → disable a product → resync → view log, all from the UI.

---

## Chunk 38. Business profile and deal defaults

- `GET/PATCH /operators/:id/profile`: all Operator fields with validation (short ≤160, long ≤3,000, URLs https, emails, phones E.164, timezone valid IANA, currency ISO 4217, languages ISO 639-1, regions from platform list). account_status and requires_manual_review are admin-only. Staff read-only.
- Logo/cover upload using the media pipeline.
- `GET /operators/:id/preview` → data for the public operator page.
- `GET/PATCH /operators/:id/booking-defaults`: all OperatorBookingDefaults fields; default_discount_pct ≥ MIN_DISCOUNT_PCT; mechanism must be valid for at least one deal type; response includes `note: "Changes apply to new deals only"`. Changing defaults never edits existing deals.
- Wire both screens.

**Test it:** change default cutoff to 120 → new deal has 120, old deals unchanged.

---

## Chunk 39. Notifications

- Event types: integration_sync_failing*, deal_auto_paused*, attestation_due*, booking_link_broken*, deal_review_update, deal_lifecycle, auto_rule_created_deals, daily_performance_summary, compliance_expiring* (* = mandatory, at least one channel must stay on).
- Defaults when a user joins an operator: integration_sync_failing email+sms+in_app; deal_auto_paused email+in_app; attestation_due email+sms; booking_link_broken email+in_app; deal_review_update email+in_app; deal_lifecycle in_app; auto_rule_created_deals in_app; daily_performance_summary email; compliance_expiring email.
- `GET/PATCH /operators/:id/notifications/me`: reject turning off the last channel on a mandatory event.
- `notify(operatorId, eventType, payload)`: finds members with preferences, sends via email/SMS/in-app providers (use project providers or stubs that log), dedupes per incident. Replace earlier stub calls (Chunks 17, 20, 29, 35) with this.
- In-app notifications table + list/mark-read endpoints if not present.
- Daily performance summary job (once per day, operator morning local time).
- Wire the grid screen.

**Test it:** try to switch off all channels for deal_auto_paused → error; trigger an auto-pause → notification arrives on chosen channels only.

---

## Chunk 40. Team

- `GET /operators/:id/team` → members with role, invite status, last active.
- `POST /operators/:id/team/invite {email, role}` → TeamMember pending + invite email with token; accept endpoint links the user.
- `PATCH /team/:mid {role}`, `DELETE /team/:mid`, `POST /team/:mid/resend`, `POST /team/:mid/revoke`.
- Enforce: always ≥1 accepted owner (block demoting/removing the last owner); only owners can create or change owners; managers can't change billing/account access.
- Update last_active_at on authenticated requests (throttled).
- Wire the Team screen.

**Test it:** try to remove the only owner → blocked; invite a staff user, accept, confirm read-only inventory.

---

## Chunk 41. Compliance documents

- CRUD `/operators/:id/compliance` with file upload (pdf, jpg, png ≤10 MB), doc_type, issuer, reference_number, issued_on, expires_on. New/changed docs → review_status pending.
- Admin: approve/reject with reviewer_notes.
- Daily job: reminders (compliance_expiring) at 30 and 7 days before expires_on (once each); mark expired after expires_on.
- If ENFORCE_COMPLIANCE_ON_PUBLISH: publish validation fails when a required document (configurable list, default public_liability_insurance) is missing or expired.
- Wire the Compliance screen.

**Test it:** fake clock: document expiring in 30 days → reminder; past expiry → expired status.

---

## Chunk 42. Billing and account

**Billing** (owner only): `GET /operators/:id/billing` → plan, billing_model, commission_pct (read-only), billing_email, payment method summary (from payment_method_ref via the billing provider; no card data stored), invoices fetched live from the billing provider with download links, current-period usage (booking clicks from ClickEvent for per_click; attributed bookings for commission). `PATCH` billing_email only. If no billing provider is set up yet, return stubbed invoices and say so in the response.

**Account** (owner for close; user for own login settings):
- Login email/password change via existing auth; SSO and 2FA via existing auth provider if present (otherwise leave a clear TODO in the spec).
- `POST /operators/:id/export` → CSVs for deals, DealMetricDaily, DealEvent; delivered as download.
- `POST /operators/:id/close {confirm_text}` (owner) → end all live/scheduled deals, disconnect integrations (deletes secrets), account_status suspended, log events.
- Wire both screens.

**Test it:** export CSVs and open them; close a seeded test operator and confirm deals ended and integrations disconnected.

---

## Chunk 43. Stepped discounts

- When stepped_discount_enabled: CRUD steps per price option (Chunk 4 table) using validateSteps (Chunk 10). Steps for promo_code need distinct codes; for price_option need external_deal_price_option_id; verify each via adapter.verifyDiscount for integrated deals.
- `currentPrice(option, session, now)` → the deepest step whose hours_before_start ≥ hours until start, else base deal price. Use it in public deal data, the list and the Book now flow (pass the step's promo code to buildBookingUrl).
- Status ticker hook: when a step activates, log price_changed (actor system) and refresh cached display price.
- Publish validation includes all steps in min_discount and discount_in_provider checks.
- Wire the stepped discount timeline in editor Step 4.

**Test it:** steps 50% @72h, 60% @24h, 70% @6h; fake clock at 30h, 20h, 5h → correct price and code each time.

---

## Chunk 44. Auto-deal rules

- CRUD `/operators/:id/deal-rules` per DealRule fields; integrated products only; template_deal_id must belong to the operator and the same product; price_config validated with Chunk 10 (per option deal price or percentage, optional steps).
- Runner job every 15 minutes: for each active rule within start/end date and matching day (daily / weekly days_of_week / specific_dates in operator timezone): find ExternalSessions for the product matching session_times (or all) starting in ≤ list_hours_before_start, with seats_available ≥ min_unsold_seats, and no existing non-ended deal for that session. Create an integrated_session deal copied from the template (content, images, booking destination), prices from price_config against current provider prices, seat_cap from rule, deal_rule_id set. If auto_publish → run publish flow; else leave in draft. Update last_run_at/next_run_at. Notify auto_rule_created_deals with count.
- Generated deals are independent after creation (editing/ending them doesn't touch the rule).
- `GET /deal-rules/:id/preview` → "With current {provider} availability, this rule would create N deals in the next 72 hours" plus the sessions.
- List response: name, product, schedule summary text (e.g. "Daily, 48 h before, 2pm sessions"), discount summary, active, deals generated last 7 days, next run.
- Deals list rows show from_rule. Wire the Auto-deal rules screens.

**Test it:** mock: rule 48 h before, min 2 seats → preview shows correct count; run job → deals created once (second run creates none).

---

## Chunk 45. Metrics rollup and deal stats

- Tracking endpoints (public): record impressions (deal card shown, batched) and detail_views (deal page opened). Booking clicks come from ClickEvent.
- Hourly job: aggregate into DealMetricDaily per deal per local day (impressions, detail_views, booking_clicks, sold_out_on_click, attributed_bookings, attributed_revenue_minor). Idempotent upsert.
- Attribution: depending on integration.conversion_tracking_method — promo_code (match provider bookings using the deal's code), booking_source (match source label), webhook (provider booking webhook with click_id); none → leave zero. Add adapter method `listBookings(integration, from, to)` for this.
- `GET /deals/:id/stats?from&to` → totals, CTR (clicks/detail views), per-day series, per-session table (time, seats displayed, last synced, status), activity log from DealEvent (actor, change, time in operator timezone).
- Wire the Deal detail and stats screen.

**Test it:** generate fake views and clicks, run the rollup, check the stats page matches.
