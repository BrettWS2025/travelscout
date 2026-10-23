import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { IntegrationDetail } from "@/components/settings/integrations/IntegrationDetail";
import { DEV_SEED_IDS } from "@/lib/marketplace/seed-dev";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/account/settings/integrations/rezdy",
}));

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({
    session: { access_token: "test-token" },
    user: { id: "u1", email: "owner@bay-cruises.dev" },
    isLoading: false,
  }),
}));

const listMyOperators = vi.fn();
vi.mock("@/lib/marketplace/operator-deals-client", () => ({
  listMyOperators: (...args: unknown[]) => listMyOperators(...args),
}));

const getIntegrationDetailApi = vi.fn();
const connectIntegrationApi = vi.fn();
const listIntegrationProductsApi = vi.fn();
const listSyncLogsApi = vi.fn();
const getDisconnectPreviewApi = vi.fn();
const setIntegrationProductEnabledApi = vi.fn();
const resyncIntegrationApi = vi.fn();
const patchIntegrationSettingsApi = vi.fn();
const refreshIntegrationProductsApi = vi.fn();
const testIntegrationApi = vi.fn();
const disconnectIntegrationApi = vi.fn();
const testIntegrationBookingLinkApi = vi.fn();

vi.mock("@/lib/marketplace/integrations-client", () => ({
  IntegrationsApiError: class IntegrationsApiError extends Error {
    status: number;
    constructor(message: string, status = 400) {
      super(message);
      this.status = status;
    }
  },
  getIntegrationDetailApi: (...a: unknown[]) => getIntegrationDetailApi(...a),
  connectIntegrationApi: (...a: unknown[]) => connectIntegrationApi(...a),
  listIntegrationProductsApi: (...a: unknown[]) =>
    listIntegrationProductsApi(...a),
  listSyncLogsApi: (...a: unknown[]) => listSyncLogsApi(...a),
  getDisconnectPreviewApi: (...a: unknown[]) => getDisconnectPreviewApi(...a),
  setIntegrationProductEnabledApi: (...a: unknown[]) =>
    setIntegrationProductEnabledApi(...a),
  resyncIntegrationApi: (...a: unknown[]) => resyncIntegrationApi(...a),
  patchIntegrationSettingsApi: (...a: unknown[]) =>
    patchIntegrationSettingsApi(...a),
  refreshIntegrationProductsApi: (...a: unknown[]) =>
    refreshIntegrationProductsApi(...a),
  testIntegrationApi: (...a: unknown[]) => testIntegrationApi(...a),
  disconnectIntegrationApi: (...a: unknown[]) =>
    disconnectIntegrationApi(...a),
  testIntegrationBookingLinkApi: (...a: unknown[]) =>
    testIntegrationBookingLinkApi(...a),
}));

const connectedIntegration = {
  id: "int-1",
  operator_id: DEV_SEED_IDS.bayCruises.operatorId,
  provider: "rezdy",
  status: "connected",
  auth_type: "api_key",
  external_account_id: "mock-1",
  external_account_name: "Bay Cruises Rezdy",
  sync_mode: "hybrid",
  poll_interval_seconds: 300,
  webhook_last_received_at: null,
  last_sync_at: "2026-10-21T00:00:00.000Z",
  last_successful_sync_at: "2026-10-21T00:00:00.000Z",
  last_error_code: null,
  last_error_message: null,
  default_booking_destination_type: "provider_booking_page",
  booking_base_url: "https://bay.rezdy.com",
  conversion_tracking_method: "none",
  booking_source_label: null,
  auto_enable_new_products: false,
  connected_at: "2026-10-20T00:00:00.000Z",
  connected_by: "user-1",
  created_at: "2026-10-20T00:00:00.000Z",
  updated_at: "2026-10-21T00:00:00.000Z",
};

