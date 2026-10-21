/**
 * Chunk 26 — adapter registry and coming-soon providers.
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  AdapterNotImplementedError,
  UnknownProviderError,
  getAdapter,
  isProviderAvailable,
  listRegisteredProviders,
  registerAdapterFactory,
  resetAdapterRegistry,
  createComingSoonAdapter,
  createMockAdapter,
} from "@/lib/marketplace/providers";

afterEach(() => {
  resetAdapterRegistry();
});

describe("getAdapter registry", () => {
  it("returns an available adapter for rezdy (mock until Chunk 31)", () => {
    const adapter = getAdapter("rezdy");
    expect(adapter.provider).toBe("rezdy");
    expect(adapter.capabilities().available).toBe(true);
  });

  it("returns the same default mock instance for rezdy", () => {
    const a = getAdapter("rezdy");
    const b = getAdapter("rezdy");
    expect(a).toBe(b);
  });

  it("registers fareharbor, bokun, checkfront as coming soon", () => {
    for (const provider of ["fareharbor", "bokun", "checkfront"] as const) {
      const adapter = getAdapter(provider);
      expect(adapter.capabilities().available).toBe(false);
      expect(isProviderAvailable(provider)).toBe(false);
      expect(() =>
        adapter.buildBookingUrl(
          {
            id: "x",
            operatorId: "o",
            provider,
            status: "not_connected",
            authType: null,
            credentialsRef: null,
            webhookSecretRef: null,
            externalAccountId: null,
            externalAccountName: null,
            syncMode: null,
            pollIntervalSeconds: null,
            webhookLastReceivedAt: null,
            lastSyncAt: null,
            lastSuccessfulSyncAt: null,
            lastErrorCode: null,
            lastErrorMessage: null,
            defaultBookingDestinationType: null,
            bookingBaseUrl: null,
            conversionTrackingMethod: "none",
            bookingSourceLabel: null,
            autoEnableNewProducts: false,
            connectedAt: null,
            connectedBy: null,
            createdAt: "2026-10-20T00:00:00.000Z",
            updatedAt: "2026-10-20T00:00:00.000Z",
          },
          { external_id: "p1" }
        )
      ).toThrow(AdapterNotImplementedError);
    }
  });

  it("throws UnknownProviderError for unknown and manual", () => {
    expect(() => getAdapter("manual")).toThrow(UnknownProviderError);
    expect(() => getAdapter("not-a-provider")).toThrow(UnknownProviderError);
  });

  it("lists all integration providers", () => {
    expect(listRegisteredProviders()).toEqual([
      "rezdy",
      "fareharbor",
      "bokun",
      "checkfront",
    ]);
  });

  it("allows tests to replace the rezdy factory with a custom mock", async () => {
    const mock = createMockAdapter({
      now: new Date("2026-10-21T00:00:00.000Z"),
    });
    registerAdapterFactory("rezdy", () => mock.adapter);
    expect(getAdapter("rezdy")).toBe(mock.adapter);

    registerAdapterFactory("rezdy", null);
    // After clear, default re-registers on next get
    expect(getAdapter("rezdy").capabilities().available).toBe(true);
  });

  it("createComingSoonAdapter rejects connect", async () => {
    const adapter = createComingSoonAdapter("fareharbor");
    await expect(adapter.connect({ api_key: "x" })).rejects.toThrow(
      AdapterNotImplementedError
    );
  });
});
