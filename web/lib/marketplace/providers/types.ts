/**
 * Normalised provider shapes for the deals platform adapter layer (Chunk 26).
 * Adapters convert provider-specific payloads into these types (money = minor
 * units, times = UTC ISO strings) before anything else touches them.
 */

import type {
  DiscountMechanism,
  IntegrationProvider,
  PriceOptionType,
  SessionStatus,
} from "../enums";

export type NormalisedPriceOption = {
  external_id: string;
  label: string;
  type: PriceOptionType;
  price_minor: number;
  currency: string;
};

export type NormalisedProduct = {
  external_id: string;
  name: string;
  description: string | null;
  images: string[];
  duration_minutes: number | null;
  location: Record<string, unknown> | null;
  price_options: NormalisedPriceOption[];
  archived: boolean;
};

export type NormalisedSessionPrice = {
  external_price_option_id: string;
  price_minor: number;
  currency: string;
};

export type NormalisedSession = {
  external_id: string;
  start_at: string;
  end_at: string | null;
  seats_available: number;
  total_capacity: number | null;
  status: SessionStatus;
  prices: NormalisedSessionPrice[];
};

export type ProviderCapabilities = {
  /** false = "Coming soon" in settings; methods throw not-implemented. */
  available: boolean;
  webhooks_availability: boolean;
  promo_code_verify: boolean;
  deep_link_session: boolean;
  deep_link_promo: boolean;
  min_poll_seconds: number;
  max_poll_seconds: number;
};

export type ConnectCredentialsInput = Record<string, unknown>;

export type ConnectResult = {
  external_account_id: string;
  external_account_name: string;
  credentials_ref: string;
};

export type TestConnectionResult =
  | { ok: true; error?: undefined }
  | { ok: false; error: string };

export type GetAvailabilityResult = {
  seats_available: number;
  status: SessionStatus;
};

export type VerifyDiscountInput = {
  mechanism: DiscountMechanism;
  promo_code?: string | null;
  external_deal_price_option_id?: string | null;
  expected_price_minor: number;
};

export type VerifyDiscountStatus = "verified" | "not_found" | "cannot_verify";

export type VerifyDiscountResult = {
  status: VerifyDiscountStatus;
  actual_price_minor?: number;
};

export type ProviderWebhookRequest = {
  headers: Headers | Record<string, string | string[] | undefined>;
  body: unknown;
};

export type ProviderWebhookEvent = {
  type: string;
  product_external_id?: string;
  session_external_id?: string;
  detail?: Record<string, unknown>;
};

/** Product argument for buildBookingUrl — full normalised or id-only. */
export type BookingProductRef =
  | NormalisedProduct
  | { external_id: string; name?: string };

/** Session argument for buildBookingUrl — full normalised or id-only. */
export type BookingSessionRef =
  | NormalisedSession
  | { external_id: string }
  | null
  | undefined;

export type AdapterProvider = IntegrationProvider;
