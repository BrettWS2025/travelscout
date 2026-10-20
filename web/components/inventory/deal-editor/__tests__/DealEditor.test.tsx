import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DealEditor } from "@/components/inventory/deal-editor/DealEditor";
import { DEV_SEED_IDS } from "@/lib/marketplace/seed-dev";
import { makeDealFixture } from "@/lib/marketplace/deal-status";

const push = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => "/account/inventory/deals/new",
}));

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({
    session: { access_token: "test-token" },
    user: { id: "u1", email: "manager@harbour-kayaks.dev" },
    isLoading: false,
  }),
}));

const createOperatorDeal = vi.fn();
const getOperatorDeal = vi.fn();
const updateOperatorDeal = vi.fn();
const publishOperatorDeal = vi.fn();

vi.mock("@/lib/marketplace/operator-deals-client", () => ({
  OperatorDealsApiError: class OperatorDealsApiError extends Error {
    status: number;
    errors: unknown[];
    needsConfirm = false;
    warnings: string[] = [];
    validation = null;
    maxDealPriceMinor = null;
    checks = null;
    constructor(message: string, status = 400) {
      super(message);
      this.status = status;
      this.errors = [];
    }
  },
  createOperatorDeal: (...args: unknown[]) => createOperatorDeal(...args),
  getOperatorDeal: (...args: unknown[]) => getOperatorDeal(...args),
  updateOperatorDeal: (...args: unknown[]) => updateOperatorDeal(...args),
  publishOperatorDeal: (...args: unknown[]) => publishOperatorDeal(...args),
  duplicateOperatorDeal: vi.fn(),
  createDealSessionApi: vi.fn(),
  updateDealSessionApi: vi.fn(),
  deleteDealSessionApi: vi.fn(),
  createDealPriceOptionApi: vi.fn(),
  updateDealPriceOptionApi: vi.fn(),
  deleteDealPriceOptionApi: vi.fn(),
  uploadDealMediaApi: vi.fn(),
  addDealVideoEmbedApi: vi.fn(),
  updateDealMediaApi: vi.fn(),
  setDealMediaCoverApi: vi.fn(),
  deleteDealMediaApi: vi.fn(),
  testDealLinkApi: vi.fn(),
}));

function incompleteDetail() {
  const deal = makeDealFixture({
    id: "deal-1",
    operatorId: DEV_SEED_IDS.harbourKayaks.operatorId,
    dealType: "manual_session",
    sourceProvider: "manual",
    title: "Short",
    status: "draft",
  });
  return {
    deal,
    sessions: [],
    priceOptions: [],
    discountSteps: [],
    media: [],
    validation: {
      ok: false,
      checks: [
        {
          key: "min_discount",
          label: "Minimum discount",
          passed: false,
          message: "Add a price option at ≥50% off",
          editorStep: "pricing" as const,
        },
        {
          key: "required_fields",
          label: "Required fields",
          passed: false,
          message: "Title too short",
          editorStep: "content" as const,
        },
      ],
    },
    publish_button: "Submit for review" as const,
  };
}

describe("DealEditor (chunk 22)", () => {
  beforeEach(() => {
    push.mockClear();
    replace.mockClear();
    createOperatorDeal.mockReset();
    getOperatorDeal.mockReset();
    updateOperatorDeal.mockReset();
    publishOperatorDeal.mockReset();
  });

  it("creates a manual_session draft from step 1", async () => {
    createOperatorDeal.mockResolvedValue({
      deal: makeDealFixture({
        id: "new-deal",
        operatorId: DEV_SEED_IDS.harbourKayaks.operatorId,
        dealType: "manual_session",
      }),
    });
    getOperatorDeal.mockResolvedValue(incompleteDetail());

    render(
      <DealEditor operatorId={DEV_SEED_IDS.harbourKayaks.operatorId} />
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Manual session/i })
    );

    await waitFor(() => {
      expect(createOperatorDeal).toHaveBeenCalledWith(
        DEV_SEED_IDS.harbourKayaks.operatorId,
        { deal_type: "manual_session" },
        "test-token"
      );
    });
    expect(replace).toHaveBeenCalledWith(
      "/account/inventory/deals/new-deal"
    );
  });

  it("shows checklist Fix control that jumps to Pricing", async () => {
    getOperatorDeal.mockResolvedValue(incompleteDetail());

    render(
      <DealEditor
        operatorId={DEV_SEED_IDS.harbourKayaks.operatorId}
        dealId="deal-1"
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Minimum discount")).toBeTruthy();
    });

    const fixButtons = screen.getAllByRole("button", { name: "Fix" });
    fireEvent.click(fixButtons[0]);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Pricing" })
      ).toBeTruthy();
    });
  });

  it("disables integrated types when no connection", () => {
    render(
      <DealEditor operatorId={DEV_SEED_IDS.harbourKayaks.operatorId} />
    );
    const integrated = screen.getByRole("button", {
      name: /Integrated session/i,
    });
    expect(integrated).toBeDisabled();
    expect(
      screen.getAllByText(/Connect an integration in Settings/i).length
    ).toBeGreaterThan(0);
  });
});
