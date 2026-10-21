import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { IntegrationsGrid } from "@/components/settings/integrations/IntegrationsGrid";
import { DEV_SEED_IDS } from "@/lib/marketplace/seed-dev";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/account/settings/integrations",
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

const listIntegrationsApi = vi.fn();
vi.mock("@/lib/marketplace/integrations-client", () => ({
  IntegrationsApiError: class IntegrationsApiError extends Error {
    status: number;
    constructor(message: string, status = 400) {
      super(message);
      this.status = status;
    }
  },
  listIntegrationsApi: (...args: unknown[]) => listIntegrationsApi(...args),
}));

describe("IntegrationsGrid", () => {
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
    listIntegrationsApi.mockResolvedValue({
      integrations: [
        {
          provider: "rezdy",
          available: true,
          status: "not_connected",
          account_name: null,
          last_successful_sync_at: null,
          integration_id: null,
          connected_at: null,
          connected_by: null,
          last_error_message: null,
          capabilities: { available: true, min_poll_seconds: 60, max_poll_seconds: 900 },
        },
        {
          provider: "fareharbor",
          available: false,
          status: "not_connected",
          account_name: null,
          last_successful_sync_at: null,
          integration_id: null,
          connected_at: null,
          connected_by: null,
          last_error_message: null,
          capabilities: { available: false },
        },
        {
          provider: "bokun",
          available: false,
          status: "not_connected",
          account_name: null,
          last_successful_sync_at: null,
          integration_id: null,
          connected_at: null,
          connected_by: null,
          last_error_message: null,
          capabilities: { available: false },
        },
        {
          provider: "checkfront",
          available: false,
          status: "not_connected",
          account_name: null,
          last_successful_sync_at: null,
          integration_id: null,
          connected_at: null,
          connected_by: null,
          last_error_message: null,
          capabilities: { available: false },
        },
      ],
    });
  });

  it("shows Rezdy live and coming-soon cards plus manual explainer", async () => {
    render(<IntegrationsGrid />);

    await waitFor(() => {
      expect(screen.getByText("Rezdy")).toBeInTheDocument();
    });

    expect(screen.getByText("FareHarbor")).toBeInTheDocument();
    expect(screen.getAllByText("Coming soon").length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByText(/List deals without a booking system/i)
    ).toBeInTheDocument();

    const rezdyLink = screen.getByRole("link", { name: /Rezdy/i });
    expect(rezdyLink).toHaveAttribute(
      "href",
      "/account/settings/integrations/rezdy"
    );
  });

  it("hides integrations for staff", async () => {
    listMyOperators.mockResolvedValue({
      operators: [
        {
          id: DEV_SEED_IDS.harbourKayaks.operatorId,
          tradingName: "Harbour Kayaks",
          slug: "harbour-kayaks",
          role: "staff",
          timezone: "Pacific/Auckland",
          currency: "NZD",
        },
      ],
    });

    render(<IntegrationsGrid />);

    await waitFor(() => {
      expect(
        screen.getByText(/Integrations are for owners and managers/i)
      ).toBeInTheDocument();
    });
    expect(listIntegrationsApi).not.toHaveBeenCalled();
  });
});
