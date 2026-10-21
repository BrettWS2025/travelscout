/**
 * Mock booking-provider adapter for dev and automated tests (Chunk 26).
 *
 * Returns two products with sessions across the next three UTC days. Tests
 * can mutate seats, cancel sessions, change prices, and force timeouts/errors
 * via the returned controller. Money is always minor units; times always UTC.
 *
 * Until Chunk 31 lands a real Rezdy adapter, the registry may hand this out
 * for provider `rezdy` when mock mode is enabled.
 */

import type { Integration } from "../integration";
import { storeSecret, readSecret } from "../secrets";
import type { ProviderAdapter } from "./adapter";
import { AdapterOperationError } from "./errors";
import type {
  BookingProductRef,
  BookingSessionRef,
  ConnectCredentialsInput,
  ConnectResult,
  GetAvailabilityResult,
  NormalisedProduct,
  NormalisedSession,
  ProviderCapabilities,
  TestConnectionResult,
  VerifyDiscountInput,
  VerifyDiscountResult,
} from "./types";

const MOCK_PROVIDER = "rezdy" as const;
const DEFAULT_CURRENCY = "NZD";
const BOOKING_BASE = "https://mock.book.example";

export type MockPromo = {
  code: string;
  /** Product external id this promo applies to (or "*" for all). */
  product_external_id: string;
  /** Price option external id, or null for product-wide. */
  price_option_external_id: string | null;
  deal_price_minor: number;
};

export type MockAdapterState = {
  accountId: string;
  accountName: string;
  products: NormalisedProduct[];
  /** productExternalId → sessions */
  sessionsByProduct: Map<string, NormalisedSession[]>;
  promos: MockPromo[];
  /** Simulate connect / test / list failures */
  forceError: string | null;
  /** Simulate getAvailability timeout when timeoutMs is below this threshold */
  availabilityMinDelayMs: number;
  connected: boolean;
};

export type MockAdapterController = {
  adapter: ProviderAdapter;
  state: MockAdapterState;
  reset(now?: Date): void;
  setSeats(
    productExternalId: string,
    sessionExternalId: string,
    seats: number
  ): void;
  cancelSession(productExternalId: string, sessionExternalId: string): void;
  setProductPrice(
    productExternalId: string,
    priceOptionExternalId: string,
    priceMinor: number
  ): void;
  setSessionPrice(
    productExternalId: string,
    sessionExternalId: string,
    priceOptionExternalId: string,
    priceMinor: number
  ): void;
  setForceError(message: string | null): void;
  /** getAvailability waits this many ms before responding (for timeout tests). */
  setAvailabilityDelayMs(ms: number): void;
  addPromo(promo: MockPromo): void;
};

function startOfUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0)
  );
}

function isoUtc(d: Date): string {
  return d.toISOString();
}

function buildDefaultProducts(): NormalisedProduct[] {
  return [
    {
      external_id: "prod-harbour-kayak",
      name: "Harbour Kayak Tour",
      description:
        "Paddle the inner harbour with a guide. Suitable for beginners.",
      images: [
        "https://cdn.mock.example/kayak-1.jpg",
        "https://cdn.mock.example/kayak-2.jpg",
      ],
      duration_minutes: 120,
      location: {
        name: "Viaduct Harbour",
        address: "1 Quay St, Auckland",
        latitude: -36.841,
        longitude: 174.763,
        region: "Auckland",
      },
      price_options: [
        {
          external_id: "po-kayak-adult",
          label: "Adult",
          type: "adult",
          price_minor: 12000,
          currency: DEFAULT_CURRENCY,
        },
        {
          external_id: "po-kayak-child",
          label: "Child",
          type: "child",
          price_minor: 8000,
          currency: DEFAULT_CURRENCY,
        },
        {
          external_id: "po-kayak-deal-adult",
          label: "Adult deal",
          type: "adult",
          price_minor: 5400,
          currency: DEFAULT_CURRENCY,
        },
      ],
      archived: false,
    },
    {
      external_id: "prod-bay-cruise",
      name: "Bay Sunset Cruise",
      description: "Two-hour sunset cruise with complimentary drink.",
      images: ["https://cdn.mock.example/cruise-1.jpg"],
      duration_minutes: 120,
      location: {
        name: "Downtown Ferry Terminal",
        address: "88 Quay St, Auckland",
        latitude: -36.843,
        longitude: 174.767,
        region: "Auckland",
      },
      price_options: [
        {
          external_id: "po-cruise-adult",
          label: "Adult",
          type: "adult",
          price_minor: 9900,
          currency: DEFAULT_CURRENCY,
        },
        {
          external_id: "po-cruise-deal-adult",
          label: "Adult deal",
          type: "adult",
          price_minor: 4500,
          currency: DEFAULT_CURRENCY,
        },
      ],
      archived: false,
    },
  ];
}

