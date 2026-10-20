import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DealsList } from "@/components/inventory/deals-list/DealsList";
import { DEV_SEED_IDS } from "@/lib/marketplace/seed-dev";
import type { DealListRow, ListOperatorDealsResult } from "@/lib/marketplace/deal-list";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => "/account/inventory",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({
    session: { access_token: "test-token" },
    user: { id: "u1", email: "manager@harbour-kayaks.dev" },
    isLoading: false,
  }),
}));

const listMyOperators = vi.fn();
const listOperatorDealsApi = vi.fn();
const getOperatorDealsCalendarApi = vi.fn();
const pauseOperatorDealApi = vi.fn();
const resumeOperatorDealApi = vi.fn();
const endOperatorDealApi = vi.fn();
const markOperatorDealSoldOutApi = vi.fn();
const bulkOperatorDealsApi = vi.fn();
const duplicateOperatorDeal = vi.fn();

vi.mock("@/lib/marketplace/operator-deals-client", () => ({
  OperatorDealsApiError: class OperatorDealsApiError extends Error {
    status: number;
    constructor(message: string, status = 400) {
      super(message);
      this.status = status;
    }
  },
  listMyOperators: (...args: unknown[]) => listMyOperators(...args),
  listOperatorDealsApi: (...args: unknown[]) => listOperatorDealsApi(...args),
  getOperatorDealsCalendarApi: (...args: unknown[]) =>
    getOperatorDealsCalendarApi(...args),
  pauseOperatorDealApi: (...args: unknown[]) => pauseOperatorDealApi(...args),
  resumeOperatorDealApi: (...args: unknown[]) => resumeOperatorDealApi(...args),
  endOperatorDealApi: (...args: unknown[]) => endOperatorDealApi(...args),
  markOperatorDealSoldOutApi: (...args: unknown[]) =>
    markOperatorDealSoldOutApi(...args),
  bulkOperatorDealsApi: (...args: unknown[]) => bulkOperatorDealsApi(...args),
  duplicateOperatorDeal: (...args: unknown[]) => duplicateOperatorDeal(...args),
  getOperatorDeal: vi.fn(),
  updateOperatorDealSeatsApi: vi.fn(),
}));

function liveRow(overrides: Partial<DealListRow> = {}): DealListRow {
  return {
    id: "deal-live-1",
    cover_thumbnail_url: null,
    title: "Sunset Harbour Paddle",
    deal_type: "manual_session",
    source_provider: "manual",
    from_rule: false,
    next_session_start_at: "2026-10-21T01:00:00.000Z",
    next_session_start_local: "2026-10-21 14:00",
    original_price_minor: 20000,
    deal_price_minor: 9000,
    discount_pct: 55,
    seats_displayed: 6,
    cutoff_at: "2026-10-21T00:00:00.000Z",
    status: "live",
    pause_reason: null,
    pause_detail: null,
    clicks_today: 2,
    allowed_actions: [
      "edit",
      "duplicate",
      "pause",
      "end",
      "preview",
      "view_stats",
      "save_as_template",
      "update_seats",
      "mark_sold_out",
    ],
    ...overrides,
  };
}

function listResult(
  deals: DealListRow[],
  extras: Partial<ListOperatorDealsResult> = {}
): ListOperatorDealsResult {
  return {
    deals,
    tab_counts: {
      live: deals.filter((d) => d.status === "live").length,
      scheduled: 0,
      needs_attention: 0,
      paused: deals.filter((d) => d.status === "paused").length,
      drafts: 0,
      sold_out: 0,
      past: 0,
    },
    banners: [],
    has_any_deals: true,
    has_integration: false,
    page: 1,
    page_size: 20,
    total: deals.length,
    tab: "live",
    ...extras,
  };
}

