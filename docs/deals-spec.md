# Deals Platform: Operator Inventory & Settings Spec

> **Canonical reference.** Save this file in the repo at `docs/deals-spec.md`.
> Cursor must treat this as the source of truth for all data, rules and functions in the operator Inventory and Settings tabs. When a future change conflicts with this file, update this file in the same change.
> Visual design comes from the supplied screenshots, not this file.

---

## 1. Principles and shared enums

### Build principles
1. **Referral only.** The platform never takes payment or runs checkout. Every deal ends in a booking destination owned by the operator.
2. **Provider-agnostic.** Every deal has a `source_provider`. Rezdy is the first provider, not a special case. FareHarbor, Bókun and Checkfront must slot in through the same `Integration` and `ExternalProduct` tables and the provider adapter interface.
3. **Manual is first-class but guarded.** Operators with no booking system can list deals. Because their inventory cannot be verified live, manual deals carry extra safeguards (attestation expiry, review, quick sold-out controls).
4. **Server-side enforcement.** The 50% minimum discount, the 72-hour window and all auto-pause rules are enforced in the backend, never only in the UI.
5. **Fail closed.** If live data cannot be confirmed (sync failure, stale attestation, broken link), the deal hides. Showing stale last-minute inventory is the biggest trust risk.
6. **Time and money.** Store all times in UTC; display in the operator's timezone (default `Pacific/Auckland`). Store money as integer minor units (cents) with an ISO 4217 currency code (default `NZD`).

### Platform constants (admin-configurable)
Read from `web/lib/marketplace/config.ts` (`getPlatformConfig()` / `PLATFORM_DEFAULTS`). Never hard-code these elsewhere.

| Constant | Default | Meaning |
|---|---|---|
| `MIN_DISCOUNT_PCT` | 50 | Minimum discount off the verified original price, per price option |
| `MAX_LEAD_HOURS` | 72 | A deal is only visible to travellers when the experience starts within this many hours |
| `MANUAL_ATTESTATION_HOURS` | 12 | Manual deals auto-pause if the operator has not reconfirmed availability within this period |
| `SYNC_STALE_MINUTES` | 15 | Integrated deals auto-pause if the provider has not synced successfully within this period |
| `CLICK_RECHECK` | true | Re-check live availability when a traveller clicks Book now, before redirecting |
| `MANUAL_REVIEW_COUNT` | 3 | First N manual deals per operator require admin review before going live |
| `LINK_CHECK_TIMEOUT_MS` | 5000 | Timeout for booking-link reachability checks |
| `CLICK_RECHECK_TIMEOUT_MS` | 2000 | Timeout for provider availability recheck on Book now |
| `CACHED_AVAILABILITY_MAX_AGE_MINUTES` | 5 | Max age of cached seats before a timed-out click recheck fails closed |
| `ARCHIVE_AFTER_DAYS` | 30 | Days after expired/ended before a deal is archived |
| `ATTESTATION_REMINDER_HOURS` | 2 | Hours before attestation expiry to send the reconfirm reminder |
| `ENFORCE_COMPLIANCE_ON_PUBLISH` | false | When true, missing/expired required compliance docs block publish |
| `DEFAULT_TIMEZONE` | Pacific/Auckland | Default operator timezone (IANA) |
| `DEFAULT_CURRENCY` | NZD | Default ISO 4217 currency |

### Enums
| Enum | Values |
|---|---|
| `source_provider` | rezdy, fareharbor, bokun, checkfront, manual |
| `deal_type` | integrated_session, integrated_multi_session, manual_session, manual_open_window |
| `deal_status` | draft, pending_review, scheduled, live, paused, auto_paused, sold_out, expired, ended, archived |
| `pause_reason` | operator, admin, sync_failure, session_cancelled, capacity_zero, price_below_threshold, attestation_expired, link_broken, cutoff_passed, integration_disconnected |
| `discount_mechanism` | promo_code, price_option, separate_product, manual_price, quote_code |
| `discount_input_mode` | deal_price, percentage |
| `capacity_mode` | live_provider, live_provider_capped, manual_count |
| `booking_destination_type` | provider_booking_page, operator_website, phone, email |
| `price_option_type` | adult, child, infant, senior, student, family, group, per_unit |
| `rule_type` | daily, weekly, specific_dates |
| `integration_status` | not_connected, connecting, connected, degraded, error, disconnected |
| `user_role` | owner, manager, staff |
| `cancellation_policy_type` | non_refundable, operator_standard, custom |
| `category` | tour, adventure, water, cruise, food_wine, attraction, wellness, accommodation, rental, transport, other |
| `fitness_level` | easy, moderate, challenging, extreme |
| `link_status` | unchecked, ok, broken |
| `session_status` | live, sold_out, cancelled, expired |
| `original_price_source` | provider, operator_entered |
| `media_type` | image, video_embed |
| `media_source` | upload, provider |
| `attestation_method` | dashboard, email_link, sms_link |
| `actor_type` | user, system, admin |
| `recheck_result` | available, sold_out, error |
| `auth_type` | api_key, oauth, marketplace |
| `sync_mode` | webhook, polling, hybrid |
| `conversion_tracking_method` | none, promo_code, booking_source, webhook |
| `sync_type` | full, incremental, webhook, click_recheck, manual |
| `account_status` | pending_verification, active, suspended |
| `invite_status` | pending, accepted, revoked |
| `compliance_doc_type` | public_liability_insurance, adventure_activities_certificate, maritime_licence, business_licence, food_licence, other |
| `review_status` | pending, approved, rejected, expired |
| `billing_model` | subscription, per_click, commission |

---

## 2. Deal types

| Deal type | Who it's for | Availability source | Capacity | Example |
|---|---|---|---|---|
| `integrated_session` | Operators on Rezdy or a future provider | Live from provider | live_provider or live_provider_capped | 12 seats left on tomorrow's 2pm kayak tour |
| `integrated_multi_session` | Same, discounting several departures of one product | Live from provider, per session | Per session | All departures of the harbour cruise in the next 3 days |
| `manual_session` | No booking system, fixed departure times | Operator-entered, must be reattested | manual_count | 6 seats on Saturday 9am fishing charter |
| `manual_open_window` | No booking system, flexible times (rentals, accommodation, self-guided) | Operator-entered per day, must be reattested | manual_count per day | 3 campervans available any day in the next 3 days |

**Auto-deal rules (integrated only).** A `DealRule` creates `integrated_session` deals automatically from unsold provider inventory, e.g. every day, 48 h before departure, list up to 4 unsold seats on the 2pm Harbour Cruise at 55% off. Generated deals link back to their rule and can be edited or cancelled individually without changing the rule. Not offered for manual deals; manual operators duplicate a deal or save it as a template.

**Stepped discount (any type).** A deal can deepen its discount as departure approaches (e.g. 50% from 72 h, 60% from 24 h, 70% from 6 h). Every step must still meet `MIN_DISCOUNT_PCT`. For integrated deals using promo_code or price_option, each step needs its own matching code or price option in the provider.

---

## 3. Data model
Every table has `id` (uuid), `created_at`, `updated_at` unless noted. "Req" = required to publish; drafts may be saved incomplete.

**Inventory Deal table name:** the canonical Deal row lives in `marketplace.operator_deals`. Do **not** use `marketplace.deals` for this model — that table is the legacy org-scoped lightweight feed (`organization_id`, simple status). Child tables (`deal_sessions`, `deal_price_options`, `discount_steps`, later media/events) all FK to `operator_deals.id`. Domain code: `web/lib/marketplace/deal.ts`, `deal-session.ts`.

**Database enforcement (security S9 + S10):** anon cannot `SELECT` base `marketplace.operator_deals`, `deal_price_options`, or `discount_steps` (wide `"Public can view live deals"` / child public policies removed; anon SELECT revoked). Traveller-safe columns are exposed only via views `marketplace.operator_deals_public`, `deal_price_options_public`, and `discount_steps_public` (aligned with `OPERATOR_DEAL_PUBLIC_COLUMNS` / `DEAL_PRICE_OPTION_PUBLIC_COLUMNS` / `DISCOUNT_STEP_PUBLIC_COLUMNS` in `deal-public.ts` — no `promo_code`, pause/link/attestation internals, `discount_verification`, or provider `external_*` option ids). Those views (and public `deal_sessions` / `deal_media` policies) use SECURITY DEFINER `marketplace.is_visible_to_travellers(deal_id)`, which mirrors app `isVisibleToTravellers`: `status = live`, `sales_cutoff_minutes` set, and at least one session with `start_at − sales_cutoff_minutes > now()` and `start_at ≤ now() + MAX_LEAD_HOURS` (SQL uses the platform default **72** hours; Next.js APIs still read `getPlatformConfig().MAX_LEAD_HOURS`). `is_live_operator_deal` delegates to that helper. Members keep full-row SELECT on their own operator’s deals. Preferred traveller path remains Book now / listing APIs (further fail-closed checks). Migrations: `supabase/migrations/20261032000001_narrow_public_deals_select.sql`, `supabase/migrations/20261033000001_align_public_deal_visibility.sql`.

