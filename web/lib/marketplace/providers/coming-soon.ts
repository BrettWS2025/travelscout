/**
 * "Coming soon" adapters for FareHarbor, Bókun and Checkfront (Chunk 26).
 * Registered so Settings can show available:false; every mutating method throws.
 */

import type { Integration } from "../integration";
import type { IntegrationProvider } from "../enums";
import type { ProviderAdapter } from "./adapter";
import { AdapterNotImplementedError } from "./errors";
import type {
  BookingProductRef,
  BookingSessionRef,
  ConnectCredentialsInput,
  ProviderCapabilities,
} from "./types";

const COMING_SOON_PROVIDERS = [
  "fareharbor",
  "bokun",
  "checkfront",
] as const satisfies readonly IntegrationProvider[];

export type ComingSoonProvider = (typeof COMING_SOON_PROVIDERS)[number];

export function isComingSoonProvider(
  provider: string
): provider is ComingSoonProvider {
  return (COMING_SOON_PROVIDERS as readonly string[]).includes(provider);
}

const COMING_SOON_CAPABILITIES: ProviderCapabilities = {
  available: false,
  webhooks_availability: false,
  promo_code_verify: false,
  deep_link_session: false,
  deep_link_promo: false,
  min_poll_seconds: 300,
  max_poll_seconds: 3600,
};

export function createComingSoonAdapter(
  provider: ComingSoonProvider
): ProviderAdapter {
  const notImplementedError = () =>
    new AdapterNotImplementedError(
      provider,
      "Coming soon — not available yet"
    );

  return {
    provider,

    capabilities() {
      return { ...COMING_SOON_CAPABILITIES };
    },

    connect(_credentialsInput: ConnectCredentialsInput) {
      return Promise.reject(notImplementedError());
    },

    testConnection(_integration: Integration) {
      return Promise.reject(notImplementedError());
    },

    listProducts(_integration: Integration) {
      return Promise.reject(notImplementedError());
    },

    listSessions(
      _integration: Integration,
      _productExternalId: string,
      _from: Date,
      _to: Date
    ) {
      return Promise.reject(notImplementedError());
    },

    getAvailability(
      _integration: Integration,
      _productExternalId: string,
      _sessionExternalId: string,
      _options: { timeoutMs: number }
    ) {
      return Promise.reject(notImplementedError());
    },

    verifyDiscount(_integration: Integration, _input) {
      return Promise.reject(notImplementedError());
    },

    buildBookingUrl(
      _integration: Integration,
      _product: BookingProductRef,
      _session?: BookingSessionRef,
      _promoCode?: string | null
    ): string {
      throw notImplementedError();
    },
  };
}

export { COMING_SOON_PROVIDERS };
