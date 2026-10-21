import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TeamSettings } from "@/components/settings/team/TeamSettings";
import { DEV_SEED_IDS } from "@/lib/marketplace/seed-dev";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/account/settings/team",
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

const listTeamApi = vi.fn();
vi.mock("@/lib/marketplace/team-client", () => ({
  TeamApiError: class TeamApiError extends Error {
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
  listTeamApi: (...args: unknown[]) => listTeamApi(...args),
  inviteTeamMemberApi: vi.fn(),
  updateTeamMemberRoleApi: vi.fn(),
  removeTeamMemberApi: vi.fn(),
  resendTeamInviteApi: vi.fn(),
  revokeTeamInviteApi: vi.fn(),
}));

describe("TeamSettings", () => {
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
    listTeamApi.mockResolvedValue({
      members: [
        {
          id: DEV_SEED_IDS.harbourKayaks.ownerMemberId,
          operator_id: DEV_SEED_IDS.harbourKayaks.operatorId,
          user_id: DEV_SEED_IDS.harbourKayaks.ownerUserId,
          role: "owner",
          role_label: "Owner",
          invited_email: "owner@harbour-kayaks.dev",
          invite_status: "accepted",
          invite_status_label: "Accepted",
          invited_at: "2026-10-21T00:00:00.000Z",
          last_active_at: "2026-10-21T00:00:00.000Z",
          created_at: "2026-10-21T00:00:00.000Z",
          updated_at: "2026-10-21T00:00:00.000Z",
        },
        {
          id: DEV_SEED_IDS.harbourKayaks.staffMemberId,
          operator_id: DEV_SEED_IDS.harbourKayaks.operatorId,
          user_id: DEV_SEED_IDS.harbourKayaks.staffUserId,
          role: "staff",
          role_label: "Staff",
          invited_email: "staff@harbour-kayaks.dev",
          invite_status: "accepted",
          invite_status_label: "Accepted",
          invited_at: "2026-10-21T00:00:00.000Z",
          last_active_at: null,
          created_at: "2026-10-21T00:00:00.000Z",
          updated_at: "2026-10-21T00:00:00.000Z",
        },
      ],
    });
  });

  it("renders team members and invite form for owner", async () => {
    render(<TeamSettings />);
    await waitFor(() => {
      expect(screen.getByText("owner@harbour-kayaks.dev")).toBeTruthy();
    });
    expect(screen.getByText("staff@harbour-kayaks.dev")).toBeTruthy();
    expect(screen.getByRole("button", { name: /send invite/i })).toBeTruthy();
    expect(screen.getByLabelText(/email/i)).toBeTruthy();
  });
});
