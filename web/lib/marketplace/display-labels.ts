/**
 * Human-facing labels for operator UI option lists and status chips.
 * Title Case for selectable options; plain language over internal jargon.
 * Enum keys stay snake_case in the API — only display strings live here.
 */

import type {
  BillingModel,
  BookingDestinationType,
  CancellationPolicyType,
  CapacityMode,
  Category,
  ComplianceDocType,
  ConversionTrackingMethod,
  DealStatus,
  DealType,
  DiscountInputMode,
  DiscountMechanism,
  FitnessLevel,
  IntegrationStatus,
  InviteStatus,
  PauseReason,
  PriceOptionType,
  ReviewStatus,
  RuleType,
  SourceProvider,
  SyncMode,
  SyncType,
  UserRole,
} from "./enums";
import type { DealListRowAction, DealListTab } from "./deal-list-shared";
import type { NotificationEventType } from "./settings";

/** Keep in sync with deal-publish-validation EDITOR_STEPS (avoid circular import). */
type EditorStep =
  | "type"
  | "content"
  | "images"
  | "pricing"
  | "availability"
  | "destination"
  | "review";

/** Keep in sync with integration SYNC_LOG_STATUSES. */
type SyncLogStatus = "running" | "success" | "failed";

export const DEAL_LIST_TAB_LABELS: Record<DealListTab, string> = {
  live: "Live",
  scheduled: "Scheduled",
  needs_attention: "Needs Attention",
  paused: "Paused",
  drafts: "Drafts",
  sold_out: "Sold Out",
  past: "Past",
};

export const DEAL_LIST_ROW_ACTION_LABELS: Record<DealListRowAction, string> = {
  edit: "Edit",
  duplicate: "Duplicate",
  pause: "Pause",
  resume: "Resume",
  end: "End Deal",
  preview: "Preview",
  view_stats: "View Stats",
  save_as_template: "Save As Template",
  update_seats: "Update Seats",
  mark_sold_out: "Mark As Sold Out",
};

export const DEAL_STATUS_LABELS: Record<DealStatus, string> = {
  draft: "Draft",
  pending_review: "Awaiting Review",
  scheduled: "Scheduled",
  live: "Live",
  paused: "Paused",
  auto_paused: "Paused Automatically",
  sold_out: "Sold Out",
  expired: "Expired",
  ended: "Ended",
  archived: "Archived",
};

export const PAUSE_REASON_LABELS: Record<PauseReason, string> = {
  operator: "You Paused This Deal",
  admin: "Paused By Support",
  sync_failure: "Booking System Sync Failed",
  session_cancelled: "Session Was Cancelled",
  capacity_zero: "No Seats Left",
  price_below_threshold: "Discount Below 50%",
  attestation_expired: "Seats Need Reconfirming",
  link_broken: "Booking Link Not Working",
  cutoff_passed: "Sales Window Closed",
  integration_disconnected: "Booking System Disconnected",
};

export const DEAL_TYPE_LABELS: Record<DealType, string> = {
  integrated_session: "From Booking System — One Departure",
  integrated_multi_session: "From Booking System — Several Departures",
  manual_session: "Fixed Times (You Enter)",
  manual_open_window: "Flexible Dates (You Enter)",
};

export const SOURCE_PROVIDER_LABELS: Record<SourceProvider, string> = {
  rezdy: "Rezdy",
  fareharbor: "FareHarbor",
  bokun: "Bókun",
  checkfront: "Checkfront",
  manual: "Manual",
};

export const CATEGORY_LABELS: Record<Category, string> = {
  tour: "Tour",
  adventure: "Adventure",
  water: "Water",
  cruise: "Cruise",
  food_wine: "Food & Wine",
  attraction: "Attraction",
  wellness: "Wellness",
  accommodation: "Accommodation",
  rental: "Rental",
  transport: "Transport",
  other: "Other",
};

export const FITNESS_LEVEL_LABELS: Record<FitnessLevel, string> = {
  easy: "Easy",
  moderate: "Moderate",
  challenging: "Challenging",
  extreme: "Extreme",
};

export const PRICE_OPTION_TYPE_LABELS: Record<PriceOptionType, string> = {
  adult: "Adult",
  child: "Child",
  infant: "Infant",
  senior: "Senior",
  student: "Student",
  family: "Family",
  group: "Group",
  per_unit: "Per Unit",
};

export const DISCOUNT_MECHANISM_LABELS: Record<DiscountMechanism, string> = {
  promo_code: "Discount Code",
  price_option: "Special Price In Booking System",
  separate_product: "Separate Discounted Product",
  manual_price: "Price You Set",
  quote_code: "Quote Code",
};

export const DISCOUNT_INPUT_MODE_LABELS: Record<DiscountInputMode, string> = {
  deal_price: "Enter Deal Price",
  percentage: "Enter Percentage Off",
};

export const CANCELLATION_POLICY_LABELS: Record<
  CancellationPolicyType,
  string
> = {
  non_refundable: "Non-Refundable",
  operator_standard: "Your Standard Policy",
  custom: "Custom",
};

export const BOOKING_DESTINATION_LABELS: Record<
  BookingDestinationType,
  string
> = {
  provider_booking_page: "Booking System Page",
  operator_website: "Your Website",
  phone: "Phone",
  email: "Email",
};

export const CAPACITY_MODE_LABELS: Record<CapacityMode, string> = {
  live_provider: "Live From Booking System",
  live_provider_capped: "Live From Booking System (With Cap)",
  manual_count: "Enter Seats Yourself",
};

