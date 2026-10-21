import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { DealDefaults } from "@/components/settings/profile/DealDefaults";
import { DEV_SEED_IDS } from "@/lib/marketplace/seed-dev";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/account/settings/deal-defaults",
}));

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({
    session: { access_token: "test-token" },
    user: { id: "u1", email: "owner@harbour-kayaks.dev" },
    isLoading: false,
  }),
}));

const listMyOperators = vi.fn();
vi.mock("@/lib/marketplace/operator-deals-client", () => ({
  listMyOperators: (...args: unknown[]) => listMyOperators(...args),
}));

const getBookingDefaultsApi = vi.fn();
vi.mock("@/lib/marketplace/operator-profile-client", () => ({
  OperatorProfileApiError: class OperatorProfileApiError extends Error {
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
  getBookingDefaultsApi: (...args: unknown[]) => getBookingDefaultsApi(...args),
  patchBookingDefaultsApi: vi.fn(),
}));

describe("DealDefaults", () => {
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
    getBookingDefaultsApi.mockResolvedValue({
      defaults: {
        id: "defaults-1",
        operator_id: DEV_SEED_IDS.harbourKayaks.operatorId,
        default_sales_cutoff_minutes: 0,
        default_seat_cap: null,
        default_discount_pct: 50,
        default_discount_mechanism: "manual_price",
        default_booking_destination_type: "operator_website",
        default_booking_url: null,
        default_booking_phone: null,
        default_booking_email: null,
        default_booking_instructions: null,
        default_cancellation_policy_type: "operator_standard",
        default_cancellation_policy_text: null,
        default_attestation_reminder_hours: 2,
        created_at: "2026-10-21T00:00:00.000Z",
        updated_at: "2026-10-21T00:00:00.000Z",
        note: "Changes apply to new deals only",
      },
    });
  });

  it("shows the new-deals-only note and cutoff field", async () => {
    render(<DealDefaults />);
    await waitFor(() => {
      expect(screen.getByLabelText(/sales cutoff/i)).toBeTruthy();
    });
    expect(
      screen.getByText(/changes apply to new deals only/i)
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /save defaults/i })).toBeTruthy();
  });

  it("hides defaults for staff", async () => {
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

    render(<DealDefaults />);
    await waitFor(() => {
      expect(
        screen.getByText(/staff cannot view or edit deal defaults/i)
      ).toBeTruthy();
    });
    expect(getBookingDefaultsApi).not.toHaveBeenCalled();
  });
});
