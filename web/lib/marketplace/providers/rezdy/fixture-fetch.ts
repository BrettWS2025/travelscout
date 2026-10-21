/**
 * Recorded-Rezdy HTTP fixture transport for CI contract tests (Chunk 31).
 * No live network — mutates in-memory copies of fixtures for seat/price tests.
 */

import productsFixture from "./fixtures/products.json";
import availabilityFixture from "./fixtures/availability.json";
import type { RezdyFetch } from "./client";
import type {
  RezdyAvailabilityResponse,
  RezdyBooking,
  RezdyBookingsResponse,
  RezdyPriceOption,
  RezdyProduct,
  RezdyProductsResponse,
  RezdySession,
} from "./types";
import type { ProviderAdapter } from "../adapter";
import { createRezdyAdapter } from "./adapter";
import { AdapterOperationError } from "../errors";
import type { GetAvailabilityResult } from "../types";

export type RezdyFixtureState = {
  products: RezdyProduct[];
  sessions: RezdySession[];
  bookings: RezdyBooking[];
  forceError: string | null;
  availabilityMinDelayMs: number;
  /** Promo codes the quote endpoint recognises → deal total (major units). */
  promos: Map<string, number>;
  cancelledSessionKeys: Set<string>;
};

export type RezdyFixtureController = {
  adapter: ProviderAdapter;
  state: RezdyFixtureState;
  fetchFn: RezdyFetch;
  reset(): void;
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
  setForceError(message: string | null): void;
  setAvailabilityDelayMs(ms: number): void;
  addPromo(code: string, dealPriceMajor: number): void;
};

function cloneProducts(): RezdyProduct[] {
  return JSON.parse(JSON.stringify(productsFixture.products)) as RezdyProduct[];
}

function sessionKey(productCode: string, sessionId: string): string {
  return `${productCode}:${sessionId}`;
}

/**
 * Build sessions relative to `now` so contract tests stay valid regardless
 * of wall-clock date. Shapes mirror recorded availability.json.
 */
function buildRelativeSessions(now: Date): RezdySession[] {
  const templates = availabilityFixture.sessions as RezdySession[];
  // Anchor: first session ~19h after FIXED_NOW in the recorded file; keep
  // similar offsets from "now" so listSessions(now, now+3d) finds them.
  const offsetsHours = [19, 23, 67, 4, 28];
  return templates.map((template, i) => {
    const start = new Date(
      now.getTime() + (offsetsHours[i] ?? 24 + i * 12) * 60 * 60 * 1000
    );
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    return {
      ...JSON.parse(JSON.stringify(template)),
      startTime: start.toISOString().replace(/\.\d{3}Z$/, "Z"),
      endTime: end.toISOString().replace(/\.\d{3}Z$/, "Z"),
      startTimeLocal: start.toISOString().slice(0, 19).replace("T", " "),
      endTimeLocal: end.toISOString().slice(0, 19).replace("T", " "),
    } as RezdySession;
  });
}

