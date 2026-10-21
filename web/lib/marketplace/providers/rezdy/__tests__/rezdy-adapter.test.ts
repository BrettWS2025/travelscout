/**
 * Chunk 31 — Rezdy adapter unit tests (mapping, throttle, webhooks, fixtures).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  configureSecrets,
  createMemorySecretBackend,
  createSecretsHelper,
  resetSecretsConfig,
} from "@/lib/marketplace/secrets";
import {
  createRezdyFixtureController,
  createThrottle,
  majorToMinor,
  mapPriceOptionType,
  mapProduct,
  mapSession,
  parseRezdyWebhookBody,
  REZDY_CAPABILITIES,
  resetAllThrottles,
  toUtcIso,
} from "@/lib/marketplace/providers/rezdy";
import type { Integration } from "@/lib/marketplace/integration";

const TEST_KEY_HEX =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("Rezdy mapping helpers", () => {
  it("converts major units to integer minor units", () => {
    expect(majorToMinor(120)).toBe(12000);
    expect(majorToMinor(54.0)).toBe(5400);
    expect(majorToMinor(99.99)).toBe(9999);
    expect(majorToMinor(null)).toBe(0);
  });

  it("maps price option labels to price_option_type", () => {
    expect(mapPriceOptionType("Adult")).toBe("adult");
    expect(mapPriceOptionType("Child (under 12)")).toBe("child");
    expect(mapPriceOptionType("Infant")).toBe("infant");
    expect(mapPriceOptionType("Senior citizen")).toBe("senior");
    expect(mapPriceOptionType("Student")).toBe("student");
    expect(mapPriceOptionType("Family of 4")).toBe("family");
    expect(mapPriceOptionType("Group rate")).toBe("group");
    expect(mapPriceOptionType("Kayak")).toBe("per_unit");
    expect(mapPriceOptionType("Shared", "GROUP")).toBe("group");
  });

  it("maps products and sessions to normalised UTC / minor units", () => {
    const product = mapProduct({
      productCode: "PHARB1",
      name: "Harbour Kayak",
      currency: "NZD",
      durationMinutes: 120,
      priceOptions: [
        { id: 1, label: "Adult", price: 120.5, priceGroupType: "EACH" },
      ],
      images: [{ itemUrl: "https://cdn.example/a.jpg" }],
    });
    expect(product?.external_id).toBe("PHARB1");
    expect(product?.price_options[0]?.price_minor).toBe(12050);
    expect(product?.price_options[0]?.type).toBe("adult");

    const session = mapSession({
      id: 99,
      productCode: "PHARB1",
      startTime: "2026-10-21T01:00:00Z",
      endTime: "2026-10-21T03:00:00Z",
      seats: 10,
      seatsAvailable: 4,
      priceOptions: [{ id: 1, label: "Adult", price: 120 }],
    });
    expect(session?.external_id).toBe("99");
    expect(session?.start_at).toBe("2026-10-21T01:00:00.000Z");
    expect(session?.seats_available).toBe(4);
    expect(session?.status).toBe("live");
    expect(toUtcIso("2026-10-21T01:00:00Z")).toBe("2026-10-21T01:00:00.000Z");
  });
});

describe("Rezdy capabilities (spec §7.8)", () => {
  it("matches researched capability flags", () => {
    expect(REZDY_CAPABILITIES).toMatchObject({
      available: true,
      webhooks_availability: false,
      promo_code_verify: true,
      deep_link_session: false,
      deep_link_promo: false,
      min_poll_seconds: 60,
      max_poll_seconds: 900,
      preferred_sync_mode: "hybrid",
    });
  });
});

describe("Rezdy throttle", () => {
  afterEach(() => {
    resetAllThrottles();
  });

  it("serialises calls and respects min gap", async () => {
    let now = 1_000_000;
    const sleeps: number[] = [];
    const throttle = createThrottle({
      maxPerMinute: 100,
      minGapMs: 50,
      now: () => now,
      sleep: async (ms) => {
        sleeps.push(ms);
        now += ms;
      },
    });

    const order: number[] = [];
    await Promise.all([
      throttle.schedule(async () => {
        order.push(1);
      }),
      throttle.schedule(async () => {
        order.push(2);
      }),
    ]);
    expect(order).toEqual([1, 2]);
    expect(sleeps.some((ms) => ms >= 50)).toBe(true);
  });
});

describe("Rezdy webhook parsing", () => {
  it("emits product events from product payloads", () => {
    const events = parseRezdyWebhookBody({
      productCode: "PHARB1",
      productType: "ACTIVITY",
      name: "Harbour Kayak",
      type: "UPDATED_PRODUCT",
    });
    expect(events).toEqual([
      expect.objectContaining({
        type: "product_updated",
        product_external_id: "PHARB1",
      }),
    ]);
  });

  it("emits order events with product codes from items", () => {
    const events = parseRezdyWebhookBody({
      orderNumber: "ORD-1",
      type: "NEW_ORDER",
      items: [{ productCode: "PHARB1" }, { productCode: "PCRUZ2" }],
    });
    expect(events.map((e) => e.product_external_id).sort()).toEqual([
      "PCRUZ2",
      "PHARB1",
    ]);
    expect(events[0]?.type).toBe("order_created");
  });
});

describe("Rezdy fixture adapter connect + booking URL", () => {
  beforeEach(() => {
    resetSecretsConfig();
    const helper = createSecretsHelper({
      backend: createMemorySecretBackend(),
      key: Buffer.from(TEST_KEY_HEX, "hex"),
    });
    configureSecrets(helper);
  });

  afterEach(() => {
    resetSecretsConfig();
  });

  it("connect stores credentials_ref and webhook_secret_ref; never returns api key", async () => {
    const { adapter } = createRezdyFixtureController();
    const result = await adapter.connect({ api_key: "secret-live-key" });
    expect(result.credentials_ref).toBeTruthy();
    expect(result.webhook_secret_ref).toBeTruthy();
    expect(result.booking_base_url).toContain("fixture-bay-cruises.rezdy.com");
    expect(result.external_account_name).toBe("Fixture Bay Cruises");
    expect(JSON.stringify(result)).not.toContain("secret-live-key");
  });

  it("buildBookingUrl uses product view path without session/promo", async () => {
    const { adapter } = createRezdyFixtureController();
    const connected = await adapter.connect({ api_key: "k" });
    const integration: Integration = {
      id: "i1",
      operatorId: "o1",
      provider: "rezdy",
      status: "connected",
      authType: "api_key",
      credentialsRef: connected.credentials_ref,
      webhookSecretRef: connected.webhook_secret_ref ?? null,
      externalAccountId: connected.external_account_id,
      externalAccountName: connected.external_account_name,
      syncMode: "hybrid",
      pollIntervalSeconds: 300,
      webhookLastReceivedAt: null,
      lastSyncAt: null,
      lastSuccessfulSyncAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      defaultBookingDestinationType: "provider_booking_page",
      bookingBaseUrl: connected.booking_base_url ?? null,
      conversionTrackingMethod: "booking_source",
      bookingSourceLabel: "TRAVELSCOUT",
      autoEnableNewProducts: false,
      connectedAt: null,
      connectedBy: null,
      createdAt: "2026-10-20T00:00:00.000Z",
      updatedAt: "2026-10-20T00:00:00.000Z",
    };
    const url = adapter.buildBookingUrl(
      integration,
      { external_id: "PHARB1" },
      { external_id: "71001" },
      "HALFKAKE"
    );
    expect(url).toBe(
      "https://fixture-bay-cruises.rezdy.com/view/PHARB1?agentCode=TRAVELSCOUT"
    );
  });
});
