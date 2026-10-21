import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NotificationsSettings } from "@/components/settings/notifications/NotificationsSettings";
import { DEV_SEED_IDS } from "@/lib/marketplace/seed-dev";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/account/settings/notifications",
}));

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({
    session: { access_token: "test-token" },
    user: {
      id: DEV_SEED_IDS.harbourKayaks.ownerUserId,
      email: "owner@harbour-kayaks.dev",
    },
    isLoading: false,
  }),
}));

const listMyOperators = vi.fn();
vi.mock("@/lib/marketplace/operator-deals-client", () => ({
  listMyOperators: (...args: unknown[]) => listMyOperators(...args),
}));

const getMyNotificationPreferencesApi = vi.fn();
vi.mock("@/lib/marketplace/notifications-client", () => ({
  NotificationsApiError: class NotificationsApiError extends Error {
    status: number;
    errors: Array<{ field: string; message: string }>;
    constructor(
      message: string,
      status = 400,
      errors: Array<{ field: string; message: string }> = []
    ) {
      super(message);
      this.status = status;
      this.errors = errors;
    }
  },
  getMyNotificationPreferencesApi: (...args: unknown[]) =>
    getMyNotificationPreferencesApi(...args),
  patchMyNotificationPreferenceApi: vi.fn(),
}));

describe("NotificationsSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listMyOperators.mockResolvedValue({
      operators: [
        {
          id: DEV_SEED_IDS.harbourKayaks.operatorId,
          tradingName: "Harbour Kayaks",
          slug: "harbour-kayaks",
          role: "owner",
          timezone: "Pacific/Auckland",
          currency: "NZD",
        },
      ],
    });
    getMyNotificationPreferencesApi.mockResolvedValue({
      preferences: [
        {
          id: "p1",
          user_id: DEV_SEED_IDS.harbourKayaks.ownerUserId,
          operator_id: DEV_SEED_IDS.harbourKayaks.operatorId,
          event_type: "deal_auto_paused",
          email: true,
          sms: false,
          in_app: true,
          mandatory: true,
          label: "Deal auto-paused",
          description: "When the platform auto-pauses a deal.",
          created_at: "2026-10-21T00:00:00.000Z",
          updated_at: "2026-10-21T00:00:00.000Z",
        },
        {
          id: "p2",
          user_id: DEV_SEED_IDS.harbourKayaks.ownerUserId,
          operator_id: DEV_SEED_IDS.harbourKayaks.operatorId,
          event_type: "deal_lifecycle",
          email: false,
          sms: false,
          in_app: true,
          mandatory: false,
          label: "Deal lifecycle",
          description: "When a deal goes live, sells out, or expires.",
          created_at: "2026-10-21T00:00:00.000Z",
          updated_at: "2026-10-21T00:00:00.000Z",
        },
      ],
    });
  });

  it("renders the event × channel grid", async () => {
    render(<NotificationsSettings />);
    await waitFor(() => {
      expect(screen.getByText("Deal auto-paused")).toBeInTheDocument();
    });
    expect(screen.getByText("Deal lifecycle")).toBeInTheDocument();
    expect(screen.getByText(/Starred events/i)).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Email for Deal auto-paused/i)
    ).toBeInTheDocument();
  });
});
