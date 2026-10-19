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

### 3.1 Deal
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
| region | string | Yes | From platform region list |
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

### 3.2 DealSession
One row per departure (session types) or per day (open window). Every deal has at least one.
| Field | Type | Req | Notes |
|---|---|---|---|
| deal_id | fk Deal | Yes | |
| external_session_id | fk ExternalSession | If integrated | |
| start_at | datetime | Yes | Future, and within MAX_LEAD_HOURS once live. Open window: start of the day's availability |
| end_at | datetime | No | Open window: end of the day's availability |
| provider_seats_available | int | System | Cached; refreshed on sync and click recheck |
| manual_seats_available | int | If manual | 0–999 |
| seat_cap | int | No | Per-session override of deal cap |
| seats_displayed | int | System | min(available, cap) |
| status | enum session_status | System | |
| last_synced_at | datetime | System | |

### 3.3 DealPriceOption
| Field | Type | Req | Notes |
|---|---|---|---|
| deal_id | fk Deal | Yes | Min 1 per deal |
| label | string | Yes | e.g. "Adult" |
| type | enum price_option_type | Yes | |
| external_price_option_id | string | If integrated | Provider's full-price option |
| external_deal_price_option_id | string | If price_option | Provider's discounted option |
| original_price_minor | int | Yes | From provider, or entered for manual |
| original_price_source | enum | System | |
| original_price_evidence_url | url | If manual | Public page showing standard price |
| deal_price_minor | int | Yes | Must satisfy 50% rule |
| discount_pct | decimal | System | 1 − deal/original, 1 dp |
| sort_order | int | Yes | |

### 3.4 DiscountStep
| Field | Type | Req | Notes |
|---|---|---|---|
| deal_id | fk Deal | Yes | |
| price_option_id | fk DealPriceOption | Yes | |
| hours_before_start | int | Yes | 1–72; applies from this point onward |
| deal_price_minor | int | Yes | ≤ previous step and meets 50% rule |
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
**Integration**: operator_id, provider (enum source_provider, one active per provider per operator), status (integration_status), auth_type, credentials_ref (reference to encrypted secret store; never plain text, never returned to client), external_account_id, external_account_name, sync_mode, poll_interval_seconds (bounded by provider rate limits), webhook_secret_ref, webhook_last_received_at, last_sync_at, last_successful_sync_at (drives SYNC_STALE_MINUTES), last_error_code, last_error_message, default_booking_destination_type, booking_base_url, conversion_tracking_method, booking_source_label, auto_enable_new_products (default false), connected_at, connected_by.

**ExternalProduct**: integration_id, external_id, name, description, images json, duration_minutes, location json, price_options json, is_enabled_for_deals bool, archived_in_provider bool, raw_payload json, last_synced_at.

**ExternalSession**: external_product_id, external_id, start_at, end_at, seats_available, total_capacity, status, prices json, last_synced_at. Only sessions within the next 72 h (plus buffer) need syncing.

**SyncLog**: integration_id, sync_type, status, started_at, finished_at, items_processed, error_code, error_message, affected_deal_ids.

### 3.9 Operator and settings tables
| Table | Fields | Notes |
|---|---|---|
| Operator | legal_name, trading_name, slug, logo, cover_image, short_description (≤160), long_description (≤3,000), website, public_email, public_phone, internal_email, internal_phone, address, regions_served string[], timezone, currency, languages string[], gst_number, nzbn, social_links json, account_status, requires_manual_review bool | requires_manual_review is admin-set; forces pending_review on publish |
| OperatorBookingDefaults | default_sales_cutoff_minutes, default_seat_cap, default_discount_pct, default_discount_mechanism, default_booking_destination_type, default_booking_url, default_booking_phone, default_booking_email, default_booking_instructions, default_cancellation_policy_type, default_cancellation_policy_text, default_attestation_reminder_hours | One row per operator; pre-fills new deals |
| NotificationPreference | user_id, operator_id, event_type, email, sms, in_app | Events in 6.4 |
| TeamMember | operator_id, user_id, role, invited_email, invite_status, invited_at, last_active_at | Min 1 owner per operator |
| ComplianceDocument | operator_id, doc_type, file, issuer, reference_number, issued_on, expires_on, review_status, reviewer_notes | Expiry reminders at 30 and 7 days |
| BillingAccount | operator_id, plan, billing_model, commission_pct, billing_email, payment_method_ref, status | Invoices pulled from billing provider, not stored |

