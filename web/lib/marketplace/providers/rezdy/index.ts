/**
 * Rezdy Supplier API adapter (Chunk 31).
 */

export {
  createRezdyAdapter,
  getRezdyAdapter,
  resetRezdyAdapterSingleton,
  parseRezdyWebhookBody,
  buildRezdyBookingUrlWithCredentials,
  REZDY_CAPABILITIES,
  type RezdyAdapterOptions,
} from "./adapter";
export {
  createRezdyClient,
  parseCredentialsJson,
  type RezdyClient,
  type RezdyClientOptions,
  type RezdyFetch,
} from "./client";
export {
  createThrottle,
  getSharedThrottle,
  resetAllThrottles,
  throttleKeyForApiKey,
} from "./throttle";
export {
  majorToMinor,
  mapBooking,
  mapPriceOptionType,
  mapProduct,
  mapSession,
  toUtcIso,
} from "./map";
export {
  createRezdyFixtureController,
  type RezdyFixtureController,
  type RezdyFixtureState,
} from "./fixture-fetch";
export {
  REZDY_PRODUCTION_BASE,
  REZDY_STAGING_BASE,
  type RezdyCredentials,
} from "./types";