export const INTEGRATION_STATUS_LABELS: Record<
  IntegrationStatus | "not_connected",
  string
> = {
  not_connected: "Not Connected",
  connecting: "Connecting…",
  connected: "Connected",
  degraded: "Unstable",
  error: "Error",
  disconnected: "Disconnected",
};

export const SYNC_MODE_LABELS: Record<SyncMode, string> = {
  webhook: "Instant Updates",
  polling: "Check On A Schedule",
  hybrid: "Instant + Scheduled",
};

export const CONVERSION_TRACKING_LABELS: Record<
  ConversionTrackingMethod,
  string
> = {
  none: "None",
  promo_code: "Discount Code",
  booking_source: "Booking Source Label",
  webhook: "Automatic Notification",
};

export const SYNC_TYPE_LABELS: Record<SyncType, string> = {
  full: "Full Sync",
  incremental: "Partial Sync",
  webhook: "Instant Update",
  click_recheck: "Recheck When Someone Clicks",
  manual: "Manual Sync",
};

export const SYNC_LOG_STATUS_LABELS: Record<SyncLogStatus, string> = {
  running: "Running",
  success: "Success",
  failed: "Failed",
};

export const RULE_TYPE_LABELS: Record<RuleType, string> = {
  daily: "Daily",
  weekly: "Weekly",
  specific_dates: "Specific Dates",
};

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  owner: "Owner",
  manager: "Manager",
  staff: "Staff",
};

export const INVITE_STATUS_LABELS: Record<InviteStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  revoked: "Revoked",
};

export const COMPLIANCE_DOC_TYPE_LABELS: Record<ComplianceDocType, string> = {
  public_liability_insurance: "Public Liability Insurance",
  adventure_activities_certificate: "Adventure Activities Certificate",
  maritime_licence: "Maritime Licence",
  business_licence: "Business Licence",
  food_licence: "Food Licence",
  other: "Other",
};

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  pending: "Pending Review",
  approved: "Approved",
  rejected: "Rejected",
  expired: "Expired",
};

export const BILLING_MODEL_LABELS: Record<BillingModel, string> = {
  subscription: "Subscription",
  per_click: "Per Booking Click",
  commission: "Commission",
};

export const BILLING_ACCOUNT_STATUS_LABELS: Record<string, string> = {
  active: "Active",
  past_due: "Past Due",
  cancelled: "Cancelled",
  none: "None",
};

export const EDITOR_STEP_LABELS: Record<EditorStep, string> = {
  type: "Deal Type",
  content: "Details",
  images: "Photos & Video",
  pricing: "Pricing",
  availability: "Dates & Seats",
  destination: "Where Travellers Book",
  review: "Review & Publish",
};

export const STATS_METRIC_LABELS = {
  impressions: "Times Shown",
  detail_views: "Page Views",
  booking_clicks: "Book Now Clicks",
  ctr: "Click-Through Rate",
  sold_out_on_click: "Sold Out When Clicked",
  attributed_bookings: "Bookings From This Deal",
  attributed_revenue_minor: "Revenue From This Deal",
} as const;

export const NOTIFICATION_CHANNEL_LABELS: Record<
  "email" | "sms" | "in_app",
  string
> = {
  email: "Email",
  sms: "SMS",
  in_app: "In App",
};

export const NOTIFICATION_EVENT_LABELS: Record<NotificationEventType, string> =
  {
    integration_sync_failing: "Booking System Sync Failing",
    deal_auto_paused: "Deal Paused Automatically",
    attestation_due: "Seat Reconfirm Due",
    booking_link_broken: "Booking Link Broken",
    deal_review_update: "Deal Review Update",
    deal_lifecycle: "Deal Status Changes",
    auto_rule_created_deals: "Auto Rule Created Deals",
    daily_performance_summary: "Daily Performance Summary",
    compliance_expiring: "Compliance Documents Expiring",
  };

export const NOTIFICATION_EVENT_DESCRIPTIONS: Record<
  NotificationEventType,
  string
> = {
  integration_sync_failing:
    "When a connected booking system stops updating and deals may be hidden.",
  deal_auto_paused:
    "When the platform pauses a deal for you (seats, price, link, and similar).",
  attestation_due: "Reminders to reconfirm how many seats are still available.",
  booking_link_broken: "When a booking link fails checks twice in a row.",
  deal_review_update:
    "When a deal is submitted, approved, or turned down for review.",
  deal_lifecycle: "When a deal goes live, sells out, or expires.",
  auto_rule_created_deals:
    "When an auto deal rule creates new draft or live deals.",
  daily_performance_summary:
    "A morning email with yesterday’s deal performance.",
  compliance_expiring:
    "When required compliance documents are nearing expiry.",
};

/** Resolve a deal status for chips and tables. */
export function statusLabel(status: string): string {
  if (status in DEAL_STATUS_LABELS) {
    return DEAL_STATUS_LABELS[status as DealStatus];
  }
  return status
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function categoryLabel(category: Category | string): string {
  if (category in CATEGORY_LABELS) {
    return CATEGORY_LABELS[category as Category];
  }
  return statusLabel(category);
}

export function dealTypeLabel(dealType: DealType | string): string {
  if (dealType in DEAL_TYPE_LABELS) {
    return DEAL_TYPE_LABELS[dealType as DealType];
  }
  return statusLabel(dealType);
}
