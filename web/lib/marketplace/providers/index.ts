/**
 * Provider adapters (Chunk 26).
 *
 * All provider logic goes through ProviderAdapter. Use getAdapter(provider)
 * from the registry; never call Rezdy/FareHarbor/etc. SDKs from deal code.
 */

export type { ProviderAdapter } from "./adapter";
export {
  AdapterNotImplementedError,
  AdapterOperationError,
  UnknownProviderError,
} from "./errors";
export {
  COMING_SOON_PROVIDERS,
  createComingSoonAdapter,
  isComingSoonProvider,
  type ComingSoonProvider,
} from "./coming-soon";
export {
  createMockAdapter,
  getMockAdapter,
  type MockAdapterController,
  type MockAdapterState,
  type MockPromo,
} from "./mock";
export {
  createRezdyAdapter,
  createRezdyFixtureController,
  getRezdyAdapter,
  REZDY_CAPABILITIES,
  REZDY_PRODUCTION_BASE,
  REZDY_STAGING_BASE,
  resetRezdyAdapterSingleton,
  type RezdyAdapterOptions,
  type RezdyFixtureController,
} from "./rezdy";
export {
  getAdapter,
  getDefaultMockController,
  isProviderAvailable,
  listRegisteredProviders,
  registerAdapterFactory,
  resetAdapterRegistry,
  type AdapterFactory,
} from "./registry";
export type {
  AdapterProvider,
  BookingProductRef,
  BookingSessionRef,
  ConnectCredentialsInput,
  ConnectResult,
  GetAvailabilityResult,
  NormalisedBooking,
  NormalisedPriceOption,
  NormalisedProduct,
  NormalisedSession,
  NormalisedSessionPrice,
  ProviderCapabilities,
  ProviderWebhookEvent,
  ProviderWebhookRequest,
  TestConnectionResult,
  VerifyDiscountInput,
  VerifyDiscountResult,
  VerifyDiscountStatus,
} from "./types";