function buildDefaultSessions(
  products: NormalisedProduct[],
  now: Date
): Map<string, NormalisedSession[]> {
  const day0 = startOfUtcDay(now);
  const map = new Map<string, NormalisedSession[]>();

  for (const product of products) {
    const sessions: NormalisedSession[] = [];
    for (let dayOffset = 0; dayOffset < 3; dayOffset++) {
      for (const hour of [9, 14]) {
        const start = new Date(day0);
        start.setUTCDate(start.getUTCDate() + dayOffset);
        start.setUTCHours(hour, 0, 0, 0);
        // Skip sessions that already started
        if (start.getTime() <= now.getTime()) continue;

        const end = new Date(start);
        end.setUTCMinutes(
          end.getUTCMinutes() + (product.duration_minutes ?? 120)
        );

        sessions.push({
          external_id: `sess-${product.external_id}-d${dayOffset}-h${hour}`,
          start_at: isoUtc(start),
          end_at: isoUtc(end),
          seats_available: product.external_id === "prod-harbour-kayak" ? 8 : 20,
          total_capacity: product.external_id === "prod-harbour-kayak" ? 12 : 40,
          status: "live",
          prices: product.price_options.map((po) => ({
            external_price_option_id: po.external_id,
            price_minor: po.price_minor,
            currency: po.currency,
          })),
        });
      }
    }
    map.set(product.external_id, sessions);
  }

  return map;
}

function cloneProducts(products: NormalisedProduct[]): NormalisedProduct[] {
  return products.map((p) => ({
    ...p,
    images: [...p.images],
    location: p.location ? { ...p.location } : null,
    price_options: p.price_options.map((po) => ({ ...po })),
  }));
}