describe("IntegrationDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listMyOperators.mockResolvedValue({
      operators: [
        {
          id: DEV_SEED_IDS.bayCruises.operatorId,
          tradingName: "Bay Cruises",
          slug: "bay-cruises",
          role: "owner",
          timezone: "Pacific/Auckland",
          currency: "NZD",
        },
      ],
    });
    getIntegrationDetailApi.mockResolvedValue({
      card: {
        provider: "rezdy",
        available: true,
        status: "connected",
        account_name: "Bay Cruises Rezdy",
        last_successful_sync_at: "2026-10-21T00:00:00.000Z",
        integration_id: "int-1",
        connected_at: "2026-10-20T00:00:00.000Z",
        connected_by: "user-1",
        last_error_message: null,
        capabilities: {
          available: true,
          webhooks_availability: false,
          promo_code_verify: false,
          deep_link_session: false,
          deep_link_promo: false,
          min_poll_seconds: 60,
          max_poll_seconds: 900,
          preferred_sync_mode: "hybrid",
        },
      },
      integration: connectedIntegration,
    });
    listIntegrationProductsApi.mockResolvedValue({
      products: [
        {
          id: "prod-1",
          external_id: "P1",
          name: "Sunset Cruise",
          price_min_minor: 10000,
          price_max_minor: 10000,
          currency: "NZD",
          sessions_next_72h: 2,
          is_enabled_for_deals: true,
          archived_in_provider: false,
          last_synced_at: "2026-10-21T00:00:00.000Z",
        },
      ],
    });
    listSyncLogsApi.mockResolvedValue({
      sync_logs: [
        {
          id: "log-1",
          integration_id: "int-1",
          sync_type: "full",
          status: "success",
          started_at: "2026-10-21T00:00:00.000Z",
          finished_at: "2026-10-21T00:00:10.000Z",
          items_processed: 3,
          error_code: null,
          error_message: null,
          affected_deal_ids: [],
          affected_deals: [],
          created_at: "2026-10-21T00:00:00.000Z",
          updated_at: "2026-10-21T00:00:10.000Z",
        },
      ],
    });
    getDisconnectPreviewApi.mockResolvedValue({
      provider: "rezdy",
      integration_id: "int-1",
      deals_to_pause: 0,
      account_name: "Bay Cruises Rezdy",
    });
    setIntegrationProductEnabledApi.mockResolvedValue({
      product: {
        id: "prod-1",
        external_id: "P1",
        name: "Sunset Cruise",
        is_enabled_for_deals: false,
        archived_in_provider: false,
        last_synced_at: "2026-10-21T00:00:00.000Z",
      },
    });
    resyncIntegrationApi.mockResolvedValue({
      sync_log: { id: "log-2", status: "success" },
      items_processed: 3,
      affected_deal_ids: [],
      resumed_deal_ids: [],
    });
  });

  it("loads connected detail: disable product, resync, shows sync log", async () => {
    render(<IntegrationDetail provider="rezdy" />);

    await waitFor(() => {
      expect(screen.getByText("Sunset Cruise")).toBeInTheDocument();
    });

    expect(screen.getByText("Bay Cruises Rezdy")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sync Again/i })).toBeInTheDocument();
    expect(screen.getByText(/Full Sync · Success/i)).toBeInTheDocument();

    const enableToggle = screen.getByRole("checkbox", {
      name: /Enable Sunset Cruise for deals/i,
    });
    fireEvent.click(enableToggle);

    await waitFor(() => {
      expect(setIntegrationProductEnabledApi).toHaveBeenCalledWith(
        DEV_SEED_IDS.bayCruises.operatorId,
        "rezdy",
        "prod-1",
        false,
        "test-token"
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /Sync Again/i }));

    await waitFor(() => {
      expect(resyncIntegrationApi).toHaveBeenCalledWith(
        DEV_SEED_IDS.bayCruises.operatorId,
        "rezdy",
        "test-token"
      );
    });
  });
});
