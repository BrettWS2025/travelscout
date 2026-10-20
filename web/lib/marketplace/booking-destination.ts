/**
 * Pure booking-destination field validators (Chunk 15).
 * Kept separate from booking-link.ts so deal.ts can validate without a cycle.
 */

import type { BookingDestinationType } from "./enums";
import { isBookingDestinationType } from "./enums";

export type BookingDestinationFieldError = {
  field: string;
  message: string;
};

/** Destination types that use booking_url. */
export const URL_BOOKING_DESTINATION_TYPES: readonly BookingDestinationType[] = [
  "provider_booking_page",
  "operator_website",
] as const;

export function isUrlBookingDestination(
  type: BookingDestinationType | null | undefined
): boolean {
  return (
    type != null &&
    (URL_BOOKING_DESTINATION_TYPES as readonly string[]).includes(type)
  );
}

/** https only (scheme + host required). */
export function isHttpsUrl(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * E.164 phone: + then 8–15 digits total, first digit 1–9.
 * Example: +6421234567
 */
export const E164_PHONE_REGEX = /^\+[1-9]\d{7,14}$/;

export function isE164Phone(value: string): boolean {
  return E164_PHONE_REGEX.test(value.trim());
}

/** Practical email check (same style as billing_email in settings.ts). */
export const BOOKING_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidBookingEmail(value: string): boolean {
  return BOOKING_EMAIL_REGEX.test(value.trim());
}

/**
 * Field-level validators for booking destination fields when present.
 * Does not enforce required-ness (publish validation is Chunk 16).
 */
export function validateBookingDestinationFields(input: {
  bookingDestinationType?: BookingDestinationType | null;
  bookingUrl?: string | null;
  bookingPhone?: string | null;
  bookingEmail?: string | null;
}): BookingDestinationFieldError[] {
  const errors: BookingDestinationFieldError[] = [];

  if (
    input.bookingDestinationType !== undefined &&
    input.bookingDestinationType !== null &&
    !isBookingDestinationType(input.bookingDestinationType)
  ) {
    errors.push({
      field: "booking_destination_type",
      message: "invalid value",
    });
  }

  if (input.bookingUrl != null && input.bookingUrl !== "") {
    if (!isHttpsUrl(input.bookingUrl)) {
      errors.push({
        field: "booking_url",
        message: "must be an https URL",
      });
    }
  }

  if (input.bookingPhone != null && input.bookingPhone !== "") {
    if (!isE164Phone(input.bookingPhone)) {
      errors.push({
        field: "booking_phone",
        message: "must be E.164 (e.g. +6421234567)",
      });
    }
  }

  if (input.bookingEmail != null && input.bookingEmail !== "") {
    if (!isValidBookingEmail(input.bookingEmail)) {
      errors.push({
        field: "booking_email",
        message: "must be a valid email",
      });
    }
  }

  return errors;
}