function createInitialState(now: Date): MockAdapterState {
  const products = buildDefaultProducts();
  return {
    accountId: "mock-acct-bay-cruises",
    accountName: "Mock Bay Cruises",
    products,
    sessionsByProduct: buildDefaultSessions(products, now),
    promos: [
      {
        code: "HALFKAKE",
        product_external_id: "prod-harbour-kayak",
        price_option_external_id: "po-kayak-adult",
        deal_price_minor: 5400,
      },
    ],
    forceError: null,
    availabilityMinDelayMs: 0,
    connected: false,
  };
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function requireCredentials(integration: Integration): string {
  if (!integration.credentialsRef) {
    throw new AdapterOperationError(
      MOCK_PROVIDER,
      "missing_credentials",
      "Integration has no credentials_ref"
    );
  }
  return integration.credentialsRef;
}

function productExternalId(product: BookingProductRef): string {
  return product.external_id;
}

function sessionExternalId(
  session: BookingSessionRef
): string | null {
  if (!session) return null;
  return session.external_id;
}

/**
 * Build a controllable mock adapter. Pass the same `state` object across
 * calls if you need to share mutations; otherwise each create gets a fresh
 * catalogue rooted at `now`.
 */
export function createMockAdapter(options?: {
  now?: Date | (() => Date);
  state?: MockAdapterState;
}): MockAdapterController {
  // Capture so TS narrows Date vs () => Date inside the else branch
  // (options?.now is not narrowed through a deferred arrow closure).
  const nowOption = options?.now;
  const nowFn: () => Date =
    typeof nowOption === "function"
      ? nowOption
      : () => nowOption ?? new Date();

  const state = options?.state ?? createInitialState(nowFn());

  function reset(now?: Date): void {
    const fresh = createInitialState(now ?? nowFn());
    state.accountId = fresh.accountId;
    state.accountName = fresh.accountName;
    state.products = fresh.products;
    state.sessionsByProduct = fresh.sessionsByProduct;
    state.promos = fresh.promos;
    state.forceError = null;
    state.availabilityMinDelayMs = 0;
    state.connected = false;
  }

  function maybeThrow(): void {
    if (state.forceError) {
      throw new AdapterOperationError(
        MOCK_PROVIDER,
        "forced_error",
        state.forceError
      );
    }
  }

  function findSession(
    productExternalId: string,
    sessionExternalId: string
  ): NormalisedSession {
    const sessions = state.sessionsByProduct.get(productExternalId) ?? [];
    const session = sessions.find((s) => s.external_id === sessionExternalId);
    if (!session) {
      throw new AdapterOperationError(
        MOCK_PROVIDER,
        "session_not_found",
        `Session ${sessionExternalId} not found for product ${productExternalId}`
      );
    }
    return session;
  }

  const adapter: ProviderAdapter = {
    provider: MOCK_PROVIDER,

    capabilities(): ProviderCapabilities {
      return {
        available: true,
        webhooks_availability: false,
        promo_code_verify: true,
        deep_link_session: true,
        deep_link_promo: true,
        min_poll_seconds: 60,
        max_poll_seconds: 3600,
      };
    },

    async connect(
      credentialsInput: ConnectCredentialsInput
    ): Promise<ConnectResult> {
      maybeThrow();
      const apiKey =
        typeof credentialsInput.api_key === "string"
          ? credentialsInput.api_key
          : typeof credentialsInput.apiKey === "string"
            ? credentialsInput.apiKey
            : null;
      if (!apiKey || apiKey.trim().length === 0) {
        throw new AdapterOperationError(
          MOCK_PROVIDER,
          "invalid_credentials",
          "Mock connect requires a non-empty api_key"
        );
      }
      const credentials_ref = await storeSecret(
        JSON.stringify({ api_key: apiKey }),
        "mock-provider-credentials"
      );
      state.connected = true;
      return {
        external_account_id: state.accountId,
        external_account_name: state.accountName,
        credentials_ref,
      };
    },

    async testConnection(integration: Integration): Promise<TestConnectionResult> {
      try {
        maybeThrow();
        const ref = requireCredentials(integration);
        await readSecret(ref);
        return { ok: true };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Connection test failed";
        return { ok: false, error: message };
      }
    },

    async listProducts(integration: Integration): Promise<NormalisedProduct[]> {
      maybeThrow();
      requireCredentials(integration);
      await readSecret(integration.credentialsRef!);
      return cloneProducts(state.products);
    },

    async listSessions(
      integration: Integration,
      productExternalId: string,
      from: Date,
      to: Date
    ): Promise<NormalisedSession[]> {
      maybeThrow();
      requireCredentials(integration);
      await readSecret(integration.credentialsRef!);
      const sessions = state.sessionsByProduct.get(productExternalId) ?? [];
      const fromMs = from.getTime();
      const toMs = to.getTime();
      return sessions
        .filter((s) => {
          const t = Date.parse(s.start_at);
          return t >= fromMs && t <= toMs;
        })
        .map((s) => ({
          ...s,
          prices: s.prices.map((p) => ({ ...p })),
        }));
    },

    async getAvailability(
      integration: Integration,
      productExternalId: string,
      sessionExternalId: string,
      options: { timeoutMs: number }
    ): Promise<GetAvailabilityResult> {
      maybeThrow();
      requireCredentials(integration);
      await readSecret(integration.credentialsRef!);

      const delay = state.availabilityMinDelayMs;
      if (delay > options.timeoutMs) {
        await sleep(options.timeoutMs);
        throw new AdapterOperationError(
          MOCK_PROVIDER,
          "timeout",
          `Availability check timed out after ${options.timeoutMs}ms`
        );
      }
      await sleep(delay);

      const session = findSession(productExternalId, sessionExternalId);
      if (session.status === "cancelled") {
        return { seats_available: 0, status: "cancelled" };
      }
      const seats = Math.max(0, session.seats_available);
      return {
        seats_available: seats,
        status: seats === 0 ? "sold_out" : "live",
      };
    },

    async verifyDiscount(
      integration: Integration,
      input: VerifyDiscountInput
    ): Promise<VerifyDiscountResult> {
      maybeThrow();
      requireCredentials(integration);
      await readSecret(integration.credentialsRef!);

      if (input.mechanism === "price_option") {
        const optionId = input.external_deal_price_option_id;
        if (!optionId) {
          return { status: "not_found" };
        }
        for (const product of state.products) {
          const option = product.price_options.find(
            (p) => p.external_id === optionId
          );
          if (option) {
            if (option.price_minor === input.expected_price_minor) {
              return {
                status: "verified",
                actual_price_minor: option.price_minor,
              };
            }
            return {
              status: "not_found",
              actual_price_minor: option.price_minor,
            };
          }
        }
        return { status: "not_found" };
      }

      if (input.mechanism === "promo_code") {
        const code = (input.promo_code ?? "").trim().toUpperCase();
        if (!code) return { status: "not_found" };
        const promo = state.promos.find((p) => p.code.toUpperCase() === code);
        if (!promo) return { status: "not_found" };
        if (promo.deal_price_minor === input.expected_price_minor) {
          return {
            status: "verified",
            actual_price_minor: promo.deal_price_minor,
          };
        }
        return {
          status: "not_found",
          actual_price_minor: promo.deal_price_minor,
        };
      }

      // separate_product and others: mock cannot verify
      return { status: "cannot_verify" };
    },

    buildBookingUrl(
      integration: Integration,
      product: BookingProductRef,
      session?: BookingSessionRef,
      promoCode?: string | null
    ): string {
      const base =
        integration.bookingBaseUrl?.replace(/\/$/, "") || BOOKING_BASE;
      const url = new URL(`${base}/book/${productExternalId(product)}`);
      const sess = sessionExternalId(session);
      if (sess) url.searchParams.set("session", sess);
      if (promoCode) url.searchParams.set("promo", promoCode);
      return url.toString();
    },

    async handleWebhook() {
      return [];
    },
  };

  const controller: MockAdapterController = {
    adapter,
    state,
    reset,
    setSeats(productExternalId, sessionExternalId, seats) {
      const session = findSession(productExternalId, sessionExternalId);
      session.seats_available = Math.max(0, seats);
      if (session.status !== "cancelled") {
        session.status = session.seats_available === 0 ? "sold_out" : "live";
      }
    },
    cancelSession(productExternalId, sessionExternalId) {
      const session = findSession(productExternalId, sessionExternalId);
      session.status = "cancelled";
      session.seats_available = 0;
    },
    setProductPrice(productExternalId, priceOptionExternalId, priceMinor) {
      const product = state.products.find(
        (p) => p.external_id === productExternalId
      );
      if (!product) {
        throw new AdapterOperationError(
          MOCK_PROVIDER,
          "product_not_found",
          `Product ${productExternalId} not found`
        );
      }
      const option = product.price_options.find(
        (p) => p.external_id === priceOptionExternalId
      );
      if (!option) {
        throw new AdapterOperationError(
          MOCK_PROVIDER,
          "price_option_not_found",
          `Price option ${priceOptionExternalId} not found`
        );
      }
      option.price_minor = priceMinor;
      // Keep session price caches in sync for that option
      const sessions = state.sessionsByProduct.get(productExternalId) ?? [];
      for (const session of sessions) {
        const sp = session.prices.find(
          (p) => p.external_price_option_id === priceOptionExternalId
        );
        if (sp) sp.price_minor = priceMinor;
      }
    },
    setSessionPrice(
      productExternalId,
      sessionExternalId,
      priceOptionExternalId,
      priceMinor
    ) {
      const session = findSession(productExternalId, sessionExternalId);
      const sp = session.prices.find(
        (p) => p.external_price_option_id === priceOptionExternalId
      );
      if (!sp) {
        session.prices.push({
          external_price_option_id: priceOptionExternalId,
          price_minor: priceMinor,
          currency: DEFAULT_CURRENCY,
        });
      } else {
        sp.price_minor = priceMinor;
      }
    },
    setForceError(message) {
      state.forceError = message;
    },
    setAvailabilityDelayMs(ms) {
      state.availabilityMinDelayMs = Math.max(0, ms);
    },
    addPromo(promo) {
      state.promos.push({ ...promo });
    },
  };

  return controller;
}

/** Convenience: adapter only (no controller), fresh catalogue. */
export function getMockAdapter(now?: Date): ProviderAdapter {
  return createMockAdapter({ now }).adapter;
}
