/**
 * RezdyAdapter — Supplier API implementation of ProviderAdapter (Chunk 31).
 * Decisions: docs/deals-spec.md §7.
 */

import { randomBytes } from "crypto";
import type { Integration } from "../../integration";
import { getPlatformConfig } from "../../config";
import { storeSecret, readSecret } from "../../secrets";
import type { ProviderAdapter } from "../adapter";
import { AdapterOperationError } from "../errors";
import type {
  BookingProductRef,
  BookingSessionRef,
  ConnectCredentialsInput,
  ConnectResult,
  GetAvailabilityResult,
  NormalisedProduct,
  NormalisedSession,
  ProviderCapabilities,
  ProviderWebhookEvent,
  ProviderWebhookRequest,
  TestConnectionResult,
  VerifyDiscountInput,
  VerifyDiscountResult,
} from "../types";
import {
  createRezdyClient,
  parseCredentialsJson,
  type RezdyClient,
  type RezdyFetch,
} from "./client";
import {
  mapProduct,
  mapSession,
  majorToMinor,
  sessionStatusFromSeats,
} from "./map";
import { createThrottle } from "./throttle";
import {
  REZDY_PRODUCTION_BASE,
  REZDY_STAGING_BASE,
  type RezdyCredentials,
  type RezdyProduct,
} from "./types";

const NOOP_THROTTLE = createThrottle({
  maxPerMinute: 10_000,
  minGapMs: 0,
});

const PROVIDER = "rezdy" as const;

export const REZDY_CAPABILITIES: ProviderCapabilities = {
  available: true,
  webhooks_availability: false, // order + product only; seats via poll (§7.8)
  promo_code_verify: true, // via POST /bookings/quote; may return cannot_verify
  deep_link_session: false,
  deep_link_promo: false,
  min_poll_seconds: 60,
  max_poll_seconds: 900,
  preferred_sync_mode: "hybrid",
};

export type RezdyAdapterOptions = {
  /** Injectable fetch for fixtures / tests (no live calls). */
  fetchFn?: RezdyFetch;
  /** Override default production base when credentials omit base_url. */
  defaultBaseUrl?: string;
  /** Skip shared rate limit (fixtures / unit tests). */
  disableThrottle?: boolean;
};

function err(code: string, message: string): AdapterOperationError {
  return new AdapterOperationError(PROVIDER, code, message);
}

function productExternalId(product: BookingProductRef): string {
  return product.external_id;
}

async function loadCredentials(
  integration: Integration
): Promise<RezdyCredentials> {
  if (!integration.credentialsRef) {
    throw err("missing_credentials", "Integration has no credentials_ref");
  }
  const raw = await readSecret(integration.credentialsRef);
  return parseCredentialsJson(raw);
}

function clientFor(
  credentials: RezdyCredentials,
  options?: RezdyAdapterOptions
): RezdyClient {
  const withBase: RezdyCredentials = {
    ...credentials,
    base_url:
      credentials.base_url ??
      options?.defaultBaseUrl ??
      REZDY_PRODUCTION_BASE,
  };
  return createRezdyClient({
    credentials: withBase,
    fetchFn: options?.fetchFn,
    throttle: options?.disableThrottle ? NOOP_THROTTLE : undefined,
  });
}

async function listAllProducts(
  client: RezdyClient
): Promise<RezdyProduct[]> {
  const all: RezdyProduct[] = [];
  let offset = 0;
  const limit = 100;
  for (;;) {
    const page = await client.getProducts({ offset, limit });
    const batch = page.products ?? [];
    all.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }
  return all;
}

function extractApiKey(input: ConnectCredentialsInput): string | null {
  if (typeof input.api_key === "string" && input.api_key.trim()) {
    return input.api_key.trim();
  }
  if (typeof input.apiKey === "string" && input.apiKey.trim()) {
    return input.apiKey.trim();
  }
  return null;
}

function resolveBaseFromInput(
  input: ConnectCredentialsInput,
  fallback?: string
): string {
  if (typeof input.base_url === "string" && input.base_url.trim()) {
    return input.base_url.trim().replace(/\/$/, "");
  }
  if (typeof input.baseUrl === "string" && input.baseUrl.trim()) {
    return input.baseUrl.trim().replace(/\/$/, "");
  }
  if (input.staging === true || input.use_staging === true) {
    return REZDY_STAGING_BASE;
  }
  return fallback ?? REZDY_PRODUCTION_BASE;
}

