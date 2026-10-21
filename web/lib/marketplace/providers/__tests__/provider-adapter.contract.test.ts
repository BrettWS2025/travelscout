/**
 * Chunk 26 — ProviderAdapter contract tests.
 *
 * Run against the mock now; the same suite should pass for Rezdy (Chunk 31)
 * by swapping `createAdapterUnderTest`.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Integration } from "@/lib/marketplace/integration";
import {
  configureSecrets,
  createMemorySecretBackend,
  createSecretsHelper,
  resetSecretsConfig,
} from "@/lib/marketplace/secrets";
import type { ProviderAdapter } from "@/lib/marketplace/providers/adapter";
import {
  createMockAdapter,
  type MockAdapterController,
} from "@/lib/marketplace/providers/mock";

const TEST_KEY_HEX =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const FIXED_NOW = new Date("2026-10-20T02:00:00.000Z");

function createAdapterUnderTest(): {
  adapter: ProviderAdapter;
  controller: MockAdapterController;
} {
  // Swap this factory for Rezdy fixtures in Chunk 31.
  const controller = createMockAdapter({ now: FIXED_NOW });
  return { adapter: controller.adapter, controller };
}

function sampleIntegration(
  overrides: Partial<Integration> = {}
): Integration {
  const now = FIXED_NOW.toISOString();
  return {
    id: "int-mock-1",
    operatorId: "op-1",
    provider: "rezdy",
    status: "connected",
    authType: "api_key",
    credentialsRef: null,
    webhookSecretRef: null,
    externalAccountId: "mock-acct-bay-cruises",
    externalAccountName: "Mock Bay Cruises",
    syncMode: "polling",
    pollIntervalSeconds: 300,
    webhookLastReceivedAt: null,
    lastSyncAt: now,
    lastSuccessfulSyncAt: now,
    lastErrorCode: null,
    lastErrorMessage: null,
    defaultBookingDestinationType: "provider_booking_page",
    bookingBaseUrl: "https://book.mock.example",
    conversionTrackingMethod: "none",
    bookingSourceLabel: null,
    autoEnableNewProducts: false,
    connectedAt: now,
    connectedBy: "user-1",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("ProviderAdapter contract (mock)", () => {
  let adapter: ProviderAdapter;
  let controller: MockAdapterController;
  let integration: Integration;

  beforeEach(async () => {
    resetSecretsConfig();
    const helper = createSecretsHelper({
      backend: createMemorySecretBackend(),
      key: Buffer.from(TEST_KEY_HEX, "hex"),
    });
    configureSecrets(helper);

    const underTest = createAdapterUnderTest();
    adapter = underTest.adapter;
    controller = underTest.controller;

    const connected = await adapter.connect({ api_key: "test-key-123" });
    expect(connected.credentials_ref).toBeTruthy();
    expect(connected.external_account_id).toBeTruthy();
    expect(connected.external_account_name).toBeTruthy();
    // Must never echo the secret back
    expect(JSON.stringify(connected)).not.toContain("test-key-123");

    integration = sampleIntegration({
      credentialsRef: connected.credentials_ref,
      externalAccountId: connected.external_account_id,
      externalAccountName: connected.external_account_name,
    });
  });

  afterEach(() => {
    resetSecretsConfig();
  });

  it("reports capabilities with available true and poll bounds", () => {
    const caps = adapter.capabilities();
    expect(caps.available).toBe(true);
    expect(caps.min_poll_seconds).toBeGreaterThan(0);
    expect(caps.max_poll_seconds).toBeGreaterThanOrEqual(caps.min_poll_seconds);
    expect(typeof caps.webhooks_availability).toBe("boolean");
    expect(typeof caps.promo_code_verify).toBe("boolean");
    expect(typeof caps.deep_link_session).toBe("boolean");
    expect(typeof caps.deep_link_promo).toBe("boolean");
  });

  it("testConnection succeeds with stored credentials", async () => {
    const result = await adapter.testConnection(integration);
    expect(result.ok).toBe(true);
  });

  it("listProducts returns ≥2 products with minor-unit prices and no floats", async () => {
    const products = await adapter.listProducts(integration);
    expect(products.length).toBeGreaterThanOrEqual(2);

    for (const product of products) {
      expect(product.external_id).toBeTruthy();
      expect(product.name.length).toBeGreaterThan(0);
      expect(Array.isArray(product.images)).toBe(true);
      expect(typeof product.archived).toBe("boolean");
      expect(product.price_options.length).toBeGreaterThan(0);
      for (const option of product.price_options) {
        expect(Number.isInteger(option.price_minor)).toBe(true);
        expect(option.price_minor).toBeGreaterThan(0);
        expect(option.currency).toMatch(/^[A-Z]{3}$/);
        expect(option.type).toBeTruthy();
      }
    }
  });

  it("listSessions returns UTC sessions within the requested window", async () => {
    const products = await adapter.listProducts(integration);
    const product = products[0]!;
    const from = FIXED_NOW;
    const to = new Date(FIXED_NOW.getTime() + 3 * 24 * 60 * 60 * 1000);

    const sessions = await adapter.listSessions(
      integration,
      product.external_id,
      from,
      to
    );
    expect(sessions.length).toBeGreaterThan(0);

    for (const session of sessions) {
      expect(session.external_id).toBeTruthy();
      expect(session.start_at.endsWith("Z")).toBe(true);
      const startMs = Date.parse(session.start_at);
      expect(startMs).toBeGreaterThanOrEqual(from.getTime());
      expect(startMs).toBeLessThanOrEqual(to.getTime());
      expect(Number.isInteger(session.seats_available)).toBe(true);
      expect(["live", "sold_out", "cancelled", "expired"]).toContain(
        session.status
      );
      for (const price of session.prices) {
        expect(Number.isInteger(price.price_minor)).toBe(true);
      }
    }
  });

  it("getAvailability reflects seat mutations and cancellations", async () => {
    const products = await adapter.listProducts(integration);
    const product = products[0]!;
    const sessions = await adapter.listSessions(
      integration,
      product.external_id,
      FIXED_NOW,
      new Date(FIXED_NOW.getTime() + 3 * 24 * 60 * 60 * 1000)
    );
    const session = sessions[0]!;

    controller.setSeats(product.external_id, session.external_id, 3);
    let avail = await adapter.getAvailability(
      integration,
      product.external_id,
      session.external_id,
      { timeoutMs: 500 }
    );
    expect(avail.seats_available).toBe(3);
    expect(avail.status).toBe("live");

    controller.setSeats(product.external_id, session.external_id, 0);
    avail = await adapter.getAvailability(
      integration,
      product.external_id,
      session.external_id,
      { timeoutMs: 500 }
    );
    expect(avail.seats_available).toBe(0);
    expect(avail.status).toBe("sold_out");

    controller.cancelSession(product.external_id, session.external_id);
    avail = await adapter.getAvailability(
      integration,
      product.external_id,
      session.external_id,
      { timeoutMs: 500 }
    );
    expect(avail.status).toBe("cancelled");
  });

  it("getAvailability times out when delay exceeds timeoutMs", async () => {
    const products = await adapter.listProducts(integration);
    const product = products[0]!;
    const sessions = await adapter.listSessions(
      integration,
      product.external_id,
      FIXED_NOW,
      new Date(FIXED_NOW.getTime() + 3 * 24 * 60 * 60 * 1000)
    );
    const session = sessions[0]!;

    controller.setAvailabilityDelayMs(200);
    await expect(
      adapter.getAvailability(
        integration,
        product.external_id,
        session.external_id,
        { timeoutMs: 50 }
      )
    ).rejects.toThrow(/timed out/i);
  });

  it("verifyDiscount verifies price_option and promo_code; cannot_verify for separate_product", async () => {
    const priceOption = await adapter.verifyDiscount(integration, {
      mechanism: "price_option",
      external_deal_price_option_id: "po-kayak-deal-adult",
      expected_price_minor: 5400,
    });
    expect(priceOption.status).toBe("verified");
    expect(priceOption.actual_price_minor).toBe(5400);

    controller.setProductPrice(
      "prod-harbour-kayak",
      "po-kayak-deal-adult",
      7000
    );
    const afterChange = await adapter.verifyDiscount(integration, {
      mechanism: "price_option",
      external_deal_price_option_id: "po-kayak-deal-adult",
      expected_price_minor: 5400,
    });
    expect(afterChange.status).toBe("not_found");
    expect(afterChange.actual_price_minor).toBe(7000);

    const promo = await adapter.verifyDiscount(integration, {
      mechanism: "promo_code",
      promo_code: "HALFKAKE",
      expected_price_minor: 5400,
    });
    expect(promo.status).toBe("verified");

    const separate = await adapter.verifyDiscount(integration, {
      mechanism: "separate_product",
      expected_price_minor: 1000,
    });
    expect(separate.status).toBe("cannot_verify");
  });

  it("buildBookingUrl returns https URL with optional session and promo", () => {
    const url = adapter.buildBookingUrl(
      integration,
      { external_id: "prod-harbour-kayak" },
      { external_id: "sess-1" },
      "HALFKAKE"
    );
    expect(url.startsWith("https://")).toBe(true);
    expect(url).toContain("prod-harbour-kayak");
    expect(url).toContain("session=sess-1");
    expect(url).toContain("promo=HALFKAKE");
  });

  it("forced errors surface as failures on listProducts", async () => {
    controller.setForceError("Provider unavailable");
    await expect(adapter.listProducts(integration)).rejects.toThrow(
      /Provider unavailable/
    );
  });
});
