import { describe, expect, it } from "vitest";
import type { IntegrationProviderCard } from "@/lib/marketplace/integration-connect";
import {
  canManageIntegrations,
  formatPollInterval,
  integrationErrorFixText,
  pollIntervalOptions,
  providerDetailHref,
  showManualOperatorExplainer,
} from "@/lib/marketplace/integrations-settings-ui";

function card(
  overrides: Partial<IntegrationProviderCard> = {}
): IntegrationProviderCard {
  return {
    provider: "rezdy",
    available: true,
    status: "not_connected",
    account_name: null,
    last_successful_sync_at: null,
    integration_id: null,
    connected_at: null,
    connected_by: null,
    last_error_message: null,
    capabilities: null,
    ...overrides,
  };
}

describe("integrations-settings-ui", () => {
  it("allows owner and manager to manage integrations", () => {
    expect(canManageIntegrations("owner")).toBe(true);
    expect(canManageIntegrations("manager")).toBe(true);
    expect(canManageIntegrations("staff")).toBe(false);
    expect(canManageIntegrations(null)).toBe(false);
  });

  it("shows manual explainer only when nothing is connected", () => {
    expect(showManualOperatorExplainer([card(), card({ provider: "fareharbor", available: false })])).toBe(
      true
    );
    expect(
      showManualOperatorExplainer([card({ status: "connected" })])
    ).toBe(false);
    expect(
      showManualOperatorExplainer([card({ status: "degraded" })])
    ).toBe(false);
  });

  it("maps error codes to plain-language fix text", () => {
    const text = integrationErrorFixText("sync_failed", "boom", "Rezdy");
    expect(text).toMatch(/Sync Again/i);
    expect(text).toMatch(/Rezdy/);

    const auth = integrationErrorFixText("invalid_api_key", null, "Rezdy");
    expect(auth).toMatch(/API key/i);

    expect(integrationErrorFixText(null, null, "Rezdy")).toBeNull();
  });

  it("clamps poll interval options to adapter min/max", () => {
    expect(pollIntervalOptions(300, 900)).toEqual([300, 600, 900]);
    expect(pollIntervalOptions(60, 60)).toEqual([60]);
    expect(formatPollInterval(300)).toBe("5 min");
    expect(formatPollInterval(3600)).toBe("1 h");
  });

  it("builds provider detail href", () => {
    expect(providerDetailHref("rezdy")).toBe(
      "/account/settings/integrations/rezdy"
    );
  });
});
