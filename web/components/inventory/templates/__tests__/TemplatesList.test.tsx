import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TemplatesList } from "@/components/inventory/templates/TemplatesList";
import { DEV_SEED_IDS } from "@/lib/marketplace/seed-dev";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => "/account/inventory/templates",
}));

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({
    session: { access_token: "test-token" },
    user: { id: "u1", email: "manager@harbour-kayaks.dev" },
    isLoading: false,
  }),
}));

const listMyOperators = vi.fn();
const listOperatorTemplatesApi = vi.fn();
const createDealFromTemplateApi = vi.fn();
const deleteOperatorTemplateApi = vi.fn();
const renameOperatorTemplateApi = vi.fn();

vi.mock("@/lib/marketplace/operator-deals-client", () => ({
  OperatorDealsApiError: class OperatorDealsApiError extends Error {
    status: number;
    constructor(message: string, status = 400) {
      super(message);
      this.status = status;
    }
  },
  listMyOperators: (...args: unknown[]) => listMyOperators(...args),
  listOperatorTemplatesApi: (...args: unknown[]) =>
    listOperatorTemplatesApi(...args),
  createDealFromTemplateApi: (...args: unknown[]) =>
    createDealFromTemplateApi(...args),
  deleteOperatorTemplateApi: (...args: unknown[]) =>
    deleteOperatorTemplateApi(...args),
  renameOperatorTemplateApi: (...args: unknown[]) =>
    renameOperatorTemplateApi(...args),
}));

describe("TemplatesList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listMyOperators.mockResolvedValue({
      operators: [
        {
          id: DEV_SEED_IDS.harbourKayaks.operatorId,
          tradingName: "Harbour Kayaks",
          slug: "harbour-kayaks",
          role: "manager",
          timezone: "Pacific/Auckland",
          currency: "NZD",
        },
      ],
    });
    listOperatorTemplatesApi.mockResolvedValue({
      templates: [
        {
          id: "tpl-1",
          operator_id: DEV_SEED_IDS.harbourKayaks.operatorId,
          name: "Kayak evening",
          payload: { deal_type: "manual_session" },
          deal_type: "manual_session",
          created_at: "2026-10-20T05:00:00.000Z",
          updated_at: "2026-10-20T05:00:00.000Z",
        },
      ],
    });
    createDealFromTemplateApi.mockResolvedValue({
      deal: { id: "deal-from-tpl", status: "draft" },
    });
  });

  it("lists templates and creates a draft deal", async () => {
    render(<TemplatesList />);

    await waitFor(() => {
      expect(screen.getByText("Kayak evening")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Create deal" }));

    await waitFor(() => {
      expect(createDealFromTemplateApi).toHaveBeenCalledWith(
        DEV_SEED_IDS.harbourKayaks.operatorId,
        "tpl-1",
        {},
        "test-token"
      );
      expect(push).toHaveBeenCalledWith(
        "/account/inventory/deals/deal-from-tpl"
      );
    });
  });
});