### 3.1 Deal (`marketplace.operator_deals`)
| Field | Type | Req | Validation / notes |
|---|---|---|---|
| operator_id | fk Operator | Yes | |
| deal_type | enum deal_type | Yes | Locked after first publish |
| source_provider | enum source_provider | Yes | `manual` for manual types |
| integration_id | fk Integration | If integrated | Null for manual |
| external_product_id | fk ExternalProduct | If integrated | Content pre-fills from this |
| deal_rule_id | fk DealRule | No | Set when generated by an auto-deal rule |
| status | enum deal_status | System | Never set directly by the client (section 4) |
| pause_reason | enum pause_reason | System | Null unless paused |
| pause_detail | text | System | Human-readable reason shown to operator |
| title | string | Yes | 10–80 chars |
| slug | string | System | Unique, generated from title |
| summary | string | Yes | 20–160 chars, used on deal cards |
| description | rich text | Yes | 100–5,000 chars; bold, lists, links only |
| category | enum category | Yes | |
| tags | string[] | No | Max 10 |
| highlights | string[] | No | Max 6, each ≤ 80 chars |
| inclusions | string[] | No | Max 15 |
| exclusions | string[] | No | Max 15 |
| what_to_bring | string[] | No | Max 15 |
| duration_minutes | int | Yes, except open window | 15–20,160 |
| duration_label | string | No | e.g. "Half day"; overrides display of minutes |
| location_name | string | Yes | |
| address | string | Yes | |
| latitude, longitude | decimal | Yes | From map pin or geocoding |
| region | string | Yes | From `PLATFORM_REGIONS` in `web/lib/marketplace/settings.ts` (Auckland, Northland, Waikato, Bay of Plenty, Rotorua, Taupō, Hawke's Bay, Wellington, Nelson Tasman, Marlborough, Canterbury, West Coast, Otago, Queenstown, Southland) — tourism destinations, distinct from official NZ admin regions |
| meeting_point_notes | text | No | Max 500 |
| pickup_available | bool | No | Default false |
| pickup_notes | text | If pickup | Max 500 |
| min_age | int | No | 0–99 |
| age_notes | string | No | |
| fitness_level | enum fitness_level | No | |
| wheelchair_accessible | bool | No | |
| accessibility_notes | text | No | Max 500 |
| languages | string[] | Yes | ISO 639-1, min 1 |
| weather_dependent | bool | No | |
| weather_notes | text | No | |
| cancellation_policy_type | enum | Yes | Defaults from settings |
| cancellation_policy_text | text | If custom | Max 1,000 |
| important_info | text | No | Max 1,000 |
| overridden_fields | string[] | System | Integrated only: content fields edited locally so sync does not overwrite them |
| currency | string(3) | Yes | Defaults from operator |
| discount_mechanism | enum | Yes | Integrated: promo_code, price_option, separate_product. Manual: manual_price, quote_code |
| promo_code | string | If promo_code or quote_code | 3–30 chars, `A–Z 0–9 - _` |
| promo_code_confirmed_by_operator | bool | If cannot_verify | Chunk 33: operator attests the code/discount exists when `adapter.verifyDiscount` returns `cannot_verify`; also requires a successful Test link before publish (Chunk 35) |
| discount_verification | jsonb | System | Chunk 33: last `POST .../verify-discount` result `{ status, checked_at, options[] }` |
| discount_input_mode | enum | Yes | UI convenience; prices always stored |
| stepped_discount_enabled | bool | No | Default false; uses DiscountStep |
| capacity_mode | enum | Yes | Manual types are always manual_count |
| seat_cap | int | If live_provider_capped | 1–999; display cap unless enforced by promo code usage limit |
| min_booking_qty, max_booking_qty | int | No | Display only |
| booking_destination_type | enum | Yes | |
| booking_url | url | If provider page or website | https only |
| booking_phone | string | If phone | E.164 |
| booking_email | email | If email | |
| booking_instructions | text | No | Shown before redirect. Max 300 |
| append_tracking_params | bool | No | Default true |
| link_status | enum link_status | System | |
| link_last_checked_at | datetime | System | |
| link_consecutive_failures | int | System | Supports "fails twice in a row" rule |
| publish_at | datetime | No | Null = publish immediately on approval |
| sales_cutoff_minutes | int | Yes | 0–1,440; default from settings |
| last_attested_at | datetime | System | Manual only |
| attestation_expires_at | datetime | System | Manual only; last_attested_at + MANUAL_ATTESTATION_HOURS |
| published_at, ended_at | datetime | System | |
| created_by, updated_by | fk User | System | |

### 3.2 DealSession (`marketplace.deal_sessions`)
One row per departure (session types) or per day (open window). Every deal has at least one. `deal_id` → `marketplace.operator_deals.id` (ON DELETE CASCADE).
| Field | Type | Req | Notes |
|---|---|---|---|
| deal_id | fk operator_deals | Yes | Inventory Deal parent |
| external_session_id | fk ExternalSession | If integrated | UUID until Chunk 7 adds FK |
| start_at | datetime | Yes | Future, and within MAX_LEAD_HOURS once live. Open window: start of the day's availability |
| end_at | datetime | No | Open window: end of the day's availability |
| provider_seats_available | int | System | Cached; refreshed on sync and click recheck |
| manual_seats_available | int | If manual | 0–999 |
| seat_cap | int | No | Per-session override of deal cap |
| seats_displayed | int | System | `computeSeatsDisplayed`: min(available, session.seat_cap ?? deal.seat_cap ?? ∞), never below 0; available = provider seats (integrated) or manual seats (manual); recompute on every save |
| status | enum session_status | System | |
| last_synced_at | datetime | System | |

### 3.3 DealPriceOption (`marketplace.deal_price_options`)
| Field | Type | Req | Notes |
|---|---|---|---|
| deal_id | fk operator_deals | Yes | Min 1 per deal |
| label | string | Yes | e.g. "Adult" |
| type | enum price_option_type | Yes | |
| external_price_option_id | string | If integrated | Provider's full-price option |
| external_deal_price_option_id | string | If price_option or separate_product | For `price_option`: provider's discounted option id. For `separate_product`: `product:<external_product_uuid>` (see Chunk 33 / `formatSeparateProductRef`) |
| original_price_minor | int | Yes | From provider, or entered for manual. **Integrated: read-only** — always equals the provider's current price for `external_price_option_id` |
| original_price_source | enum | System | |
| original_price_evidence_url | url | If manual | Public page showing standard price |
| deal_price_minor | int | Yes | Must satisfy 50% rule (`meetsMinDiscount`; see §4.0) |
| discount_pct | decimal | System | `discountPct` / `withDiscountPct` on every save; 1 − deal/original, 1 dp |
| sort_order | int | Yes | |

### 3.4 DiscountStep (`marketplace.discount_steps`)
| Field | Type | Req | Notes |
|---|---|---|---|
| deal_id | fk operator_deals | Yes | |
| price_option_id | fk DealPriceOption | Yes | → `deal_price_options.id` |
| hours_before_start | int | Yes | 1–MAX_LEAD_HOURS (default 72); applies from this point onward |
| deal_price_minor | int | Yes | ≤ previous step and ≤ base deal price; meets 50% rule (`validateSteps`) |
| promo_code | string | If promo_code | Distinct per step |
| external_deal_price_option_id | string | If price_option | |

### 3.5 DealMedia
| Field | Type | Req | Notes |
|---|---|---|---|
| deal_id | fk Deal | Yes | Min 1, max 12 images per deal |
| media_type | enum | Yes | image, video_embed (YouTube/Vimeo URL) |
| source | enum | Yes | upload, provider |
| storage_key / url | string | Yes | |
| is_cover | bool | Yes | Exactly one cover per deal |
| sort_order | int | Yes | |
| alt_text | string | Yes | 5–150 chars |
| caption | string | No | Max 150 |
| width, height | int | System | Min 1200 × 800 px |
| focal_x, focal_y | decimal | No | 0–1 |
| file_size_bytes | int | System | Max 10 MB; jpg, png, webp |

### 3.6 DealRule (auto-deals)
| Field | Type | Req | Notes |
|---|---|---|---|
| operator_id, integration_id, external_product_id | fk | Yes | Integrated products only |
| name | string | Yes | Internal label |
| is_active | bool | Yes | |
| rule_type | enum rule_type | Yes | |
| days_of_week | int[] | If weekly | 0–6 |
| specific_dates | date[] | If specific_dates | |
| session_times | string[] | No | e.g. ["14:00"]; empty = all sessions |
| list_hours_before_start | int | Yes | 1–72 |
| min_unsold_seats | int | Yes | Only create a deal if at least this many unsold |
| seat_cap | int | No | |
| price_config | json | Yes | Per price option: deal price or percentage, plus optional steps |
| discount_mechanism, promo_code | as Deal | Yes | |
| template_deal_id | fk Deal | Yes | Content, images, booking destination copied from this |
| auto_publish | bool | Yes | False = generated deals wait in draft |
| start_date, end_date | date | Start yes | |
| last_run_at, next_run_at | datetime | System | |

### 3.7 Supporting deal tables
| Table | Key fields | Purpose |
|---|---|---|
| DealTemplate | operator_id, name, payload json | Saved content/settings for reuse (no sessions) |
| DealAttestation | deal_id, attested_by, attested_at, method, seats_by_session json | Manual availability reconfirmations |
| DealEvent | deal_id, event_type, actor_type, actor_id, detail json | Audit trail: created, published, paused, auto_paused, resumed, price_changed, seats_changed, ended, etc. |
| ClickEvent | deal_id, deal_session_id, click_id, visitor_id, recheck_result, redirect_url | Each Book now click; attribution source |
| DealMetricDaily | deal_id, date, impressions, detail_views, booking_clicks, sold_out_on_click, attributed_bookings, attributed_revenue_minor | Reporting |

### 3.8 Integration tables
Tables: `marketplace.integrations`, `external_products`, `external_sessions`, `sync_logs`, `deal_rules`. Domain: `web/lib/marketplace/integration.ts`. Secrets: `web/lib/marketplace/secrets.ts` + `marketplace.encrypted_secrets` (AES-256-GCM; key `SECRETS_ENCRYPTION_KEY`). Unique `(operator_id, provider)` where status ≠ `disconnected`. Deferred FKs from Chunks 3–4 are wired here (`operator_deals.integration_id` / `external_product_id` / `deal_rule_id`, `deal_sessions.external_session_id`).

**Integration**: operator_id, provider (enum source_provider minus `manual`, one active per provider per operator), status (integration_status), auth_type, credentials_ref (reference to encrypted secret store; never plain text, never returned to client — serializers strip `credentials_ref` and `webhook_secret_ref`), external_account_id, external_account_name, sync_mode, poll_interval_seconds (bounded by provider rate limits), webhook_secret_ref, webhook_last_received_at, last_sync_at, last_successful_sync_at (drives SYNC_STALE_MINUTES), last_error_code, last_error_message, default_booking_destination_type, booking_base_url, conversion_tracking_method, booking_source_label, auto_enable_new_products (default false), connected_at, connected_by.

**ExternalProduct**: integration_id, external_id, name, description, images json, duration_minutes, location json, price_options json, is_enabled_for_deals bool, archived_in_provider bool, raw_payload json, last_synced_at. Unique `(integration_id, external_id)`.

**ExternalSession**: external_product_id, external_id, start_at, end_at, seats_available, total_capacity, status, prices json, last_synced_at. Unique `(external_product_id, external_id)`. Only sessions within the next 72 h (plus buffer) need syncing.

**SyncLog**: integration_id, sync_type, status (`running`|`success`|`failed`), started_at, finished_at, items_processed, error_code, error_message, affected_deal_ids.

**Provider adapter (Chunk 26/31/45):** all provider I/O goes through `ProviderAdapter` in `web/lib/marketplace/providers/` (`connect`, `testConnection`, `listProducts`, `listSessions`, `getAvailability`, `verifyDiscount`, `buildBookingUrl`, `listBookings`, `capabilities`, optional `handleWebhook`). Resolve via `getAdapter(provider)`; unknown providers throw. FareHarbor / Bókun / Checkfront are registered as coming soon (`capabilities().available === false`, methods throw `AdapterNotImplementedError`). **Rezdy (Chunk 31):** `providers/rezdy/` implements the Supplier API per §7 (api key auth, shared 100/min throttle + 406 backoff, fixtures for CI). Registry default is `RezdyAdapter`; set `REZDY_USE_MOCK=1` for the controllable mock. Connect stores `credentials_ref` + opaque `webhook_secret_ref` (path/token — Rezdy has no HMAC) and suggests `booking_base_url` = `https://{supplierAlias}.rezdy.com`. Capabilities: §7.8 (`preferred_sync_mode: hybrid`). `listBookings` → Supplier `GET /bookings` (Chunk 45 attribution). Contract tests run against mock and recorded fixtures in `providers/__tests__/provider-adapter.contract.test.ts`. Manual sandbox: `npm run rezdy:sandbox` (`REZDY_API_KEY`, optional `REZDY_STAGING=1`).

**Connect / disconnect (Chunk 27):** `web/lib/marketplace/integration-connect.ts`. Requires `settings.integrations`. Routes under `/api/marketplace/operators/:operatorId/integrations` — `GET` (provider cards: status, account name, last_successful_sync_at, available), `POST .../:provider/connect` (status connecting → adapter.connect → store credentials_ref → connected; sync_mode / poll_interval from capabilities; kicks off full sync), `POST .../test`, `GET .../disconnect-preview` (count of live/scheduled deals to pause), `POST .../disconnect {confirm:true}` (status disconnected, delete secrets, `applyAutoPause(integration_disconnected)` on live/scheduled — includes `scheduled→auto_paused`), `PATCH .../settings` (sync_mode, poll_interval clamped to adapter min/max, booking destination, conversion tracking, auto_enable_new_products). On reconnect + successful sync, `clearAutoPause(integration_disconnected)`.

**Sync engine (Chunk 28):** `web/lib/marketplace/integration-sync.ts` — `runSync(integrationId, type)` creates a `SyncLog` (`running` → `success`|`failed`); `listProducts` → upsert `ExternalProduct` (`archived_in_provider`; new products enabled only if `auto_enable_new_products`); for enabled products, `listSessions` for now → now+`MAX_LEAD_HOURS`+24h → upsert `ExternalSession`; mark missing in-window sessions `cancelled`; update linked `DealSession.provider_seats_available` / `last_synced_at` / `seats_displayed`; refresh non-overridden Deal content via Chunk 32. Post-sync provider hooks (Chunk 35): `web/lib/marketplace/deal-integrated-sync-hooks.ts` — `runPostSyncProviderHooks` updates originals from the provider catalogue; `session_cancelled` (all selected sessions cancelled/removed, or product archived) and `price_below_threshold` (50% fail or discounted/separate price ≠ `deal_price_minor`) via `applyAutoPause` on live/scheduled deals (no auto-resume); notifies `deal_auto_paused` (stub until Chunk 39). One sync per integration (lock); adapter calls retry with backoff. Scheduler: `runIntegrationPollJob` polls connected integrations on `poll_interval_seconds`. Webhook: `POST /api/marketplace/webhooks/providers/:provider` verifies HMAC **or** opaque token (`x-webhook-token` / body token matching `webhook_secret_ref` — Rezdy §7.4), sets `webhook_last_received_at`, incremental sync for affected products. Operator routes: `POST .../resync`, `POST .../products/refresh`, `GET .../products`, `PATCH .../products/:pid {is_enabled_for_deals}`, `GET .../sync-log`.

**Integrated deal creation / content overrides (Chunk 32):** `web/lib/marketplace/deal-integrated.ts` — creating `integrated_session` / `integrated_multi_session` requires a connected (or degraded) integration and an enabled, non-archived `ExternalProduct` (`external_product_id` on `POST .../deals`). Prefills title, summary (from description), description, duration, location, provider images (`DealMedia` source=`provider`), price options (`original_price_source=provider`), and booking URL via `adapter.buildBookingUrl`. PATCH of pre-filled content fields appends to `overridden_fields`; `POST .../operator-deals/:id/revert-field {field}` restores the provider value. `GET` detail returns `provider_values` + `overridden_fields`. Product sync calls `refreshDealsFromExternalProduct` for draft/scheduled/live deals (skips overridden fields). Picker: `GET .../operators/:id/deal-products`. `importProviderImages` imports remaining provider image URLs.

**Integrated pricing / discount verification (Chunk 33):** `web/lib/marketplace/deal-integrated-pricing.ts`. Integrated `original_price_minor` is read-only (PATCH rejected) and synced from the provider product. Mechanisms: `price_option` (select provider discounted option → `external_deal_price_option_id` + read-only `deal_price_minor`), `promo_code` (operator enters code + deal price; `adapter.verifyDiscount`), `separate_product` (second `ExternalProduct` referenced as `product:<uuid>` in `external_deal_price_option_id`). All prices still must pass `MIN_DISCOUNT_PCT`. `POST /api/marketplace/operator-deals/:id/verify-discount` → `{ status: verified|not_found|cannot_verify|failed, options[] }`; stores `discount_verification` on the deal. When status is `cannot_verify`, set `promo_code_confirmed_by_operator=true` (and pass Test link before publish — Chunk 35). `GET` detail also returns `provider_price_options` and `discount_verification`. Editor Step 4 shows read-only originals, mechanism picker, and verification status text ("Verified in Rezdy", "Not found", "Can't verify; confirm manually").

**Integrated availability / capacity (Chunk 34):** `web/lib/marketplace/deal-integrated-availability.ts`. `GET /api/marketplace/operator-deals/:id/available-sessions` lists `ExternalSession`s for the deal's product starting within `MAX_LEAD_HOURS` (seats_available, status, last_synced_at, selected). `PUT` same path with `external_session_ids` (+ optional `capacity_mode`, `seat_cap`, `session_seat_caps`) creates/replaces `DealSession`s linked via `external_session_id` with `provider_seats_available`. `integrated_session` requires exactly one; `integrated_multi_session` one or more. Capacity: `live_provider` or `live_provider_capped` (deal `seat_cap` 1–999; per-session override allowed). API/editor note: "A cap is display-only unless your promo code has a matching usage limit." `seats_displayed` recomputed on select, on deal `seat_cap`/`capacity_mode` PATCH, and on every sync (`updateLinkedDealSessions`). Editor Step 5 shows the provider session picker for integrated deals.

### 3.9 Operator and settings tables
| Table | Fields | Notes |
|---|---|---|
| Operator | legal_name, trading_name, slug, logo, cover_image, short_description (≤160), long_description (≤3,000), website, public_email, public_phone, internal_email, internal_phone, address, regions_served string[], timezone, currency, languages string[], gst_number, nzbn, social_links json, account_status, requires_manual_review bool | requires_manual_review is admin-set; forces pending_review on publish. **DB (S3):** `account_status` / `requires_manual_review` are service_role-only (BEFORE INSERT/UPDATE trigger); clients cannot self-activate or clear review flags via PostgREST. **DB (S8):** anon cannot `SELECT` the base `marketplace.operators` table; public brand fields for `account_status = 'active'` are exposed only via view `marketplace.operators_public` (aligned with `serializeOperatorPreview` / `OPERATOR_PUBLIC_COLUMNS` — no `internal_*`, `gst_number`, `nzbn`, `legal_name`, or admin flags). Members keep full-row SELECT on their own operator. Migration: `supabase/migrations/20261031000001_narrow_public_operators_select.sql` |
| OperatorBookingDefaults | default_sales_cutoff_minutes, default_seat_cap, default_discount_pct, default_discount_mechanism, default_booking_destination_type, default_booking_url, default_booking_phone, default_booking_email, default_booking_instructions, default_cancellation_policy_type, default_cancellation_policy_text, default_attestation_reminder_hours | One row per operator; pre-fills new deals. **DB (S5):** INSERT is not open to clients — open `"System can insert booking defaults"` (`WITH CHECK (true)`) removed; `INSERT` revoked from `authenticated`; rows are created only by the SECURITY DEFINER `create_operator_booking_defaults` trigger on operator insert, or by `service_role`. Owners/managers SELECT/UPDATE their own row via existing RLS. Migration: `supabase/migrations/20261028000001_fix_operator_booking_defaults_insert.sql` |
| NotificationPreference | user_id, operator_id, event_type, email, sms, in_app | Events in 6.4; unique (user_id, operator_id, event_type); table `marketplace.notification_preferences` |
| TeamMember | operator_id, user_id, role, invited_email, invite_status, invited_at, last_active_at | Min 1 owner per operator. **DB (S3):** only accepted owners may set `role = 'owner'`; last accepted owner cannot be demoted/revoked/deleted (trigger on `team_members`; mirrored on legacy `organization_members`) |
| ComplianceDocument | operator_id, doc_type, file, issuer, reference_number, issued_on, expires_on, review_status (default pending), reviewer_notes | Expiry reminders at 30 and 7 days; table `marketplace.compliance_documents`. **DB (S6):** `review_status` / `reviewer_notes` are service-role only (BEFORE INSERT/UPDATE trigger); operators cannot self-approve via PostgREST. Migration: `20261029000001_lock_compliance_review_status.sql` |
| BillingAccount | operator_id (unique), plan, billing_model, commission_pct, billing_email, payment_method_ref, status (`active`\|`past_due`\|`cancelled`\|`none`) | One row per operator; invoices pulled from billing provider, not stored; `payment_method_ref` never returned to clients |

---

## 4. Validation, status lifecycle and background jobs
A deal can only go live when every check passes, and it leaves live automatically the moment any check stops passing.

### 4.0 Pricing maths (pure helpers)
Implemented in `web/lib/marketplace/pricing.ts`. Money is always integer minor units. Never hard-code `MIN_DISCOUNT_PCT` — read via `getPlatformConfig()`.

| Function | Rule |
|---|---|
| `maxDealPrice(originalMinor)` | `floor(originalMinor × (1 − MIN_DISCOUNT_PCT/100))` |
| `meetsMinDiscount(originalMinor, dealMinor)` | `dealMinor ≤ maxDealPrice(originalMinor)` and `dealMinor ≥ 0` and `originalMinor > 0` |
| `discountPct(originalMinor, dealMinor)` | `round((1 − deal/original) × 100, 1 dp)`; null if original ≤ 0 |
| `meetsMinDiscountPercentage(pct)` | `pct ≥ MIN_DISCOUNT_PCT` (reject e.g. 49% when min is 50) |
| `priceFromPercentage(originalMinor, pct)` | Round to nearest cent; if that fails the rule, floor instead so a valid percentage never yields an invalid price |
| `withDiscountPct(option)` | Attach computed `discountPct` on every DealPriceOption save |
| `validateSteps(steps, option)` | Steps sorted by `hours_before_start` descending; each price ≤ previous step and ≤ base deal price; each meets min discount; promo codes distinct |
| `currentPrice(option, session, now, steps)` | Chunk 43 (`deal-stepped-discounts-shared.ts`, re-exported from `deal-stepped-discounts.ts`): deepest step whose `hours_before_start ≥ hours until start`, else base `deal_price_minor`; returns price, promo code, and active step |

**Stepped discounts (Chunk 43):** When `stepped_discount_enabled`, CRUD steps per price option via `POST|PATCH|DELETE /api/marketplace/operator-deals/:id/discount-steps` (`deal-stepped-discounts.ts`). Promo / quote mechanisms require distinct `promo_code` per step; `price_option` requires `external_deal_price_option_id`. Integrated steps are verified with `adapter.verifyDiscount` on save. Status ticker `applyCurrentDiscountSteps` logs `price_changed` when a step activates and refreshes the display-price cache. List, calendar, editor summary and Book now use `currentPrice` / `bookingPromoForSession` (step promo passed to `buildBookingUrl`). Publish `min_discount` and `discount_in_provider` include every step.

### 4.1 Publish validation
Implemented in `web/lib/marketplace/deal-publish-validation.ts` as `validateForPublish(deal, context)` → `{ ok, checks: [{ key, label, passed, message, editorStep }], hasSessionWithinLeadHours? }`. Also `validateDealInStore` / `createValidateForPublishFromStore` for draft store + auto-resume (`validateDealInStore` supplies `integration`, `externalProduct`, `externalSessionsById` for integrated checks). `GET /operator-deals/:id` returns the validation block. Integrated provider checks (Chunk 35): `integration_healthy`, `product_active`, `original_price_locked`, `discount_in_provider` (price_option **including stepped options**), `promo_code_confirmed` (promo_code / separate_product: verified **or** operator-confirmed + `link_status=ok`), `session_available`. Optional `compliance` check runs when `ENFORCE_COMPLIANCE_ON_PUBLISH` is true.

| Check | Applies to | Rule | editorStep |
|---|---|---|---|
| `required_fields` | All | Every Req field in section 3 present and valid | content (or pricing / availability / destination when those fields fail) |
| `min_discount` | All | For every price option and every step: `meetsMinDiscount` / `validateSteps` (§4.0) | pricing |
| `images` | All | ≥1 image, exactly 1 cover, all with alt text | images |
| `session_timing` | All | ≥1 session with `start_at − sales_cutoff_minutes` in the future; result also reports whether any is within `MAX_LEAD_HOURS` (live vs scheduled) | availability |
| `booking_destination` | All | URL `link_status` ok (re-check if unchecked or stale >6 h), or phone/email valid | destination |
| `integration_healthy` | Integrated | Integration connected and last_successful_sync_at within SYNC_STALE_MINUTES | type |
| `product_active` | Integrated | ExternalProduct enabled and not archived in provider | type |
| `original_price_locked` | Integrated | original_price_minor equals provider's current price; not editable | pricing |
| `discount_in_provider` | Integrated, price_option | Discounted provider option exists and price equals deal_price_minor; each DiscountStep's `external_deal_price_option_id` likewise matches | pricing |
| `promo_code_confirmed` | Integrated, promo_code | Verified via provider API if supported; else operator ticks "This code exists in my booking system" and runs Test link | pricing |
| `session_available` | Integrated | Provider session exists, not cancelled, seats available | availability |
| `price_evidence` | Manual | original_price_evidence_url provided and reachable | pricing |
| `seats_entered` | Manual | manual_seats_available > 0 for at least one session/day | availability |
| `attestation` | Manual | Operator ticks "These seats are available and I will honour this price" (`attested: true`) or a current `attestation_expires_at`; creates a DealAttestation at publish (Chunk 17) | review |
| `compliance` | Optional | When `ENFORCE_COMPLIANCE_ON_PUBLISH`, required docs (default `public_liability_insurance`) present and not expired | review |
| Review | Manual, or requires_manual_review | Operator's first 3 manual deals, or all deals if flagged, go to pending_review (Chunk 17 publish flow) | — |

**Publish / schedule / review (Chunk 17):** `web/lib/marketplace/deal-publish.ts` — `publishDeal` (operator; `attest: true` for manual), `approveDeal` / `rejectDeal` / `adminPauseDeal` / `setManualReviewFlag` (admin). Button label via `getPublishButtonLabel` / `publish_button` on GET deal detail: `Publish` | `Schedule` | `Submit for review`. First `MANUAL_REVIEW_COUNT` manual deals (or any deal when `requires_manual_review`) go to `pending_review`; otherwise `publish_at` in the future or no sellable session within `MAX_LEAD_HOURS` → `scheduled`, else `live`. Manual publish creates a `DealAttestation` (dashboard) and sets `attestation_expires_at = now + MANUAL_ATTESTATION_HOURS`. Submit / approve / reject notify operator members via `notify(..., deal_review_update)` (Chunk 39). Routes: `POST /api/marketplace/operator-deals/:id/publish`, `POST /api/marketplace/admin/deals/:id/{approve,reject,pause}`, `POST /api/marketplace/admin/operators/:id/manual-review`.

**Operator actions (Chunk 19):** `web/lib/marketplace/deal-actions.ts` — `pauseDeal` (live/scheduled → paused, reason=operator), `resumeDeal` (paused/auto_paused → live or scheduled after `validateForPublish`; manual expired attestation requires `attest: true` and creates a dashboard attestation), `endDeal`, `archiveDeal` (expired/ended only), `updateDealSeats` / `markDealSoldOut` (manual only; logs `seats_changed`; all-zero seats on live → sold_out), `bulkDealActions` (pause requires `confirm: true`; per-deal `{id, ok, error?}`; `mark_sold_out` skips integrated). Routes: `POST /api/marketplace/operator-deals/:id/{pause,resume,end,archive,seats,mark-sold-out}`, `POST /api/marketplace/operators/:operatorId/deals/bulk`.

### 4.2 Status transitions
Implemented in `web/lib/marketplace/deal-status.ts`: `logDealEvent`, `transitionDeal`, `applyAutoPause`, `clearAutoPause`. Clients never set `status`, `pause_reason` or `pause_detail` — client update helpers strip those fields (`stripSystemOwnedDealFields` / `applyClientDealFieldPatch`). Disallowed edges throw `InvalidDealTransitionError`. Entering `paused` sets `pause_reason=operator` (or `admin` when an admin pauses); entering `auto_paused` uses the given reason; both clear on leave. Reject (`pending_review` → `draft`) stores reviewer notes in `pause_detail`. First entry to `live` or `scheduled` sets `published_at` and `first_published_at`; `ended` sets `ended_at`. Every transition writes a `DealEvent` with `from_status` / `to_status` / `reason`. `clearAutoPause` only resumes when the deal is `auto_paused` for the same reason in `AUTO_RESUME_REASONS` and publish validation passes (`validateForPublish` / `createValidateForPublishFromStore` in `web/lib/marketplace/deal-publish-validation.ts`). Operator resume also allows `paused`/`auto_paused` → `scheduled` when nothing is within `MAX_LEAD_HOURS` (Chunk 19).

**Database enforcement (security S2):** RLS alone is not enough — owner/manager UPDATE policies on `marketplace.operator_deals` (and member UPDATE on legacy `marketplace.deals`) would still allow PostgREST clients to PATCH system columns. A BEFORE UPDATE trigger rejects changes to `status` / `pause_reason` / `pause_detail` / `discount_verification` on `operator_deals`, and to `status` on legacy `deals`, unless `current_user` is `service_role`, `postgres`, or `supabase_admin`. Migration: `supabase/migrations/20261024000001_lock_system_owned_deal_columns.sql`. Persist status transitions with a service-role Supabase client or a SECURITY DEFINER writer; do not rely on the caller’s JWT. `promo_code_confirmed_by_operator` remains client-writable (operator attest when the provider cannot verify).

| From | Trigger | To |
|---|---|---|
| draft | Submitted; validation passes; review required | pending_review |
| draft / pending_review | Validation passes (and admin approves if reviewed); publish_at in future or no session within 72 h yet | scheduled |
| draft / pending_review / scheduled | publish_at reached, a session within 72 h, all checks pass | live |
| live / scheduled | Operator pauses | paused |
| paused / auto_paused | Operator resumes; checks re-run and pass; session within 72 h | live |
| paused / auto_paused | Operator resumes; checks re-run and pass; no session within 72 h | scheduled |
| live | Any auto-pause trigger (4.3) | auto_paused |
| auto_paused | Trigger clears (auto-resume reasons only) | live |
| live | Every remaining session has 0 seats displayed | sold_out |
| sold_out | Seats reappear before cutoff | live |
| live / sold_out / auto_paused / paused / scheduled | Every session past start_at − sales_cutoff_minutes | expired |
| any except archived | Operator ends deal | ended |
| expired / ended | 30 days pass, or operator archives | archived |

Every transition writes a DealEvent. Session-level status lives on DealSession, so a multi-session deal stays live while any session is sellable.

### 4.3 Auto-pause triggers
| pause_reason | Condition | Scope | Auto-resumes? |
|---|---|---|---|
| sync_failure | last_successful_sync_at older than SYNC_STALE_MINUTES | All live deals on that integration | Yes, after next successful sync |
| integration_disconnected | Integration status becomes disconnected or error | All deals on that integration | Yes, after reconnect and successful sync |
| session_cancelled | Provider session cancelled/removed, or product archived | Session; deal if none remain | No |
| price_below_threshold | Provider price/discount option changes so any option is under 50% off | Deal | No; operator fixes pricing |
| attestation_expired | Manual deal past attestation_expires_at | Deal | Yes, when operator reattests |
| link_broken | Link check fails twice in a row | Deal | Yes, when next check passes |
| admin | Admin action | Deal or operator | No |

### 4.4 Book now click flow
Public endpoint: `POST /api/marketplace/deals/:slug/book` with `{ session_id, visitor_id }` (`web/lib/marketplace/deal-book-now.ts`). Rate-limited by visitor_id/IP. Outcomes: `redirect` | `show_instructions` | `unavailable` | `just_sold_out` | `cannot_confirm`.

1. Traveller clicks Book now → create ClickEvent with unique click_id.
2. If not `isVisibleToTravellers` → `{ outcome: unavailable }` plus up to 4 other live deals in the same region (soonest session first).
3. Integrated and `CLICK_RECHECK`: call `adapter.getAvailability` with `CLICK_RECHECK_TIMEOUT_MS`; write a SyncLog of type `click_recheck`.
   - Seats available → update DealSession cache, `recheck_result=available`, `{ outcome: redirect, url, instructions }`.
   - Sold out → mark session sold_out (deal sold_out if none left), `{ outcome: just_sold_out, alternatives }`.
   - Timeout/error → redirect only if `last_synced_at` is under `CACHED_AVAILABILITY_MAX_AGE_MINUTES` and seats > 0; otherwise `{ outcome: cannot_confirm, operator contact, message: "We couldn't confirm live availability" }`.
4. Manual: confirm attestation current and seats > 0 → `{ outcome: show_instructions, booking_instructions, destination }`; else unavailable.
5. URL destinations: `adapter.buildBookingUrl` for provider pages (promo from `bookingPromoForSession` / deal `promo_code` applied **server-side** into the booking URL when the adapter supports it — the Book now JSON response does not expose `promo_code`), then `buildTrackedUrl` when `append_tracking_params` (utm_source, utm_medium=referral, utm_campaign=deal slug, click_id). Phone → `tel:`, email → `mailto:`. Store `redirect_url` on the ClickEvent. **DB (S9):** travellers must not enumerate promo codes via PostgREST; use public views / this API only.

### 4.5 Background jobs
| Job | Frequency | Does |
|---|---|---|
| Provider sync | Per poll_interval_seconds + webhooks (`runIntegrationPollJob` / webhook route in `integration-sync.ts`) | Refresh ExternalProduct / ExternalSession for next 72 h + 24 h buffer; update linked DealSession seats |
| Stale-sync monitor | Every minute | `runStaleSyncMonitorJob` in `web/lib/marketplace/integration-stale-sync.ts`: connected/degraded with `last_successful_sync_at` older than `SYNC_STALE_MINUTES` → status `degraded`, `applyAutoPause(sync_failure)` on live deals, `notify(..., integration_sync_failing)` once per incident; `error`/`disconnected` → `applyAutoPause(integration_disconnected)` on live/scheduled; fresh sync → `connected` + `clearAutoPause(sync_failure)` (also from `runSync` on success) |
| Status ticker | Every minute | `runStatusTickerJob` in `web/lib/marketplace/deal-status-ticker.ts`: scheduled→live (publish_at reached + session within `MAX_LEAD_HOURS` + validateForPublish); expire sessions past cutoff; expire deals when all sessions expired/cancelled; live↔sold_out from seats; `applyCurrentDiscountSteps` (Chunk 43: log `price_changed` on step activation); archive expired/ended after `ARCHIVE_AFTER_DAYS`; `notify(..., deal_lifecycle)` on live / sold_out / expired. Traveller visibility: `isVisibleToTravellers` (live + sellable session within lead window) |
| Auto-deal rule runner | Every 15 minutes | `runDealRulesJob` in `web/lib/marketplace/deal-rules.ts`: active DealRules matching day schedule in operator TZ; ExternalSessions ≤ `list_hours_before_start` with seats ≥ `min_unsold_seats` and no non-ended deal for that session → create `integrated_session` from `template_deal_id` (content/media/booking) + `price_config` vs provider prices; `auto_publish` runs publish flow (else draft); `notify(..., auto_rule_created_deals)`; generated deals independent of the rule |
| Link checker | On publish, then every 6 h | Update link_status; apply/clear link_broken; on second failure auto-pause → `notify(..., booking_link_broken)` |
| Attestation reminder | Every minute | `runAttestationJob` in `web/lib/marketplace/deal-attestation.ts`: live manual deals past `attestation_expires_at` → `applyAutoPause(attestation_expired)`; within `default_attestation_reminder_hours` (fallback `ATTESTATION_REMINDER_HOURS`) → `notify(..., attestation_due)` with signed quick-update link; dedupe via `attestation_reminders` |
| Daily performance summary | Once per operator morning (local hour 8) | `runDailyPerformanceSummaryJob` in `web/lib/marketplace/notifications.ts` → `notify(..., daily_performance_summary)` |
| Metrics rollup | Hourly | `runMetricsRollupJob` in `web/lib/marketplace/deal-metrics.ts`: aggregate impressions / detail_views / ClickEvent / attributed bookings into `DealMetricDaily` (local day; idempotent upsert) |
| Compliance expiry | Daily | `runComplianceExpiryJob` in `web/lib/marketplace/operator-compliance.ts`: `notify(..., compliance_expiring)` at 30 and 7 days before `expires_on` (once each via `complianceReminders`); set `review_status=expired` after `expires_on` |

---

## 5. Inventory tab
Four screens: Deals list, Deal editor, Auto-deal rules, Templates. Staff get read-only access to all.

### 5.1 Deals list
- Status tabs with counts: Live, Scheduled, Needs attention (auto_paused, pending_review, attestation due within 2 h), Paused, Drafts, Sold out, Past (expired, ended, archived).
- Views: table (default) and 3-day calendar (one column per day, deals placed by session time).
- Columns: cover thumbnail, title, deal type badge, source badge, next session date/time, original vs deal price (lowest option), discount %, seats displayed, time until cutoff, status with pause-reason tooltip, clicks today.
- Filters: status, deal type, source, product, category, date range. Search: title.
- Row actions: Edit, Duplicate, Pause/Resume, End, Preview, View stats, Save as template. Manual deals also: Update seats, Mark sold out.
- Bulk actions: Pause, Resume, End, Mark sold out (manual). Bulk pause needs one confirmation.
- Banners: integration problems ("Rezdy sync failing since 10:42; 8 deals hidden") and manual attestations due, each with a fix button.
- Empty state: "Create your first deal", plus a prompt to connect an integration if none.

**Backend (Chunk 21):** `web/lib/marketplace/deal-list.ts` — `listOperatorDeals` (tabs, filters, search, pagination, default sort next session soonest, `tab_counts`, banners, `has_any_deals` / `has_integration`, per-row `allowed_actions` from role + status); `getOperatorDealsCalendar` (3 local days from `from=`). Routes: `GET /api/marketplace/operators/:operatorId/deals`, `GET .../deals/calendar`. Staff `allowed_actions` are preview + view_stats only.

**UI (Chunk 23):** `web/components/inventory/deals-list/DealsList.tsx` wired on `/account/inventory` — tabs with counts, table + 3-day calendar, filters/search, cutoff countdown (client tick from `cutoff_at`), pause-reason tooltip, row actions from `allowed_actions`, inline Update seats + Mark sold out, bulk actions with pause confirmation, banners with Fix/Reconfirm, empty state. Helpers: `web/lib/marketplace/deals-list-ui.ts`; browser client methods on `operator-deals-client.ts`.

### 5.2 Deal editor
Stepped form, persistent summary sidebar (price, discount %, sessions, validation status). Steps revisitable in any order; Save draft always available.
1. **Deal type and source**: choose type; integrated types list connected providers (disabled with link to Settings if none); integrated → searchable list of enabled ExternalProducts, selecting one pre-fills content, images, duration, location, price options; option to start from a template or duplicate.
2. **Content**: all content fields; integrated pre-filled fields show "From Rezdy" with Override / Revert controls maintaining overridden_fields; live character counters.
3. **Images**: multi upload, import from provider, reorder, set cover, alt text, caption, focal point; crop preview; inline errors.
4. **Pricing**: table of options with live discount % and pass/fail against 50%; toggle deal price vs percentage; integrated original price read-only, choose mechanism, pick provider discounted option or enter promo code, show verification status ("Verified in Rezdy", "Not found", "Can't verify; confirm manually"); manual original price editable + evidence URL, mechanism manual_price or quote_code; stepped discount timeline.
5. **Availability**: integrated → provider sessions next 72 h with live seats and last-synced (multi-select for multi-session); capacity mode with cap note; manual session → add sessions (date, time, seats); open window → up to 3 days with seats per day and optional time window; sales cutoff, publish at, min/max group size.
6. **Booking destination**: type then URL/phone/email (integrated defaults to provider booking page); instructions; tracking toggle; Test link.
7. **Review and publish**: traveller preview; 4.1 checklist with fix links; manual attestation checkbox; Publish / Schedule / Submit for review.

Editing a live deal: content and image changes apply immediately; pricing, session and destination changes re-run validation and require confirmation.

### 5.3 Deal detail and stats
Header with status, pause reason, fix action. Metrics for a date range: impressions, detail views, Book now clicks, CTR, sold-out-on-click, attributed bookings and revenue. Per-session table. Activity log from DealEvent.

**Backend (Chunk 45):** `web/lib/marketplace/deal-metrics.ts` — public `recordImpressions` / `recordDetailView` (raw events on the draft store until rollup); hourly `runMetricsRollupJob` idempotently upserts `DealMetricDaily` from tracking events + `ClickEvent` (booking_clicks / sold_out_on_click) + attribution; `getDealStats(dealId, {from,to})` returns totals, CTR, per-day series, sessions, and DealEvent activity (times in operator timezone). Attribution uses `Integration.conversion_tracking_method`: `promo_code` / `booking_source` / `webhook` via `ProviderAdapter.listBookings`; `none` leaves attributed fields at zero. Routes: `POST /api/marketplace/track/impressions`, `POST /api/marketplace/track/detail-view` (public), `GET /api/marketplace/operator-deals/:id/stats?from&to` (`inventory.read`).

**UI (Chunk 45):** `/account/inventory/deals/[dealId]/stats` (`DealStatsPage`); deals list **View stats** navigates here.

### 5.4 Auto-deal rules
List: name, product, schedule summary, discount, active toggle, deals generated last 7 days, next run. Editor per 3.6 with template deal picker and live preview ("this rule would create 3 deals in the next 72 hours"). Generated deals show a "From rule" badge.

**Backend (Chunk 44):** `web/lib/marketplace/deal-rules.ts` — CRUD with integrated-product + same-product `template_deal_id` checks; `price_config` validated via Chunk 10 (`validatePriceConfigAgainstProvider`); `previewDealRule` / `GET …/deal-rules/:id/preview`; `runDealRulesJob` every 15 minutes. Routes: `GET|POST /api/marketplace/operators/:operatorId/deal-rules`, `GET|PATCH|DELETE …/deal-rules/:ruleId`, `GET …/deal-rules/:ruleId/preview`, `GET /api/marketplace/deal-rules/:id/preview`.

**UI (Chunk 44):** `/account/inventory/auto-deal-rules` (+ `/new`, `/[ruleId]`) → `AutoDealRulesList` / `AutoDealRuleEditor`; inventory subnav includes Auto-deal rules. Deals list rows already expose `from_rule` (Chunk 21/23).

### 5.5 Templates
List, rename, delete, "Create deal from template". Store content, images, pricing approach, booking destination and defaults, not sessions.

**Backend (Chunk 25):** `web/lib/marketplace/deal-templates.ts` — `saveDealAsTemplate` (payload: content + media refs + price options; never sessions/attestations), `listOperatorTemplates` / rename / delete, `createDealFromTemplate` via `createDraftDeal` + `applyTemplateChildren`. Routes: `POST /api/marketplace/operator-deals/:id/save-as-template`, `GET|PATCH|DELETE /api/marketplace/operators/:operatorId/templates[/:templateId]`, `POST .../templates/:tid/create-deal`.

**UI (Chunk 25):** `/account/inventory/templates` (`TemplatesList`) + inventory Deals/Templates subnav; deals list “Save as template”; editor type step “Start from a template”.

### 5.6 Manual operator quick update
Email/SMS reconfirm link opens a mobile page without full login, scoped by a signed single-use token valid for the attestation window. Shows each live manual deal (and `auto_paused` with `attestation_expired`) with a seat stepper and two buttons: Still available, Sold out.

**Backend (Chunk 20):** `web/lib/marketplace/deal-attestation.ts` — `issueQuickUpdateToken` / `resolveQuickUpdateToken` (HMAC-signed via `QUICK_UPDATE_TOKEN_SECRET` or `SECRETS_ENCRYPTION_KEY`; security S11: no `"dev-quick-update-token-secret"` fallback in production — missing secret → 503; store SHA-256 hash only; single-use via `used_at`; expires at latest included `attestation_expires_at`, min 2 h from issue); `getQuickUpdateByToken` / `submitQuickUpdate` (`still_available` → update seats, `DealAttestation` method `email_link`|`sms_link`, reset expiry, `clearAutoPause(attestation_expired)`; `sold_out` → seats 0); dashboard `attestDeal` (method `dashboard`). Routes: `GET|POST /api/marketplace/quick-update/:token` (no login), `POST /api/marketplace/operator-deals/:id/attest` (`inventory.write`). Tables: `marketplace.quick_update_tokens`, `marketplace.attestation_reminders` (today in-memory maps; DB tables exist for persistence). **Database enforcement (security S4):** both tables have RLS enabled with **no** client policies; `REVOKE ALL` from `PUBLIC` / `anon` / `authenticated`; `GRANT ALL` to `service_role` only (same fail-closed pattern as `encrypted_secrets`). Migration: `supabase/migrations/20261027000001_enable_rls_token_reminder_tables.sql`. Future DB-backed reads/writes must use a service-role client — never the anon key.

**Frontend (Chunk 24):** public page `web/app/quick-update/[token]/page.tsx` → `QuickUpdatePage` + `SeatStepper` (`web/components/inventory/quick-update/`); client `web/lib/marketplace/quick-update-client.ts` calls the Chunk 20 API (no login). Per deal: seat stepper per session, Still available / Sold out, then Confirm (single-use token). Expired/used/invalid token → clear message + link to `/auth/login` (return to inventory). Success state after submit. Path matches `buildQuickUpdatePath`.

---

## 5.9 Roles and permissions (server)

All operator API routes enforce access via `can(user, operatorId, action)` in `web/lib/marketplace/permissions.ts` (or `requirePermission` which returns 401/403). The UI may mirror these rules but must never be the only check.

| Action | owner | manager | staff |
|---|---|---|---|
| `inventory.read` | ✓ | ✓ | ✓ |
| `inventory.write` | ✓ | ✓ | |
| `settings.integrations` | ✓ | ✓ | |
| `settings.defaults` | ✓ | ✓ | |
| `settings.team` | ✓ | ✓ | |
| `settings.compliance` | ✓ | ✓ | |
| `settings.profile.write` | ✓ | ✓ | |
| `settings.profile.read` | ✓ | ✓ | ✓ |
| `settings.notifications.own` | ✓ | ✓ | ✓ |
| `settings.billing` | ✓ | | |
| `settings.account` | ✓ | | |
| `admin.*` | platform admin only (`profiles.is_platform_admin` / auth `app_metadata.is_platform_admin`) | | |

Membership must be `invite_status = accepted`. Non-members and pending invites fail closed. Platform admin does **not** grant operator inventory/settings actions by itself. Never grant platform admin from client-writable `user.user_metadata` (Auth `updateUser` data); only `profiles.is_platform_admin` and/or server-set `app_metadata.is_platform_admin`.

**Database enforcement (security S7):** `public.profiles` INSERT RLS requires `auth.uid() = id AND is_platform_admin IS NOT TRUE` (migration `20261030000001_harden_profiles_insert_platform_admin.sql`). Clients cannot create a profile row already marked platform admin. UPDATE already prevents changing the flag (`20261020000006`). Granting admin remains service_role / SQL only. Signup `handle_new_user` and client `ensureUserProfile` omit the flag (DEFAULT false).

**Server auth:** `getMarketplaceAuth` / `getServerUser` must revalidate the JWT with Supabase Auth via `getUser()` (Bearer header token or cookie). Never authorize from unverified `getSession().user` alone; `getSession()` may only supply the access token after `getUser()` succeeds.

---

## 6. Settings tab
Eight sub-sections. Owners see all; Managers all except Billing and Account; Staff see Business profile read-only and their own Notifications.

- **6.1 Integrations**: provider cards (Rezdy live; FareHarbor, Bókun, Checkfront "Coming soon") with status, account name, last successful sync. Provider detail: Connection (connect, account, connected by/date, Test connection, Disconnect warning with count of deals to be paused); Health; Products table (enable toggle, auto-enable, refresh); Sync (mode, interval, Resync now); Booking links (default destination, base URL, Test link); Conversion tracking; Sync log. Manual operators see a card explaining the benefits of connecting.
- **6.2 Business profile**: all Operator fields; Preview operator page (`GET .../operators/:id/preview` → `serializeOperatorPreview`). **Database enforcement (security S8):** travellers/anon must not read internal contacts or tax IDs via PostgREST — use `marketplace.operators_public` (or the preview serializer); base-table public SELECT policy removed and anon SELECT revoked.
- **6.3 Deal defaults**: all OperatorBookingDefaults fields; note that changes apply to new deals only. **Database enforcement (security S5):** clients cannot INSERT booking-default rows via PostgREST (policy + INSERT revoke); create-operator trigger / service_role only. Owners/managers PATCH via API (UPDATE RLS unchanged).
- **6.4 Notifications** (Chunk 39): grid of events × channels per user (`GET|PATCH /api/marketplace/operators/:id/notifications/me`). Starred events cannot be fully turned off (≥1 channel stays on). `notify(operatorId, eventType, payload)` fans out per prefs via email/SMS stubs + in-app (`marketplace.in_app_notifications`; list/mark-read under `.../notifications/in-app`). Domain: `web/lib/marketplace/notifications.ts`; UI `/account/settings/notifications`.

| Event | Default channels |
|---|---|
| integration_sync_failing * | Email, SMS, in-app |
| deal_auto_paused * | Email, in-app |
| attestation_due * | Email, SMS |
| booking_link_broken * | Email, in-app |
| deal_review_update (submitted/approved/rejected) | Email, in-app |
| deal_lifecycle (live/sold out/expired) | In-app |
| auto_rule_created_deals | In-app |
| daily_performance_summary | Email |
| compliance_expiring * | Email |

- **6.5 Team**: list, invite by email with role, change role, remove, resend/revoke. Always ≥1 Owner. Backend: `web/lib/marketplace/team.ts` — `GET|POST /api/marketplace/operators/:id/team` (invite emails a signed token; HMAC via `TEAM_INVITE_TOKEN_SECRET` / fallbacks — security S11: no `"dev-team-invite-token-secret"` in production, missing → 503), `PATCH|DELETE /api/marketplace/team/:mid`, `POST .../resend` / `.../revoke`, `GET|POST /api/marketplace/team/invite/:token` (accept links `user_id`; email must match). Only owners may create or change owners; `ensureAcceptedOwner` blocks removing/demoting the last accepted owner. **Database enforcement (security S3):** membership UPDATE/INSERT RLS alone is not enough — managers could PATCH `role = 'owner'` via PostgREST. BEFORE INSERT/UPDATE/DELETE triggers on `marketplace.team_members` require an accepted owner (or first-owner bootstrap) to grant `owner`, and reject removing the last accepted owner; legacy `marketplace.organization_members` mirrors the same owner-escalation / last-owner rules. Migration: `supabase/migrations/20261026000001_lock_operator_admin_and_team_roles.sql`. `last_active_at` updated on authenticated operator requests (throttled).  **Database enforcement (security S4):** `marketplace.team_invite_tokens` has RLS enabled with no client policies; grants revoked from `anon`/`authenticated`; `service_role` only (migration `20261027000001_enable_rls_token_reminder_tables.sql`; today invite tokens stay in-memory). UI: `/account/settings/team` + `/team/invite/[token]`.
- **6.6 Compliance**: manage ComplianceDocuments (`operator-compliance.ts`). CRUD + file upload (pdf/jpg/png ≤10 MB) under `GET|POST /api/marketplace/operators/:id/compliance`, `GET|PATCH|DELETE .../compliance/:docId`. New/changed docs → `review_status=pending`. Admin approve/reject: `POST /api/marketplace/admin/operators/:id/compliance/:docId/{approve,reject}`. Daily job reminds at 30/7 days and marks expired. When `ENFORCE_COMPLIANCE_ON_PUBLISH`, required docs (default `public_liability_insurance`) missing/expired fail publish validation. UI: `/account/settings/compliance`. **Database enforcement (security S6):** owner/manager UPDATE RLS alone is not enough — operators could PATCH `review_status = 'approved'` (or set `reviewer_notes`) via PostgREST. A BEFORE INSERT/UPDATE trigger on `marketplace.compliance_documents` rejects client changes to `review_status` / `reviewer_notes` unless `current_user` is `service_role`, `postgres`, or `supabase_admin`; INSERT by clients must stay `review_status = 'pending'` and `reviewer_notes` NULL. No `reviewed_at` column exists today. App CRUD already omits review fields from client input; admin approve/reject and the expiry job must persist via a service-role client when leaving in-memory stores. Migration: `supabase/migrations/20261029000001_lock_compliance_review_status.sql`.
- **6.7 Billing**: owner only (`settings.billing`). Backend: `web/lib/marketplace/billing.ts` — `GET|PATCH /api/marketplace/operators/:id/billing`. Response: plan, billing_model, commission_pct (read-only), billing_email (PATCH only), payment method summary resolved from `payment_method_ref` via the billing provider (never returns the ref or card PAN), invoices fetched live from the billing provider with download links, current-period usage (booking clicks from `ClickEvent` when `per_click`; attributed bookings / revenue from `DealMetricDaily` when `commission`). When no billing provider is configured (`BILLING_PROVIDER_CONFIGURED` unset), invoices are stubbed and `billing_provider.configured=false` with an explanatory message. UI: `/account/settings/billing`.
- **6.8 Account**: owner for export/close (`settings.account`); login settings are user-scoped. Backend: `web/lib/marketplace/account.ts` — `POST /api/marketplace/operators/:id/export` returns CSV payloads for deals, `DealMetricDaily`, and `DealEvent` (browser downloads each file); `POST /api/marketplace/operators/:id/close {confirm_text}` requires `confirm_text` to exactly match the operator `trading_name`, then ends all live/scheduled deals, disconnects integrations (deletes secrets), sets `account_status=suspended`. **Database enforcement (security S3):** `account_status` and `requires_manual_review` on `marketplace.operators` are locked to `service_role` / `postgres` / `supabase_admin` (BEFORE INSERT/UPDATE trigger in the same migration as §6.5). Operator profile PATCH already strips these fields in app code; platform admin / account-close persistence must use a service-role client when writing the DB. Login email/password change via existing Supabase auth (`/account/details`). **TODO (SSO / 2FA):** no SSO or 2FA provider is wired in this codebase yet — leave Account UI copy pointing at profile/password only until an auth provider that supports them is chosen. UI: `/account/settings/account`.

---

## 7. Rezdy research (Chunk 30) — decided for Chunk 31

Sources (current public docs as of research): [Supplier API](https://developers.rezdy.com/rezdyapi/index-supplier.html), [Agent API](https://developers.rezdy.com/rezdyapi/index-agent.html), [Webhooks](https://developers.rezdy.com/rezdywebhooks/index.html), Rezdy support articles on promo codes, affiliate links, and webhook setup.

**Chosen surface:** Supplier API (`https://api.rezdy.com/v1`, staging `https://api.rezdy-staging.com/v1`). We are a referral marketplace (no payments / no checkout on our side), so we do **not** book through the Agent/marketplace API. Each operator connects their own supplier API key; we read products and availability and deep-link travellers to the operator’s Rezdy booking page.

### 7.1 Auth and how an operator grants access
- **Method:** API key per supplier account (`auth_type = api_key`). Pass as query `apiKey=` or HTTP header `apiKey` on every HTTPS call. No CORS — server-side only.
- **Grant flow:** Operator logs into Rezdy → Integrations → Rezdy API → Request API Key → pastes the key into our connect form. We store it only via `storeSecret` → `credentials_ref`; never log or return it.
- **Account identity on connect:** `GET /products` (or first successful call) returns `supplierId` / `supplierAlias` / `supplierName` on product rows; `GET /companies/alias/{companyAlias}` can refine display name. Store `external_account_id` = supplierId (string), `external_account_name` = supplierName (or alias).
- **Not used for v1:** Agent API OAuth/marketplace connection (would imply reselling/booking). RezdyConnect is for inbound channel-manager supply, not our use case.

### 7.2 Rate limits → poll interval
- **Limit:** 100 calls per minute per API key. Excess → HTTP 406 `"Too Many Requests"`. Rezdy may alter the limit; cache products/availability as they recommend.
- **Safe adapter bounds:** `min_poll_seconds = 60`, `max_poll_seconds = 900` (15 min = `SYNC_STALE_MINUTES`). Default connect poll = **300 s (5 min)** so a full sync (paginated `GET /products` + batched `GET /availability`) stays well under 100/min and under the stale-sync fail-closed window.
- Throttle + exponential backoff on 406 in the Rezdy adapter (Chunk 31). Click rechecks share the same throttle.

### 7.3 Products, sessions/availability, prices
| Need | Endpoint | Notes |
|---|---|---|
| Products | `GET /v1/products` (offset/limit ≤100), `GET /v1/products/{productCode}` | Product codes start with `P` (e.g. `PWQF1Y`). Fields: name, descriptions, images, `durationMinutes`, location, `priceOptions`, `timezone`, currency, bookingMode. |
| Sessions / seats | `GET /v1/availability?productCode=&startTimeLocal=&endTimeLocal=` | Returns sessions with `id`, `startTime` (UTC), `startTimeLocal`, `seats` / `seatsAvailable`, per-session `priceOptions`. Multiple `productCode` params allowed in one call — use for sync batching. |
| Single-session recheck | Same availability call with start=end = session local start | Honour `timeoutMs` on Book now. |
| Prices | Product + session `priceOptions[]` | Money arrives as decimal major units → convert to integer minor units in the adapter. Times → UTC ISO. |

**Price option → our `price_option_type`:** Rezdy does **not** expose a typed enum on the public PriceOption model (fields: `id`, `label`, `price`, `seatsUsed`, `minQuantity`/`maxQuantity`, `priceGroupType` e.g. `EACH`). Map by case-insensitive `label` heuristics: Adult→`adult`, Child→`child`, Infant→`infant`, Senior→`senior`, Student→`student`, Family→`family`, Group / Everyone / shared-seat labels→`group`, else `per_unit`. Store `external_price_option_id` = stringified Rezdy `id` (and keep `label` for booking-form display). `priceGroupType` other than per-person/`EACH` still maps to `group` or `per_unit` as above.

### 7.4 Webhooks → sync_mode
Documented webhook types (operator configures URL in Rezdy UI): **New/Updated/Cancelled Order**, **New/Updated/Deleted Product**, **New Contact**. There is **no availability or session webhook**.

**Decision:** `sync_mode = hybrid`.
- **Polling** (required): availability and seats via `GET /availability` on `poll_interval_seconds`.
- **Webhooks** (optional accelerator): product create/update/delete → incremental product sync; order webhooks → conversion attribution (Chunk 45), not seat updates.
- No HMAC/signature in Rezdy webhook docs. Chunk 31: issue a per-integration opaque path/token in the webhook URL and treat that as `webhook_secret_ref` verification (shared-secret-in-URL). Reject unknown tokens. Document that Rezdy does not sign bodies.

### 7.5 Promo codes via API
- **Supplier API:** Promo/coupon redemption is supported on **`POST /v1/bookings/quote`** and booking create via a `coupon` field (changelog). `GET /v1/vouchers` / `GET /v1/vouchers/{voucherCode}` lists **gift-card vouchers**, not a full promo-code catalogue with % off metadata.
- **Agent API:** Coupons explicitly **not** available — another reason we use Supplier API.
- **`verifyDiscount` behaviour (Chunk 31/33):**
  - `price_option` / `separate_product`: compare listed price options / second product prices → `verified` | `not_found`.
  - `promo_code`: attempt `POST /bookings/quote` with the code and expected quantities; if quote succeeds and discounted total matches `expected_price_minor` → `verified`; if code missing → `not_found`; if quote cannot prove the deal price without placing a hold → **`cannot_verify`** and require operator confirm + Test link (already in Chunk 33).
- Do **not** create bookings to verify codes.

### 7.6 Booking page URL format (session / promo deep links)
Documented product booking URL:

```text
https://{supplierAlias}.rezdy.com/view/{productCode}
```

Equivalent to the numeric booking-form product path. Prefer alias + productCode from API fields.

- **Session pre-select:** **Not documented** in the public API or support deep-link docs. Set `deep_link_session = false`. Workaround: link to the product page; put the session local date/time in `booking_instructions` so the traveller picks the right departure.
- **Promo pre-apply:** **Not documented** as a query param on the product URL (promo is entered at checkout; separate “Redeem Voucher” booking-button target exists but is not a product+code deep link). Set `deep_link_promo = false`. Workaround: instructions “Enter promo code CODE at checkout”; optional separate redeem URL only if the operator supplies one.
- Affiliate tracking (optional): `?agentCode={code}` on catalogue/product URLs when the operator has added us (or a labelled agent) — see §7.7.

`buildBookingUrl` v1 = product view URL above (+ optional `agentCode` when `conversion_tracking_method = booking_source` and a label is configured). Platform UTM/`click_id` still appended by `buildTrackedUrl` when `append_tracking_params` is true.

### 7.7 Conversion tracking / source labels
Bookings expose `source`, `resellerSource`, `sourceChannel`, `sourceReferrer`, `resellerComments`. `GET /bookings` can filter by `sourceChannel` (agent code).

| Our `conversion_tracking_method` | Rezdy approach |
|---|---|
| `promo_code` | Match orders that redeemed the deal’s promo (order coupon / voucher fields via list bookings or order webhooks). Best fit for referral. |
| `booking_source` | Operator creates/shares an agent (or affiliate) code; we append `?agentCode=` on Book now URLs; match `sourceChannel`. |
| `webhook` | Subscribe to New/Updated Order; attribute when promo or agent code matches (no generic click_id field from Rezdy online checkout). |
| `none` | Default until the operator configures one of the above. |

We cannot rely on Rezdy storing our `click_id` on online booking-form checkouts. Keep `click_id` in our `ClickEvent` / UTMs for analytics; attributed bookings need promo or agent-code matching.

### 7.8 RezdyAdapter `capabilities()` (for Chunk 31)

```ts
{
  available: true,
  webhooks_availability: false, // order + product only; seats via poll
  promo_code_verify: true,      // via POST /bookings/quote; may return cannot_verify
  deep_link_session: false,
  deep_link_promo: false,
  min_poll_seconds: 60,
  max_poll_seconds: 900,
}
```

Connect defaults: `auth_type = api_key`, `sync_mode = hybrid`, `poll_interval_seconds = 300` (clamped to min/max).

### 7.9 Spec assumptions Rezdy cannot meet — workarounds

| Spec assumption | Rezdy reality | Workaround |
|---|---|---|
| Live availability webhooks | No session/availability webhooks | Poll `GET /availability`; hybrid mode still useful for products/orders |
| Webhook HMAC signature | None documented | Opaque token in webhook URL (`webhook_secret_ref`) |
| Deep-link session on booking URL | Not documented | Product URL + session time in `booking_instructions` |
| Deep-link promo on booking URL | Not documented | Instructions to enter code; `cannot_verify` path + Test link |
| Typed price_option enum from provider | Free-text `label` (+ `priceGroupType`) | Heuristic label map; default `per_unit` |
| Read full promo catalogue / % off via API | Vouchers endpoint is gift cards; promos via quote | Quote to verify; operator confirm when unverifiable |
| Tag online booking with our click_id | Not available on booking form | UTM/`click_id` on our redirect only; attribute via promo_code or agentCode |
| Agent API promo validation | Coupons unavailable on Agent API | Use Supplier API key per operator |
| Per-price-option seat pools | API exposes session total seats only | `seats_displayed` from session total; note limitation in UI if needed |

### 7.10 Other open decisions (non-Rezdy) — already decided
4. **Billing model** — still product-level; commission makes conversion tracking mandatory when that model is chosen (use §7.7). Not blocking Chunk 31.
5. **Compliance on publish** — `ENFORCE_COMPLIANCE_ON_PUBLISH` (default false) in config.
6. **Manual review count** — `MANUAL_REVIEW_COUNT` (default 3) in config.

---


## Project context

TravelScout monorepo; the active app is under `web/`.

| Item | Value |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| ORM | None — `@supabase/supabase-js` client with typed helpers |
| Database | PostgreSQL via Supabase (`supabase/migrations/`; marketplace schema already exists) |
| Test runner | Vitest (unit); Playwright (e2e) |
| Job / queue system | None yet (Redis is used for caching / rate limits only; some GitHub Actions crons for scrapers) |
| File storage | Supabase Storage (deal media uploads will use this; some deal rows still hold plain image URLs today) |
| Email / SMS provider | Email: Resend (e.g. password resets); SMS: none yet |
| Domain types / DB access | `web/lib/marketplace/types.ts`, `db.ts`, `deal.ts` (`operator_deals`), `deal-session.ts`, `deal-media.ts`, `deal-media-api.ts` (Chunk 14 upload/embed/cover), `media-storage.ts`, `image-dimensions.ts`, `deal-audit.ts`, `deal-status.ts` (§4.2 transitions), `deal-status-ticker.ts` (Chunk 18 status ticker + `isVisibleToTravellers`), `deal-actions.ts` (Chunk 19 pause/resume/end/seats/bulk), `deal-attestation.ts` (Chunk 20 expiry job, reminders, quick-update token, dashboard attest), `deal-list.ts` (Chunk 21 list/calendar/tabs/banners), `deals-list-ui.ts` / deals-list components (Chunk 23 list UI), `deal-editor.ts` / `operator-deals-client.ts` (Chunks 22–23 editor + list browser client), `deal-draft.ts` (Chunk 12 create/update/duplicate), `deal-inventory.ts` (Chunk 13 manual sessions / price options), `booking-destination.ts` / `booking-link.ts` (Chunk 15 link check + tracked URLs), `deal-publish-validation.ts` (§4.1 publish checks), `deal-publish.ts` (Chunk 17 publish/schedule/review/attest), `deal-book-now.ts` (Chunk 36 Book now + ClickEvent tracking), `notifications.ts` (Chunk 39 prefs + `notify` + in-app + daily summary), `team.ts` (Chunk 40 invites + last owner + last_active), `operator-compliance.ts` (Chunk 41 compliance CRUD + expiry job), `billing.ts` / `account.ts` (Chunk 42 billing + export/close), `timezone.ts` (operator-local ↔ UTC), `integration.ts`, `integration-connect.ts` (Chunk 27 connect/test/disconnect/settings), `secrets.ts`, `providers/` (Chunk 26 `ProviderAdapter` + registry + mock; Chunk 31 `providers/rezdy/` RezdyAdapter), `operators.ts`, `operator-profile.ts` (Chunk 38 business profile + booking defaults), `settings.ts`, `seed-dev.ts`, `permissions.ts`, `pricing.ts` (§4.0 maths) (plus `web/lib/supabase/`) |
| Permissions | `can(user, operatorId, action)` / `requirePermission` in `permissions.ts`; platform admin via `profiles.is_platform_admin` and/or `app_metadata.is_platform_admin` (never `user_metadata`); DB (S7): profiles INSERT cannot set `is_platform_admin` true; UPDATE already locked; server cookie/header auth via `getUser()` (`auth.ts` / `supabase/server.ts`), never unverified `getSession().user`; DB (S8): anon operator reads via `marketplace.operators_public` only (not full `operators` rows); DB (S9/S10): anon deal reads via `operator_deals_public` / `deal_price_options_public` / `discount_steps_public` only (no `promo_code` or internal columns; filtered by `is_visible_to_travellers`, not `status=live` alone) |
| Inventory Deal table | `marketplace.operator_deals` (not legacy `marketplace.deals`) |
| Settings tables | `notification_preferences`, `in_app_notifications` (Chunk 39), `team_invite_tokens` (Chunk 40; security S4: RLS on, service_role only — same migration as quick-update / attestation reminder tables), `compliance_documents`, `billing_accounts` |
| Dev seed | `supabase/seeds/deals_platform_dev.sql` + `seed-dev.ts` (Harbour Kayaks / Bay Cruises) |
| Platform regions | `PLATFORM_REGIONS` in `settings.ts` |
| Provider secrets | `storeSecret` / `readSecret` / `deleteSecret` in `secrets.ts`; ciphertext in `marketplace.encrypted_secrets`; API serializers omit `credentials_ref` / `webhook_secret_ref` |
| Required production secrets (S11) | Fail closed (no `"dev-…"` / `DEV_TEST_KEY_HEX` fallbacks) when `NODE_ENV=production` (and not `DEAL_PLATFORM_SEED=1`): **`SECRETS_ENCRYPTION_KEY`** (32-byte hex or base64 — AES-256-GCM for provider credentials); **`QUICK_UPDATE_TOKEN_SECRET`** (HMAC for quick-update tokens; may fall back to `SECRETS_ENCRYPTION_KEY` if set); **`TEAM_INVITE_TOKEN_SECRET`** (HMAC for team invites; may fall back to `QUICK_UPDATE_TOKEN_SECRET` then `SECRETS_ENCRYPTION_KEY`). Missing → throw / HTTP 503. Development and Vitest may use documented local fallbacks. Helper: `allowsDevSecretFallback` in `secrets.ts`. |
| API routes | `web/app/api/` (marketplace under `web/app/api/marketplace/`). Inventory drafts: `POST /api/marketplace/operators/:operatorId/deals`, `GET\|PATCH\|DELETE /api/marketplace/operator-deals/:id`, `POST /api/marketplace/operator-deals/:id/duplicate`. Operator context (Chunk 22): `GET /api/marketplace/operators/me`. Deals list (Chunk 21): `GET .../operators/:operatorId/deals` (tabs/filters/banners), `GET .../deals/calendar`. Manual inventory (Chunk 13): `POST\|PATCH\|DELETE .../operator-deals/:id/sessions[/:sessionId]`, `POST\|PATCH\|DELETE .../price-options[/:optionId]`, `POST .../price-options/reorder`. Media (Chunk 14): `GET\|POST .../operator-deals/:id/media` (multipart upload), `POST .../media/video-embed`, `POST .../media/reorder`, `POST .../media/import-provider` (501 stub), `PATCH\|DELETE .../media/:mediaId`, `POST .../media/:mediaId/cover`. Link check (Chunk 15): `POST .../operator-deals/:id/test-link`. Publish (Chunk 17): `POST .../operator-deals/:id/publish`; admin `POST /api/marketplace/admin/deals/:id/{approve,reject,pause}`, `POST /api/marketplace/admin/operators/:operatorId/manual-review`. Operator actions (Chunk 19): `POST .../operator-deals/:id/{pause,resume,end,archive,seats,mark-sold-out}`, `POST .../operators/:operatorId/deals/bulk`. Attestation / quick-update (Chunk 20): `POST .../operator-deals/:id/attest`, `GET\|POST /api/marketplace/quick-update/:token` (no login). Book now (Chunk 36): `POST /api/marketplace/deals/:slug/book` (public; path param is deal slug). Integrations (Chunk 27/28/37): `GET .../operators/:operatorId/integrations`, `GET .../integrations/:provider` (detail), `POST .../integrations/:provider/{connect,test,disconnect,resync,test-booking-link}`, `GET .../disconnect-preview`, `PATCH .../settings`, products + sync-log routes. Profile / defaults (Chunk 38): `GET\|PATCH .../operators/:operatorId/profile`, `POST .../profile/{logo,cover}`, `GET .../preview`, `GET\|PATCH .../booking-defaults`. Notifications (Chunk 39): `GET\|PATCH .../operators/:operatorId/notifications/me`, `GET\|POST .../notifications/in-app`. Team (Chunk 40): `GET\|POST .../operators/:operatorId/team`, `PATCH\|DELETE /api/marketplace/team/:memberId`, `POST .../team/:memberId/{resend,revoke}`, `GET\|POST /api/marketplace/team/invite/:token`. Compliance (Chunk 41): `GET\|POST .../operators/:operatorId/compliance`, `GET\|PATCH\|DELETE .../compliance/:docId`; admin `POST .../admin/operators/:operatorId/compliance/:docId/{approve,reject}`. Billing / account (Chunk 42): `GET\|PATCH .../operators/:operatorId/billing`, `POST .../export`, `POST .../close` (distinct from legacy `/api/marketplace/deals`) |
| Jobs | Link checker: call `runLinkCheckerJob` every 6 h; status ticker: call `runStatusTickerJob` every minute; attestation: call `runAttestationJob` every minute; daily summary: call `runDailyPerformanceSummaryJob` every hour; metrics rollup: call `runMetricsRollupJob` hourly (Chunk 45); compliance expiry: call `runComplianceExpiryJob` daily; auto-deal rules: call `runDealRulesJob` every 15 m (Chunk 44) — no scheduler wired yet |
| Tests | Colocated `__tests__` under `web/lib/`, `web/components/`, `web/app/api/`; e2e in `web/e2e/` |
| Operator UI | Account inventory list: `web/app/account/inventory/`, `web/components/inventory/deals-list/` (Chunk 23). Deal editor: `web/app/account/inventory/deals/`, `web/components/inventory/deal-editor/` (Chunk 22). Deal stats (Chunk 45): `/account/inventory/deals/[dealId]/stats` → `web/components/inventory/deal-stats/`. Auto-deal rules (Chunk 44): `/account/inventory/auto-deal-rules`. Quick-update mobile: `/quick-update/[token]` → `web/components/inventory/quick-update/` + `quick-update-client.ts` (Chunk 24). Integrations settings (Chunk 37): `/account/settings/integrations` + `/[provider]` → `web/components/settings/integrations/` + `integrations-client.ts` / `integrations-settings-ui.ts`. Business profile + deal defaults (Chunk 38): `/account/settings/business-profile` + `/deal-defaults` → `web/components/settings/profile/` + `operator-profile-client.ts` / `operator-profile-ui.ts`. Notifications (Chunk 39): `/account/settings/notifications` → `web/components/settings/notifications/` + `notifications-client.ts` / `notifications-ui.ts`. Team (Chunk 40): `/account/settings/team` + `/team/invite/[token]` → `web/components/settings/team/` + `team.ts` / `team-client.ts` / `team-ui.ts`. Compliance (Chunk 41): `/account/settings/compliance` → `web/components/settings/compliance/` + `operator-compliance.ts` / `compliance-client.ts` / `compliance-ui.ts`. Billing + account (Chunk 42): `/account/settings/billing` + `/account/settings/account` → `web/components/settings/billing/` + `account/` + `billing.ts` / `account.ts` clients. Legacy org deals: `web/app/operator/`, `web/components/operator/` |
| Operator signup | `/operator/signup` creates auth user + `marketplace.organizations` (+ owner membership) in one step. Business fields go on auth `user_metadata` (`account_type=operator`, `business_*`); migration `20261025000001_bootstrap_operator_org_on_signup.sql` trigger creates the org when email confirmation means no JWT yet. Client `ensureOperatorOrganization` is the post-login safety net. Main-site `/auth/login?mode=signup` is traveler-only (no org). | |
