/**
 * Chunk 26/31 — ProviderAdapter contract tests.
 *
 * Runs against the mock and against recorded Rezdy fixtures (no live calls).
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
import {
  createRezdyFixtureController,
  type RezdyFixtureController,
} from "@/lib/marketplace/providers/rezdy";

const TEST_KEY_HEX =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const FIXED_NOW = new Date("2026-10-20T02:00:00.000Z");

type AdapterController = {
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
};

type Scenario = {
  name: string;
  create: () => {
    adapter: ProviderAdapter;
    controller: AdapterController;
  };
  /** IDs that differ between mock catalogue and Rezdy fixtures. */
  productId: string;
  dealPriceOptionId: string;
  dealPriceMinor: number;
  promoCode: string;
  expectDeepLinks: boolean;
};

const scenarios: Scenario[] = [
  {
    name: "mock",
    create: () => {
      const controller = createMockAdapter({ now: FIXED_NOW });
      return { adapter: controller.adapter, controller };
    },
    productId: "prod-harbour-kayak",
    dealPriceOptionId: "po-kayak-deal-adult",
    dealPriceMinor: 5400,
    promoCode: "HALFKAKE",
    expectDeepLinks: true,
  },
  {
    name: "rezdy fixtures",
    create: () => {
      const controller = createRezdyFixtureController();
      return { adapter: controller.adapter, controller };
    },
    productId: "PHARB1",
    dealPriceOptionId: "5003",
    dealPriceMinor: 5400,
    promoCode: "HALFKAKE",
    expectDeepLinks: false,
  },
];

function sampleIntegration(
  overrides: Partial<Integration> = {}
): Integration {
  const now = FIXED_NOW.toISOString();
  return {
    id: "int-contract-1",
    operatorId: "op-1",
    provider: "rezdy",
    status: "connected",
    authType: "api_key",
    credentialsRef: null,
    webhookSecretRef: null,
    externalAccountId: "acct",
    externalAccountName: "Contract Supplier",
    syncMode: "polling",
    pollIntervalSeconds: 300,
    webhookLastReceivedAt: null,
    lastSyncAt: now,
    lastSuccessfulSyncAt: now,
    lastErrorCode: null,
    lastErrorMessage: null,
    defaultBookingDestinationType: "provider_booking_page",
    bookingBaseUrl: "https://fixture-bay-cruises.rezdy.com",
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

describe.each(scenarios)(
  "ProviderAdapter contract ($name)",
  (scenario) => {
    let adapter: ProviderAdapter;
    let controller: AdapterController;
    let integration: Integration;

    beforeEach(async () => {
      resetSecretsConfig();
      const helper = createSecretsHelper({
        backend: createMemorySecretBackend(),
        key: Buffer.from(TEST_KEY_HEX, "hex"),
      });
      configureSecrets(helper);

      const underTest = scenario.create();
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
        bookingBaseUrl:
          connected.booking_base_url ??
          sampleIntegration().bookingBaseUrl,
        webhookSecretRef: connected.webhook_secret_ref ?? null,
      });
    });

    afterEach(() => {
      resetSecretsConfig();
    });

    it("reports capabilities with available true and poll bounds", () => {
      const caps = adapter.capabilities();
      expect(caps.available).toBe(true);
      expect(caps.min_poll_seconds).toBeGreaterThan(0);
      expect(caps.max_poll_seconds).toBeGreaterThanOrEqual(
        caps.min_poll_seconds
      );
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
      const product =
        products.find((p) => p.external_id === scenario.productId) ??
        products[0]!;
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
      const product =
        products.find((p) => p.external_id === scenario.productId) ??
        products[0]!;
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
      const product =
        products.find((p) => p.external_id === scenario.productId) ??
        products[0]!;
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
        external_deal_price_option_id: scenario.dealPriceOptionId,
        expected_price_minor: scenario.dealPriceMinor,
      });
      expect(priceOption.status).toBe("verified");
      expect(priceOption.actual_price_minor).toBe(scenario.dealPriceMinor);

      controller.setProductPrice(
        scenario.productId,
        scenario.dealPriceOptionId,
        7000
      );
      const afterChange = await adapter.verifyDiscount(integration, {
        mechanism: "price_option",
        external_deal_price_option_id: scenario.dealPriceOptionId,
        expected_price_minor: scenario.dealPriceMinor,
      });
      expect(afterChange.status).toBe("not_found");
      expect(afterChange.actual_price_minor).toBe(7000);

      const promo = await adapter.verifyDiscount(integration, {
        mechanism: "promo_code",
        promo_code: scenario.promoCode,
        expected_price_minor: scenario.dealPriceMinor,
      });
      // Mock verifies; Rezdy fixtures may verify via quote or cannot_verify
      expect(["verified", "cannot_verify"]).toContain(promo.status);
      if (promo.status === "verified") {
        expect(promo.actual_price_minor).toBe(scenario.dealPriceMinor);
      }

      const separate = await adapter.verifyDiscount(integration, {
        mechanism: "separate_product",
        expected_price_minor: 1000,
      });
      expect(["cannot_verify", "not_found"]).toContain(separate.status);
    });

    it("buildBookingUrl returns https URL; deep-links only when capable", () => {
      const caps = adapter.capabilities();
      const url = adapter.buildBookingUrl(
        integration,
        { external_id: scenario.productId },
        { external_id: "sess-1" },
        scenario.promoCode
      );
      expect(url.startsWith("https://")).toBe(true);
      expect(url).toContain(scenario.productId);
      if (scenario.expectDeepLinks && caps.deep_link_session) {
        expect(url).toContain("session=sess-1");
      }
      if (scenario.expectDeepLinks && caps.deep_link_promo) {
        expect(url).toContain(`promo=${scenario.promoCode}`);
      }
      if (!caps.deep_link_session) {
        expect(url).not.toMatch(/[?&]session=/);
      }
      if (!caps.deep_link_promo) {
        expect(url).not.toMatch(/[?&]promo=/);
      }
    });

    it("forced errors surface as failures on listProducts", async () => {
      controller.setForceError("Provider unavailable");
      await expect(adapter.listProducts(integration)).rejects.toThrow(
        /Provider unavailable/
      );
    });
  }
);

// Silence unused-type warnings for imported controllers in tooling that
// doesn't see describe.each usage.
void 0 as unknown as MockAdapterController;
void 0 as unknown as RezdyFixtureController;