describe("DealsList (chunk 23)", () => {
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
    listOperatorDealsApi.mockResolvedValue(listResult([liveRow()]));
    getOperatorDealsCalendarApi.mockResolvedValue({
      from: "2026-10-20",
      timezone: "Pacific/Auckland",
      days: [
        { date: "2026-10-20", sessions: [] },
        { date: "2026-10-21", sessions: [] },
        { date: "2026-10-22", sessions: [] },
      ],
    });
    pauseOperatorDealApi.mockResolvedValue({
      deal: { id: "deal-live-1", status: "paused" },
    });
  });

  it("loads tabs with counts and shows row actions from the API", async () => {
    render(<DealsList />);

    await waitFor(() => {
      expect(screen.getByText("Sunset Harbour Paddle")).toBeTruthy();
    });

    expect(screen.getByText(/Live/)).toBeTruthy();
    expect(screen.getByText("Pause")).toBeTruthy();
    expect(screen.getByText("Update seats")).toBeTruthy();
    expect(screen.getByText("Create deal")).toBeTruthy();
    expect(listOperatorDealsApi).toHaveBeenCalled();
  });

  it("pauses a deal and reloads the list", async () => {
    listOperatorDealsApi
      .mockResolvedValueOnce(listResult([liveRow()]))
      .mockResolvedValueOnce(
        listResult(
          [
            liveRow({
              status: "paused",
              pause_reason: "operator",
              allowed_actions: [
                "edit",
                "duplicate",
                "resume",
                "end",
                "preview",
                "view_stats",
                "save_as_template",
                "update_seats",
                "mark_sold_out",
              ],
            }),
          ],
          {
            tab_counts: {
              live: 0,
              scheduled: 0,
              needs_attention: 0,
              paused: 1,
              drafts: 0,
              sold_out: 0,
              past: 0,
            },
            tab: "live",
            deals: [],
            total: 0,
          }
        )
      );

    render(<DealsList />);
    await waitFor(() => {
      expect(screen.getByText("Sunset Harbour Paddle")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Pause"));

    await waitFor(() => {
      expect(pauseOperatorDealApi).toHaveBeenCalledWith(
        "deal-live-1",
        {},
        "test-token"
      );
    });

    await waitFor(() => {
      expect(listOperatorDealsApi.mock.calls.length).toBeGreaterThan(1);
    });
  });

  it("hides write controls for staff and only shows allowed actions", async () => {
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
    listOperatorDealsApi.mockResolvedValue(
      listResult([
        liveRow({
          allowed_actions: ["preview", "view_stats"],
        }),
      ])
    );

    render(<DealsList />);

    await waitFor(() => {
      expect(screen.getByText("Sunset Harbour Paddle")).toBeTruthy();
    });

    expect(screen.queryByText("Create deal")).toBeNull();
    expect(screen.queryByText("Pause")).toBeNull();
    expect(screen.getByText("Preview")).toBeTruthy();
    expect(screen.getByText("View stats")).toBeTruthy();
    expect(screen.getByText(/read only/i)).toBeTruthy();
  });

  it("requires confirmation before bulk pause", async () => {
    bulkOperatorDealsApi.mockResolvedValue({
      results: [{ id: "deal-live-1", ok: true }],
    });

    render(<DealsList />);
    await waitFor(() => {
      expect(screen.getByText("Sunset Harbour Paddle")).toBeTruthy();
    });

    fireEvent.click(screen.getByLabelText(/Select Sunset Harbour Paddle/i));
    const pauseButtons = screen.getAllByRole("button", { name: /^Pause$/ });
    // Bulk toolbar Pause is rendered above the table row action.
    fireEvent.click(pauseButtons[0]!);

    expect(bulkOperatorDealsApi).not.toHaveBeenCalled();
    expect(screen.getByText(/Confirm pause/i)).toBeTruthy();

    fireEvent.click(screen.getByText(/Confirm pause/i));

    await waitFor(() => {
      expect(bulkOperatorDealsApi).toHaveBeenCalledWith(
        DEV_SEED_IDS.harbourKayaks.operatorId,
        {
          action: "pause",
          deal_ids: ["deal-live-1"],
          confirm: true,
        },
        "test-token"
      );
    });
  });
});