function bookingUrl(
  integration: Integration,
  credentials: RezdyCredentials,
  productCode: string
): string {
  const base = integration.bookingBaseUrl?.replace(/\/$/, "");
  if (base) {
    // Operator override — append /view/{code} if it looks like an alias host
    if (/\/view\//.test(base)) return base;
    return `${base}/view/${encodeURIComponent(productCode)}`;
  }
  const alias = credentials.supplier_alias?.trim();
  if (alias) {
    return `https://${alias}.rezdy.com/view/${encodeURIComponent(productCode)}`;
  }
  // Last resort: generic path; operator should set booking_base_url
  return `https://book.rezdy.com/view/${encodeURIComponent(productCode)}`;
}

function headerOrQueryToken(
  request: ProviderWebhookRequest
): string | null {
  const headers = request.headers;
  const fromHeader = (() => {
    if (headers instanceof Headers) {
      return (
        headers.get("x-webhook-token") ??
        headers.get("x-rezdy-webhook-token")
      );
    }
    for (const [k, v] of Object.entries(headers)) {
      if (
        k.toLowerCase() === "x-webhook-token" ||
        k.toLowerCase() === "x-rezdy-webhook-token"
      ) {
        return Array.isArray(v) ? v[0] ?? null : v ?? null;
      }
    }
    return null;
  })();
  if (fromHeader) return fromHeader;

  // Body may include our token when operators forward it (rare)
  if (request.body && typeof request.body === "object") {
    const b = request.body as Record<string, unknown>;
    if (typeof b.webhook_token === "string") return b.webhook_token;
    if (typeof b.token === "string") return b.token;
  }
  return null;
}

/**
 * Parse Rezdy product / order webhook bodies into normalised events.
 * Rezdy does not sign payloads — token checks happen in the sync layer.
 */
export function parseRezdyWebhookBody(
  body: unknown
): ProviderWebhookEvent[] {
  if (!body || typeof body !== "object") return [];
  const obj = body as Record<string, unknown>;
  const events: ProviderWebhookEvent[] = [];

  // Explicit type hints some setups send
  const hint = typeof obj.type === "string" ? obj.type.toUpperCase() : "";

  if (typeof obj.productCode === "string" && obj.productCode) {
    let type = "product_updated";
    if (hint.includes("NEW") || hint.includes("CREATED")) {
      type = "product_created";
    } else if (hint.includes("DELETE")) {
      type = "product_deleted";
    }
    // Heuristic: product payload has productType / name and no orderNumber
    if (!("orderNumber" in obj) || obj.orderNumber == null) {
      events.push({
        type,
        product_external_id: obj.productCode,
        detail: { source: "rezdy_product_webhook" },
      });
    }
  }

  if (typeof obj.orderNumber === "string" || Array.isArray(obj.items)) {
    const orderType = hint.includes("CANCEL")
      ? "order_cancelled"
      : hint.includes("NEW")
        ? "order_created"
        : "order_updated";
    const items = Array.isArray(obj.items) ? obj.items : [];
    const codes = new Set<string>();
    for (const item of items) {
      if (
        item &&
        typeof item === "object" &&
        typeof (item as { productCode?: unknown }).productCode === "string"
      ) {
        codes.add((item as { productCode: string }).productCode);
      }
    }
    if (codes.size === 0) {
      events.push({
        type: orderType,
        detail: {
          order_number:
            typeof obj.orderNumber === "string" ? obj.orderNumber : null,
        },
      });
    } else {
      for (const code of codes) {
        events.push({
          type: orderType,
          product_external_id: code,
          detail: {
            order_number:
              typeof obj.orderNumber === "string" ? obj.orderNumber : null,
          },
        });
      }
    }
  }

  return events;
}

export function createRezdyAdapter(
  options: RezdyAdapterOptions = {}
): ProviderAdapter {
  const adapter: ProviderAdapter = {
    provider: PROVIDER,

    capabilities(): ProviderCapabilities {
      return { ...REZDY_CAPABILITIES };
    },

    async connect(
      credentialsInput: ConnectCredentialsInput
    ): Promise<ConnectResult> {
      const apiKey = extractApiKey(credentialsInput);
      if (!apiKey) {
        throw err(
          "invalid_credentials",
          "Rezdy connect requires a non-empty api_key"
        );
      }
      const baseUrl = resolveBaseFromInput(
        credentialsInput,
        options.defaultBaseUrl
      );
      const client = createRezdyClient({
        credentials: { api_key: apiKey, base_url: baseUrl },
        fetchFn: options.fetchFn,
        throttle: options.disableThrottle ? NOOP_THROTTLE : undefined,
      });

      const page = await client.getProducts({ offset: 0, limit: 100 });
      const products = page.products ?? [];
      const first = products[0];
      const supplierId =
        first?.supplierId != null ? String(first.supplierId) : apiKey.slice(0, 8);
      const supplierAlias = first?.supplierAlias?.trim() || undefined;
      const supplierName =
        first?.supplierName?.trim() ||
        supplierAlias ||
        "Rezdy supplier";

      const payload: RezdyCredentials = {
        api_key: apiKey,
        base_url: baseUrl,
        supplier_alias: supplierAlias,
        supplier_id: supplierId,
        supplier_name: supplierName,
      };
      const credentials_ref = await storeSecret(
        JSON.stringify(payload),
        "rezdy-provider-credentials"
      );

      const webhookToken = randomBytes(24).toString("hex");
      const webhook_secret_ref = await storeSecret(
        webhookToken,
        "rezdy-webhook-token"
      );

      const booking_base_url = supplierAlias
        ? `https://${supplierAlias}.rezdy.com`
        : null;

      return {
        external_account_id: supplierId,
        external_account_name: supplierName,
        credentials_ref,
        webhook_secret_ref,
        booking_base_url,
      };
    },

    async testConnection(
      integration: Integration
    ): Promise<TestConnectionResult> {
      try {
        const credentials = await loadCredentials(integration);
        const client = clientFor(credentials, options);
        await client.getProducts({ offset: 0, limit: 1 });
        return { ok: true };
      } catch (e) {
        const message =
          e instanceof Error ? e.message : "Connection test failed";
        return { ok: false, error: message };
      }
    },

    async listProducts(
      integration: Integration
    ): Promise<NormalisedProduct[]> {
      const credentials = await loadCredentials(integration);
      const client = clientFor(credentials, options);
      const products = await listAllProducts(client);
      return products
        .map(mapProduct)
        .filter((p): p is NormalisedProduct => p != null);
    },

    async listSessions(
      integration: Integration,
      productExternalId: string,
      from: Date,
      to: Date
    ): Promise<NormalisedSession[]> {
      const credentials = await loadCredentials(integration);
      const client = clientFor(credentials, options);
      const res = await client.getAvailability({
        productCodes: [productExternalId],
        from,
        to,
      });
      const fromMs = from.getTime();
      const toMs = to.getTime();
      return (res.sessions ?? [])
        .map(mapSession)
        .filter((s): s is NormalisedSession => {
          if (!s) return false;
          const t = Date.parse(s.start_at);
          return t >= fromMs && t <= toMs;
        });
    },

    async getAvailability(
      integration: Integration,
      productExternalId: string,
      sessionExternalId: string,
      availOptions: { timeoutMs: number }
    ): Promise<GetAvailabilityResult> {
      const credentials = await loadCredentials(integration);
      const client = clientFor(credentials, options);
      const { MAX_LEAD_HOURS } = getPlatformConfig();
      const now = new Date();
      // Look back MAX_LEAD_HOURS so a session id from a recent listSessions
      // window is still resolvable (click recheck / contract fixtures).
      const to = new Date(
        now.getTime() + (MAX_LEAD_HOURS + 24) * 60 * 60 * 1000
      );
      const from = new Date(
        now.getTime() - MAX_LEAD_HOURS * 60 * 60 * 1000
      );

      const res = await client.getAvailability({
        productCodes: [productExternalId],
        from,
        to,
        timeoutMs: availOptions.timeoutMs,
      });

      const match = (res.sessions ?? []).find(
        (s) => String(s.id) === String(sessionExternalId)
      );
      if (!match) {
        throw err(
          "session_not_found",
          `Session ${sessionExternalId} not found for product ${productExternalId}`
        );
      }
      const seats = Math.max(0, Math.floor(Number(match.seatsAvailable ?? 0)));
      return {
        seats_available: seats,
        status: sessionStatusFromSeats(seats),
      };
    },

    async verifyDiscount(
      integration: Integration,
      input: VerifyDiscountInput
    ): Promise<VerifyDiscountResult> {
      const credentials = await loadCredentials(integration);
      const client = clientFor(credentials, options);

      if (input.mechanism === "price_option") {
        const optionId = input.external_deal_price_option_id;
        if (!optionId) return { status: "not_found" };
        const products = await listAllProducts(client);
        for (const product of products) {
          for (const po of product.priceOptions ?? []) {
            if (String(po.id) === String(optionId)) {
              const actual = majorToMinor(po.price);
              if (actual === input.expected_price_minor) {
                return { status: "verified", actual_price_minor: actual };
              }
              return { status: "not_found", actual_price_minor: actual };
            }
          }
        }
        return { status: "not_found" };
      }

      if (input.mechanism === "separate_product") {
        const ref = input.external_deal_price_option_id ?? "";
        const code = ref.startsWith("product:")
          ? ref.slice("product:".length)
          : ref;
        if (!code) return { status: "not_found" };
        const products = await listAllProducts(client);
        const product = products.find((p) => p.productCode === code);
        if (!product) return { status: "not_found" };
        const options = product.priceOptions ?? [];
        const lowest =
          options.length > 0
            ? Math.min(...options.map((o) => majorToMinor(o.price)))
            : majorToMinor(product.advertisedPrice);
        if (lowest === input.expected_price_minor) {
          return { status: "verified", actual_price_minor: lowest };
        }
        return { status: "not_found", actual_price_minor: lowest };
      }

      if (input.mechanism === "promo_code") {
        const code = (input.promo_code ?? "").trim();
        if (!code) return { status: "not_found" };
        // Quote needs product + session + option labels we don't have on
        // VerifyDiscountInput (Chunk 33 may pass richer context later).
        // Without that, we must not invent a booking — return cannot_verify
        // so the operator confirms + Test link (spec §7.5).
        try {
          // Probe: empty-ish quote with coupon only — if API rejects the
          // coupon distinctly we can return not_found; otherwise cannot_verify.
          const quote = await client.postQuote({
            coupon: code,
            items: [],
          });
          if (quote.requestStatus?.success === false) {
            const msg = (
              quote.requestStatus.error?.errorMessage ?? ""
            ).toLowerCase();
            if (
              msg.includes("coupon") ||
              msg.includes("promo") ||
              msg.includes("voucher")
            ) {
              return { status: "not_found" };
            }
          }
          if (
            quote.booking?.totalAmount != null &&
            majorToMinor(quote.booking.totalAmount) ===
              input.expected_price_minor
          ) {
            return {
              status: "verified",
              actual_price_minor: majorToMinor(quote.booking.totalAmount),
            };
          }
        } catch (e) {
          if (e instanceof AdapterOperationError) {
            const msg = e.message.toLowerCase();
            if (
              msg.includes("coupon") ||
              msg.includes("promo") ||
              msg.includes("not found") ||
              msg.includes("invalid")
            ) {
              return { status: "not_found" };
            }
          }
        }
        return { status: "cannot_verify" };
      }

      return { status: "cannot_verify" };
    },

    buildBookingUrl(
      integration: Integration,
      product: BookingProductRef,
      _session?: BookingSessionRef,
      _promoCode?: string | null
    ): string {
      // Session / promo deep links are not documented (§7.6) — product page only.
      // Alias is read sync from credentials when possible via bookingBaseUrl.
      // We cannot await here; prefer bookingBaseUrl, else alias pattern from
      // external account name is insufficient — use bookingBaseUrl or generic.
      const code = productExternalId(product);
      const base = integration.bookingBaseUrl?.replace(/\/$/, "");
      let url: string;
      if (base) {
        url = /\/view\//.test(base)
          ? base
          : `${base}/view/${encodeURIComponent(code)}`;
      } else {
        // externalAccountName is display name; alias may be in booking_base_url
        // after connect settings. Fall back to book.rezdy.com/view/{code}.
        url = `https://book.rezdy.com/view/${encodeURIComponent(code)}`;
      }

      if (
        integration.conversionTrackingMethod === "booking_source" &&
        integration.bookingSourceLabel
      ) {
        const u = new URL(url);
        u.searchParams.set("agentCode", integration.bookingSourceLabel);
        return u.toString();
      }
      return url;
    },

    async handleWebhook(
      request: ProviderWebhookRequest
    ): Promise<ProviderWebhookEvent[]> {
      // Token presence is advisory here; sync layer verifies webhook_secret_ref.
      void headerOrQueryToken(request);
      return parseRezdyWebhookBody(request.body);
    },
  };

  return adapter;
}

/** Singleton used by the registry. */
let defaultAdapter: ProviderAdapter | null = null;

export function getRezdyAdapter(
  options?: RezdyAdapterOptions
): ProviderAdapter {
  if (options?.fetchFn || options?.defaultBaseUrl) {
    return createRezdyAdapter(options);
  }
  if (!defaultAdapter) {
    defaultAdapter = createRezdyAdapter();
  }
  return defaultAdapter;
}

export function resetRezdyAdapterSingleton(): void {
  defaultAdapter = null;
}

/**
 * Build booking URL when credentials (with supplier_alias) are already loaded.
 * Used by tests and the sandbox script; production buildBookingUrl prefers
 * integration.bookingBaseUrl set at connect/settings time.
 */
export function buildRezdyBookingUrlWithCredentials(
  integration: Integration,
  credentials: RezdyCredentials,
  productCode: string
): string {
  let url = bookingUrl(integration, credentials, productCode);
  if (
    integration.conversionTrackingMethod === "booking_source" &&
    integration.bookingSourceLabel
  ) {
    const u = new URL(url);
    u.searchParams.set("agentCode", integration.bookingSourceLabel);
    return u.toString();
  }
  return url;
}
