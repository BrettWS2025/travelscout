/**
 * Pure helpers / copy for Business profile and Deal defaults screens (Chunk 38).
 */

import {
  BOOKING_DESTINATION_TYPES,
  CANCELLATION_POLICY_TYPES,
  DISCOUNT_MECHANISMS,
  type BookingDestinationType,
  type CancellationPolicyType,
  type DiscountMechanism,
} from "./enums";
import { BOOKING_DEFAULTS_NOTE } from "./operators";
import { PLATFORM_REGIONS } from "./settings";

export { BOOKING_DEFAULTS_NOTE, PLATFORM_REGIONS };

export const DISCOUNT_MECHANISM_LABELS: Record<DiscountMechanism, string> = {
  promo_code: "Promo code",
  price_option: "Price option",
  separate_product: "Separate product",
  manual_price: "Manual price",
  quote_code: "Quote code",
};

export const CANCELLATION_POLICY_LABELS: Record<
  CancellationPolicyType,
  string
> = {
  non_refundable: "Non-refundable",
  operator_standard: "Operator standard",
  custom: "Custom",
};

export const BOOKING_DESTINATION_LABELS: Record<BookingDestinationType, string> =
  {
    provider_booking_page: "Provider booking page",
    operator_website: "Operator website",
    phone: "Phone",
    email: "Email",
  };

export const COMMON_TIMEZONES = [
  "Pacific/Auckland",
  "Pacific/Chatham",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Pacific/Fiji",
  "UTC",
] as const;

export const COMMON_CURRENCIES = ["NZD", "AUD", "USD", "EUR", "GBP"] as const;

export const COMMON_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "mi", label: "Māori" },
  { code: "zh", label: "Chinese" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "de", label: "German" },
  { code: "fr", label: "French" },
] as const;

export function canEditBusinessProfile(
  role: string | null | undefined
): boolean {
  return role === "owner" || role === "manager";
}

export function canEditDealDefaults(
  role: string | null | undefined
): boolean {
  return role === "owner" || role === "manager";
}

export function discountMechanismOptions(): DiscountMechanism[] {
  return [...DISCOUNT_MECHANISMS];
}

export function bookingDestinationOptions(): BookingDestinationType[] {
  return [...BOOKING_DESTINATION_TYPES];
}

export function cancellationPolicyOptions(): CancellationPolicyType[] {
  return [...CANCELLATION_POLICY_TYPES];
}

export function regionOptions(): string[] {
  return [...PLATFORM_REGIONS];
}

export function fieldErrorMap(
  errors: Array<{ field: string; message: string }> | undefined
): Record<string, string> {
  const map: Record<string, string> = {};
  if (!errors) return map;
  for (const e of errors) {
    if (!map[e.field]) map[e.field] = e.message;
  }
  return map;
}

/** Social link keys shown on the profile form. */
export const SOCIAL_LINK_KEYS = [
  "facebook",
  "instagram",
  "tripadvisor",
  "youtube",
  "tiktok",
] as const;

export type SocialLinkKey = (typeof SOCIAL_LINK_KEYS)[number];

export function socialLinksFromRecord(
  raw: Record<string, unknown> | null | undefined
): Record<SocialLinkKey, string> {
  const out = {} as Record<SocialLinkKey, string>;
  for (const key of SOCIAL_LINK_KEYS) {
    const v = raw?.[key];
    out[key] = typeof v === "string" ? v : "";
  }
  return out;
}

export function socialLinksToPayload(
  links: Record<SocialLinkKey, string>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of SOCIAL_LINK_KEYS) {
    const v = links[key]?.trim();
    if (v) out[key] = v;
  }
  return out;
}
