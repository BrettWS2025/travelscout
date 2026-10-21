import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { BusinessProfile } from "@/components/settings/profile/BusinessProfile";
import { DEV_SEED_IDS } from "@/lib/marketplace/seed-dev";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/account/settings/business-profile",
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

const getOperatorProfileApi = vi.fn();
const getOperatorPreviewApi = vi.fn();
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
  getOperatorProfileApi: (...args: unknown[]) => getOperatorProfileApi(...args),
  getOperatorPreviewApi: (...args: unknown[]) => getOperatorPreviewApi(...args),
  patchOperatorProfileApi: vi.fn(),
  uploadOperatorLogoApi: vi.fn(),
  uploadOperatorCoverApi: vi.fn(),
}));

describe("BusinessProfile", () => {
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
    getOperatorProfileApi.mockResolvedValue({
      read_only: false,
      operator: {
        id: DEV_SEED_IDS.harbourKayaks.operatorId,
        legal_name: "Harbour Kayaks Limited",
        trading_name: "Harbour Kayaks",
        slug: "harbour-kayaks",
        logo: null,
        cover_image: null,
        short_description: "Kayak tours",
        long_description: null,
        website: "https://harbour.example",
        public_email: "hello@harbour.example",
        public_phone: null,
        internal_email: null,
        internal_phone: null,
        address: null,
        regions_served: ["Auckland"],
        timezone: "Pacific/Auckland",
        currency: "NZD",
        languages: ["en"],
        gst_number: null,
        nzbn: null,
        social_links: {},
        account_status: "active",
        requires_manual_review: false,
        created_at: "2026-10-21T00:00:00.000Z",
        updated_at: "2026-10-21T00:00:00.000Z",
      },
    });
  });

  it("loads profile and shows save for owner", async () => {
    render(<BusinessProfile />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("Harbour Kayaks")).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: /save profile/i })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /preview operator page/i })
    ).toBeTruthy();
    expect(getOperatorProfileApi).toHaveBeenCalled();
  });

  it("shows read-only note for staff", async () => {
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
    getOperatorProfileApi.mockResolvedValue({
      read_only: true,
      operator: {
        id: DEV_SEED_IDS.harbourKayaks.operatorId,
        legal_name: "Harbour Kayaks Limited",
        trading_name: "Harbour Kayaks",
        slug: "harbour-kayaks",
        logo: null,
        cover_image: null,
        short_description: null,
        long_description: null,
        website: null,
        public_email: null,
        public_phone: null,
        internal_email: null,
        internal_phone: null,
        address: null,
        regions_served: [],
        timezone: "Pacific/Auckland",
        currency: "NZD",
        languages: [],
        gst_number: null,
        nzbn: null,
        social_links: {},
        account_status: "active",
        requires_manual_review: false,
        created_at: "2026-10-21T00:00:00.000Z",
        updated_at: "2026-10-21T00:00:00.000Z",
      },
    });

    render(<BusinessProfile />);
    await waitFor(() => {
      expect(
        screen.getByText(/business profile is read-only for staff/i)
      ).toBeTruthy();
    });
    expect(screen.queryByRole("button", { name: /save profile/i })).toBeNull();
  });
});