function createInitialState(now = new Date()): RezdyFixtureState {
  return {
    products: cloneProducts(),
    sessions: buildRelativeSessions(now),
    bookings: [
      {
        orderNumber: "ORD-FIXTURE-1",
        status: "CONFIRMED",
        dateCreated: now.toISOString().replace(/\.\d{3}Z$/, "Z"),
        totalAmount: 54,
        totalCurrency: "NZD",
        coupon: "HALFKAKE",
        items: [{ productCode: "PHARB1", amount: 54 }],
      },
    ],
    forceError: null,
    availabilityMinDelayMs: 0,
    promos: new Map([["HALFKAKE", 54]]),
    cancelledSessionKeys: new Set(),
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findSession(
  state: RezdyFixtureState,
  productCode: string,
  sessionId: string
): RezdySession {
  const session = state.sessions.find(
    (s) =>
      String(s.id) === String(sessionId) && s.productCode === productCode
  );
  if (!session) {
    throw new AdapterOperationError(
      "rezdy",
      "session_not_found",
      `Session ${sessionId} not found for product ${productCode}`
    );
  }
  return session;
}

function updatePriceOption(
  options: RezdyPriceOption[] | undefined,
  priceOptionId: string,
  priceMajor: number
): boolean {
  if (!options) return false;
  const option = options.find((o) => String(o.id) === String(priceOptionId));
  if (!option) return false;
  option.price = priceMajor;
  return true;
}

/**
 * Build a RezdyAdapter wired to recorded fixtures (mutable for contract tests).
 */
export function createRezdyFixtureController(options?: {
  now?: Date;
}): RezdyFixtureController {
  const anchor = options?.now ?? new Date("2026-10-20T02:00:00.000Z");
  const state = createInitialState(anchor);

  const fetchFn: RezdyFetch = async (input, init) => {
    if (state.forceError) {
      throw new AdapterOperationError("rezdy", "forced_error", state.forceError);
    }

    const url = new URL(
      input,
      input.startsWith("http") ? undefined : "https://api.rezdy.com"
    );
    const path = url.pathname.replace(/\/v1/, "").replace(/\/$/, "") || "/";
    const method = (init?.method ?? "GET").toUpperCase();

    if (init?.signal?.aborted) {
      const e = new Error("The operation was aborted");
      e.name = "AbortError";
      throw e;
    }

    if (method === "GET" && path.endsWith("/products")) {
      const offset = Number(url.searchParams.get("offset") ?? "0");
      const limit = Number(url.searchParams.get("limit") ?? "100");
      const slice = state.products.slice(offset, offset + limit);
      const body: RezdyProductsResponse = {
        requestStatus: { success: true, version: "v1" },
        products: slice,
      };
      return jsonResponse(body);
    }

    if (method === "GET" && path.endsWith("/availability")) {
      const delay = state.availabilityMinDelayMs;
      if (delay > 0) {
        await sleep(delay);
        if (init?.signal?.aborted) {
          const e = new Error("The operation was aborted");
          e.name = "AbortError";
          throw e;
        }
      }

      const codes = url.searchParams.getAll("productCode");
      const start = url.searchParams.get("startTime");
      const end = url.searchParams.get("endTime");
      const fromMs = start ? Date.parse(start) : 0;
      const toMs = end ? Date.parse(end) : Number.POSITIVE_INFINITY;

      const sessions = state.sessions.filter((s) => {
        if (codes.length > 0 && !codes.includes(s.productCode ?? "")) {
          return false;
        }
        const t = s.startTime ? Date.parse(s.startTime) : NaN;
        if (Number.isNaN(t)) return false;
        return t >= fromMs && t <= toMs;
      });

      const body: RezdyAvailabilityResponse = {
        requestStatus: { success: true, version: "v1" },
        sessions: JSON.parse(JSON.stringify(sessions)) as RezdySession[],
      };
      return jsonResponse(body);
    }

    if (method === "GET" && path.endsWith("/bookings")) {
      const start = url.searchParams.get("minDate");
      const end = url.searchParams.get("maxDate");
      const fromMs = start ? Date.parse(start) : 0;
      const toMs = end ? Date.parse(end) : Number.POSITIVE_INFINITY;
      const offset = Number(url.searchParams.get("offset") ?? "0");
      const limit = Number(url.searchParams.get("limit") ?? "100");
      const filtered = state.bookings.filter((b) => {
        const t = Date.parse(b.datePaid ?? b.dateCreated ?? "");
        if (Number.isNaN(t)) return false;
        return t >= fromMs && t <= toMs;
      });
      const slice = filtered.slice(offset, offset + limit);
      const body: RezdyBookingsResponse = {
        requestStatus: { success: true, version: "v1" },
        bookings: JSON.parse(JSON.stringify(slice)) as RezdyBooking[],
      };
      return jsonResponse(body);
    }

    if (method === "POST" && path.endsWith("/bookings/quote")) {
      let body: Record<string, unknown> = {};
      if (typeof init?.body === "string") {
        try {
          body = JSON.parse(init.body) as Record<string, unknown>;
        } catch {
          body = {};
        }
      }
      const coupon =
        typeof body.coupon === "string" ? body.coupon.trim().toUpperCase() : "";
      if (coupon && state.promos.has(coupon)) {
        return jsonResponse({
          requestStatus: { success: true, version: "v1" },
          booking: {
            totalAmount: state.promos.get(coupon),
            totalCurrency: "NZD",
            coupon,
          },
        });
      }
      if (coupon) {
        return jsonResponse(
          {
            requestStatus: {
              success: false,
              error: {
                errorCode: "INVALID_COUPON",
                errorMessage: "Invalid coupon code",
              },
            },
          },
          400
        );
      }
      return jsonResponse({
        requestStatus: { success: true, version: "v1" },
        booking: { totalAmount: 0, totalCurrency: "NZD" },
      });
    }

    return jsonResponse(
      {
        requestStatus: {
          success: false,
          error: { errorMessage: `Fixture: unhandled ${method} ${path}` },
        },
      },
      404
    );
  };

  const inner = createRezdyAdapter({
    fetchFn,
    defaultBaseUrl: "https://api.rezdy.com/v1",
    disableThrottle: true,
  });

  // Wrap getAvailability so cancelled fixtures report status cancelled
  // (Rezdy availability usually omits cancelled sessions; tests need the signal).
  const adapter: ProviderAdapter = {
    ...inner,
    provider: inner.provider,
    capabilities: () => inner.capabilities(),
    connect: (input) => inner.connect(input),
    testConnection: (integration) => inner.testConnection(integration),
    listProducts: (integration) => inner.listProducts(integration),
    listSessions: (integration, productId, from, to) =>
      inner.listSessions(integration, productId, from, to),
    listBookings: (integration, from, to) =>
      inner.listBookings(integration, from, to),
    verifyDiscount: (integration, input) =>
      inner.verifyDiscount(integration, input),
    buildBookingUrl: (integration, product, session, promo) =>
      inner.buildBookingUrl(integration, product, session, promo),
    handleWebhook: (request) => inner.handleWebhook!(request),
    async getAvailability(
      integration,
      productExternalId,
      sessionExternalId,
      options
    ): Promise<GetAvailabilityResult> {
      if (
        state.cancelledSessionKeys.has(
          sessionKey(productExternalId, sessionExternalId)
        )
      ) {
        // Still honour timeout path via inner delay when configured
        if (state.availabilityMinDelayMs > options.timeoutMs) {
          return inner.getAvailability(
            integration,
            productExternalId,
            sessionExternalId,
            options
          );
        }
        return { seats_available: 0, status: "cancelled" };
      }
      return inner.getAvailability(
        integration,
        productExternalId,
        sessionExternalId,
        options
      );
    },
  };

  return {
    adapter,
    state,
    fetchFn,
    reset() {
      const fresh = createInitialState(anchor);
      state.products = fresh.products;
      state.sessions = fresh.sessions;
      state.bookings = fresh.bookings;
      state.forceError = null;
      state.availabilityMinDelayMs = 0;
      state.promos = fresh.promos;
      state.cancelledSessionKeys = fresh.cancelledSessionKeys;
    },
    setSeats(productExternalId, sessionExternalId, seats) {
      const session = findSession(
        state,
        productExternalId,
        sessionExternalId
      );
      session.seatsAvailable = Math.max(0, seats);
      state.cancelledSessionKeys.delete(
        sessionKey(productExternalId, sessionExternalId)
      );
    },
    cancelSession(productExternalId, sessionExternalId) {
      findSession(state, productExternalId, sessionExternalId);
      state.cancelledSessionKeys.add(
        sessionKey(productExternalId, sessionExternalId)
      );
    },
    setProductPrice(productExternalId, priceOptionExternalId, priceMinor) {
      const product = state.products.find(
        (p) => p.productCode === productExternalId
      );
      if (!product) {
        throw new AdapterOperationError(
          "rezdy",
          "product_not_found",
          `Product ${productExternalId} not found`
        );
      }
      const major = priceMinor / 100;
      if (!updatePriceOption(product.priceOptions, priceOptionExternalId, major)) {
        throw new AdapterOperationError(
          "rezdy",
          "price_option_not_found",
          `Price option ${priceOptionExternalId} not found`
        );
      }
      for (const session of state.sessions) {
        if (session.productCode !== productExternalId) continue;
        updatePriceOption(session.priceOptions, priceOptionExternalId, major);
      }
    },
    setForceError(message) {
      state.forceError = message;
    },
    setAvailabilityDelayMs(ms) {
      state.availabilityMinDelayMs = Math.max(0, ms);
    },
    addPromo(code, dealPriceMajor) {
      state.promos.set(code.trim().toUpperCase(), dealPriceMajor);
    },
  };
}