---

## 4. Validation, status lifecycle and background jobs
A deal can only go live when every check passes, and it leaves live automatically the moment any check stops passing.

### 4.1 Publish validation
| Check | Applies to | Rule |
|---|---|---|
| Required fields | All | Every Req field in section 3 present and valid |
| 50% minimum | All | For every price option and every step: `deal_price_minor ≤ original_price_minor × (1 − MIN_DISCOUNT_PCT/100)` |
| Images | All | ≥1 image, exactly 1 cover, all with alt text |
| Session timing | All | ≥1 session starting in the future; sessions further than MAX_LEAD_HOURS put the deal in scheduled, not live |
| Booking destination | All | URL passes link check (2xx/3xx within 5 s), or phone/email valid |
| Integration healthy | Integrated | Integration connected and last_successful_sync_at within SYNC_STALE_MINUTES |
| Product active | Integrated | ExternalProduct enabled and not archived in provider |
| Original price locked | Integrated | original_price_minor equals provider's current price; not editable |
| Discount exists in provider | Integrated, price_option | Discounted provider option exists and price equals deal_price_minor |
| Promo code confirmed | Integrated, promo_code | Verified via provider API if supported; else operator ticks "This code exists in my booking system" and runs Test link |
| Session available | Integrated | Provider session exists, not cancelled, seats available |
| Price evidence | Manual | original_price_evidence_url provided and reachable |
| Seats entered | Manual | manual_seats_available > 0 for at least one session/day |
| Attestation | Manual | Operator ticks "These seats are available and I will honour this price"; creates a DealAttestation |
| Review | Manual, or requires_manual_review | Operator's first 3 manual deals, or all deals if flagged, go to pending_review |

### 4.2 Status transitions
| From | Trigger | To |
|---|---|---|
| draft | Submitted; validation passes; review required | pending_review |
| draft / pending_review | Validation passes (and admin approves if reviewed); publish_at in future or no session within 72 h yet | scheduled |
| draft / pending_review / scheduled | publish_at reached, a session within 72 h, all checks pass | live |
| live | Operator pauses | paused |
| paused | Operator resumes; checks re-run and pass | live |
| live | Any auto-pause trigger (4.3) | auto_paused |
| auto_paused | Trigger clears (auto-resume reasons only) | live |
| live | Every remaining session has 0 seats displayed | sold_out |
| sold_out | Seats reappear before cutoff | live |
| live / sold_out / auto_paused | Every session past start_at − sales_cutoff_minutes | expired |
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
1. Traveller clicks Book now → create ClickEvent with unique click_id.
2. Integrated: call provider availability for that session, 2-second timeout.
   - Seats available → update cache, redirect.
   - Sold out → mark session sold_out, show "Just sold out" with other live deals nearby.
   - Timeout/error → redirect only if cached value is under 5 minutes old; otherwise show operator contact details and "We couldn't confirm live availability".
3. Manual: confirm attestation current and seats > 0, then show booking_instructions and destination.
4. URL destinations with append_tracking_params: append utm_source, utm_medium, utm_campaign (deal slug), click_id.

