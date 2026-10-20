import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QuickUpdatePage } from "@/components/inventory/quick-update/QuickUpdatePage";
import type { GetQuickUpdateResponse } from "@/lib/marketplace/quick-update-client";

const getQuickUpdate = vi.fn();
const submitQuickUpdate = vi.fn();

vi.mock("@/lib/marketplace/quick-update-client", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/marketplace/quick-update-client")
  >("@/lib/marketplace/quick-update-client");
  return {
    ...actual,
    getQuickUpdate: (...args: unknown[]) => getQuickUpdate(...args),
    submitQuickUpdate: (...args: unknown[]) => submitQuickUpdate(...args),
  };
});

function samplePayload(
  overrides: Partial<GetQuickUpdateResponse> = {}
): GetQuickUpdateResponse {
  return {
    operator_id: "op-1",
    token_expires_at: "2026-10-20T22:00:00.000Z",
    deals: [
      {
        id: "deal-1",
        title: "Sunset Harbour Paddle",
        status: "live",
        pause_reason: null,
        attestation_expires_at: "2026-10-20T22:00:00.000Z",
        sessions: [
          {
            id: "sess-1",
            start_at: "2026-10-21T01:00:00.000Z",
            end_at: null,
            manual_seats_available: 6,
            seats_displayed: 6,
            status: "live",
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("QuickUpdatePage (chunk 24)", () => {
  beforeEach(() => {
    getQuickUpdate.mockReset();
    submitQuickUpdate.mockReset();
  });

  it("loads deals by token and shows seat steppers", async () => {
    getQuickUpdate.mockResolvedValue(samplePayload());
    render(<QuickUpdatePage token="tok-abc" />);

    expect(screen.getByText(/Checking your/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Sunset Harbour Paddle")).toBeInTheDocument();
    });
    expect(getQuickUpdate).toHaveBeenCalledWith("tok-abc");
    expect(screen.getByRole("spinbutton")).toHaveValue(6);
    expect(
      screen.getByRole("button", { name: "Still available" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sold out" })
    ).toBeInTheDocument();
  });

  it("increments seats via stepper then submits still_available", async () => {
    getQuickUpdate.mockResolvedValue(samplePayload());
    submitQuickUpdate.mockResolvedValue({
      token: {
        id: "t1",
        operator_id: "op-1",
        expires_at: "2026-10-20T22:00:00.000Z",
        used_at: "2026-10-20T12:00:00.000Z",
      },
      results: [{ deal_id: "deal-1", ok: true }],
    });

    render(<QuickUpdatePage token="tok-abc" />);
    await waitFor(() => {
      expect(screen.getByText("Sunset Harbour Paddle")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("button", { name: /Increase seats for/i })
    );
    expect(screen.getByRole("spinbutton")).toHaveValue(7);

    fireEvent.click(screen.getByRole("button", { name: "Still available" }));
    fireEvent.click(
      screen.getByRole("button", { name: /Confirm 1 update/i })
    );

    await waitFor(() => {
      expect(submitQuickUpdate).toHaveBeenCalledWith("tok-abc", [
        {
          deal_id: "deal-1",
          action: "still_available",
          seats_by_session: { "sess-1": 7 },
        },
      ]);
    });

    expect(
      await screen.findByRole("link", { name: /Open inventory/i })
    ).toHaveAttribute(
      "href",
      "/auth/login?returnTo=%2Faccount%2Finventory"
    );
    expect(screen.getByText(/updated/i)).toBeInTheDocument();
  });

  it("submits sold_out without seats_by_session", async () => {
    getQuickUpdate.mockResolvedValue(samplePayload());
    submitQuickUpdate.mockResolvedValue({
      token: {
        id: "t1",
        operator_id: "op-1",
        expires_at: "2026-10-20T22:00:00.000Z",
        used_at: "2026-10-20T12:00:00.000Z",
      },
      results: [{ deal_id: "deal-1", ok: true }],
    });

    render(<QuickUpdatePage token="tok-abc" />);
    await waitFor(() => {
      expect(screen.getByText("Sunset Harbour Paddle")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Sold out" }));
    expect(screen.getByRole("spinbutton")).toHaveValue(0);

    fireEvent.click(
      screen.getByRole("button", { name: /Confirm 1 update/i })
    );

    await waitFor(() => {
      expect(submitQuickUpdate).toHaveBeenCalledWith("tok-abc", [
        {
          deal_id: "deal-1",
          action: "sold_out",
          seats_by_session: undefined,
        },
      ]);
    });
  });

  it("shows expired/used message with login link", async () => {
    const { QuickUpdateApiError } = await import(
      "@/lib/marketplace/quick-update-client"
    );
    getQuickUpdate.mockRejectedValue(
      new QuickUpdateApiError("Quick-update token has already been used", 410)
    );

    render(<QuickUpdatePage token="used-tok" />);

    expect(
      await screen.findByText(/isn't valid/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Quick-update token has already been used/)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Log in to dashboard/i })
    ).toHaveAttribute(
      "href",
      "/auth/login?returnTo=%2Faccount%2Finventory"
    );
  });

  it("shows empty state when no eligible deals", async () => {
    getQuickUpdate.mockResolvedValue(
      samplePayload({ deals: [] })
    );
    render(<QuickUpdatePage token="tok-empty" />);

    expect(
      await screen.findByText(/Nothing needs/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Log in to dashboard/i })
    ).toBeInTheDocument();
  });
});
