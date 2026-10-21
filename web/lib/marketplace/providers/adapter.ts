/**
 * ProviderAdapter — the only surface the rest of the deals platform uses to
 * talk to booking providers (Chunk 26). Rezdy, FareHarbor, Bókun, Checkfront
 * and the mock all implement this. No provider-specific code outside adapters.
 */

import type { Integration } from "../integration";
import type {
  AdapterProvider,
  BookingProductRef,
  BookingSessionRef,
  ConnectCredentialsInput,
  ConnectResult,
  GetAvailabilityResult,
  NormalisedBooking,
  NormalisedProduct,
  NormalisedSession,
  ProviderCapabilities,
  ProviderWebhookEvent,
  ProviderWebhookRequest,
  TestConnectionResult,
  VerifyDiscountInput,
  VerifyDiscountResult,
} from "./types";

export interface ProviderAdapter {
  /** Registry key — never `manual`. */
  readonly provider: AdapterProvider;

  /**
   * Validate credentials with the provider, store them via the secrets helper,
   * and return opaque credentials_ref plus account identity. Never return
   * plaintext credentials.
   */
  connect(credentialsInput: ConnectCredentialsInput): Promise<ConnectResult>;

  /** Lightweight health check using the stored credentials_ref. */
  testConnection(integration: Integration): Promise<TestConnectionResult>;

  /** All products for the connected account, normalised. */
  listProducts(integration: Integration): Promise<NormalisedProduct[]>;

  /**
   * Sessions for one product in [from, to] (UTC). Money and times already
   * normalised by the adapter.
   */
  listSessions(
    integration: Integration,
    productExternalId: string,
    from: Date,
    to: Date
  ): Promise<NormalisedSession[]>;

  /**
   * Live seat check for Book now (honour timeoutMs). Fail closed on timeout
   * by throwing or returning an error the caller maps to recheck_result=error.
   */
  getAvailability(
    integration: Integration,
    productExternalId: string,
    sessionExternalId: string,
    options: { timeoutMs: number }
  ): Promise<GetAvailabilityResult>;

  /**
   * Confirm a discount exists in the provider when the API allows it.
   * Return cannot_verify when the provider cannot confirm.
   */
  verifyDiscount(
    integration: Integration,
    input: VerifyDiscountInput
  ): Promise<VerifyDiscountResult>;

  /**
   * Operator-owned booking URL. Prefer deep links for session / promo when
   * capabilities allow; otherwise the product booking page.
   */
  buildBookingUrl(
    integration: Integration,
    product: BookingProductRef,
    session?: BookingSessionRef,
    promoCode?: string | null
  ): string;

  /**
   * Bookings/orders in [from, to] for conversion attribution (Chunk 45).
   * Money and times already normalised. Return [] when the provider cannot list.
   */
  listBookings(
    integration: Integration,
    from: Date,
    to: Date
  ): Promise<NormalisedBooking[]>;

  capabilities(): ProviderCapabilities;

  /** Optional. Providers without webhooks omit this. */
  handleWebhook?(
    request: ProviderWebhookRequest
  ): Promise<ProviderWebhookEvent[]>;
}