### 4.5 Background jobs
| Job | Frequency | Does |
|---|---|---|
| Provider sync | Per poll_interval_seconds + webhooks | Refresh ExternalProduct / ExternalSession for next 72 h + buffer |
| Stale-sync monitor | Every minute | Apply and clear sync_failure |
| Status ticker | Every minute | Move deals between scheduled, live, expired, sold_out; apply discount steps; archive after 30 days |
| Auto-deal rule runner | Every 15 minutes | Evaluate active DealRules, create deals |
| Link checker | On publish, then every 6 h | Update link_status; apply/clear link_broken |
| Attestation reminder | Continuous (every minute) | Remind operator 2 h before expiry with one-click reconfirm link (email/SMS) |
| Metrics rollup | Hourly | Aggregate into DealMetricDaily |
| Compliance expiry | Daily | Reminders at 30 and 7 days; mark expired |

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

### 5.4 Auto-deal rules
List: name, product, schedule summary, discount, active toggle, deals generated last 7 days, next run. Editor per 3.6 with template deal picker and live preview ("this rule would create 3 deals in the next 72 hours"). Generated deals show a "From rule" badge.

### 5.5 Templates
List, rename, delete, "Create deal from template". Store content, images, pricing approach, booking destination and defaults, not sessions.

### 5.6 Manual operator quick update
Email/SMS reconfirm link opens a mobile page without full login, scoped by a signed single-use token valid for the attestation window. Shows each live manual deal with a seat stepper and two buttons: Still available, Sold out.

---

## 6. Settings tab
Eight sub-sections. Owners see all; Managers all except Billing and Account; Staff see Business profile read-only and their own Notifications.

- **6.1 Integrations**: provider cards (Rezdy live; FareHarbor, Bókun, Checkfront "Coming soon") with status, account name, last successful sync. Provider detail: Connection (connect, account, connected by/date, Test connection, Disconnect warning with count of deals to be paused); Health; Products table (enable toggle, auto-enable, refresh); Sync (mode, interval, Resync now); Booking links (default destination, base URL, Test link); Conversion tracking; Sync log. Manual operators see a card explaining the benefits of connecting.
- **6.2 Business profile**: all Operator fields; Preview operator page.
- **6.3 Deal defaults**: all OperatorBookingDefaults fields; note that changes apply to new deals only.
- **6.4 Notifications**: grid of events × channels per user. Starred events cannot be fully turned off (≥1 channel stays on).

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

- **6.5 Team**: list, invite by email with role, change role, remove, resend/revoke. Always ≥1 Owner.
- **6.6 Compliance**: manage ComplianceDocuments. Expired required documents can block publishing if enforced (config flag).
- **6.7 Billing**: plan, model, commission (read-only), billing email, payment method, invoices, current-period usage.
- **6.8 Account**: login, password/SSO, 2FA, CSV data export (deals, metrics, audit log), close account (ends live deals, disconnects integrations, Owner confirmation).

---

## 7. Open decisions
1. Which discount mechanisms Rezdy supports via API (promo code read/validate; booking page deep link that pre-selects a session and applies a code).
2. Rezdy auth method for a marketplace partner and its rate limits (sets minimum poll interval).
3. Whether Rezdy webhooks cover availability changes or only bookings (hybrid vs polling).
4. Billing model. Commission makes conversion tracking mandatory.
5. Whether expired compliance documents block publishing (build as a config flag, default off).
6. Number of manual deals reviewed before trust (assume 3, make it a constant `MANUAL_REVIEW_COUNT`).

Record answers here when decided.

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
| Domain types / DB access | `web/lib/marketplace/types.ts`, `web/lib/marketplace/db.ts` (plus `web/lib/supabase/`); deals platform constants in `web/lib/marketplace/config.ts`, enums in `web/lib/marketplace/enums.ts`; Operator / booking defaults / team in `web/lib/marketplace/operators.ts` (`marketplace.operators`, `operator_booking_defaults`, `team_members`) |
| API routes | `web/app/api/` (marketplace under `web/app/api/marketplace/`) |
| Jobs | None yet for the deals platform |
| Tests | Colocated `__tests__` under `web/lib/`, `web/components/`, `web/app/api/`; e2e in `web/e2e/` |
| Operator UI | `web/app/operator/`, `web/components/operator/` |
