import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET as getOrgs, POST as postOrg } from "../organizations/route";
import { GET as getDeals, POST as postDeal } from "../deals/route";
import { GET as getDeal, PATCH as patchDeal, DELETE as deleteDeal } from "../deals/[id]/route";
import { GET as clickDeal } from "../deals/[id]/click/route";

const mockGetMarketplaceAuth = vi.fn();
vi.mock("@/lib/marketplace/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/marketplace/auth")>(
    "@/lib/marketplace/auth"
  );
  return {
    ...actual,
    getMarketplaceAuth: (...args: unknown[]) => mockGetMarketplaceAuth(...args),
  };
});

const mockListMyOrganizations = vi.fn();
const mockCreateOrganization = vi.fn();
const mockListLiveDeals = vi.fn();
const mockListOrganizationDeals = vi.fn();
const mockCreateDeal = vi.fn();
const mockGetDeal = vi.fn();
const mockUpdateDeal = vi.fn();
const mockDeleteDeal = vi.fn();
const mockGetOrganization = vi.fn();
const mockRecordDealClick = vi.fn();

vi.mock("@/lib/marketplace/db", () => ({
  listMyOrganizations: (...args: unknown[]) => mockListMyOrganizations(...args),
  createOrganization: (...args: unknown[]) => mockCreateOrganization(...args),
  listLiveDeals: (...args: unknown[]) => mockListLiveDeals(...args),
  listOrganizationDeals: (...args: unknown[]) => mockListOrganizationDeals(...args),
  createDeal: (...args: unknown[]) => mockCreateDeal(...args),
  getDeal: (...args: unknown[]) => mockGetDeal(...args),
  updateDeal: (...args: unknown[]) => mockUpdateDeal(...args),
  deleteDeal: (...args: unknown[]) => mockDeleteDeal(...args),
  getOrganization: (...args: unknown[]) => mockGetOrganization(...args),
  recordDealClick: (...args: unknown[]) => mockRecordDealClick(...args),
  extractAccessToken: () => undefined,
}));

describe("marketplace APIs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("organizations", () => {
    it("GET requires auth", async () => {
      mockGetMarketplaceAuth.mockResolvedValue({ user: null });
      const res = await getOrgs(new Request("http://localhost/api/marketplace/organizations"));
      expect(res.status).toBe(401);
    });

    it("GET lists orgs for user", async () => {
      mockGetMarketplaceAuth.mockResolvedValue({
        user: { id: "u1" },
        accessToken: "tok",
      });
      mockListMyOrganizations.mockResolvedValue([{ id: "o1", name: "Jetboat Co" }]);
      const res = await getOrgs(new Request("http://localhost/api/marketplace/organizations"));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.organizations).toHaveLength(1);
    });

    it("POST creates org", async () => {
      mockGetMarketplaceAuth.mockResolvedValue({
        user: { id: "u1" },
        accessToken: "tok",
      });
      mockCreateOrganization.mockResolvedValue({ id: "o1", name: "Jetboat Co" });
      const res = await postOrg(
        new Request("http://localhost/api/marketplace/organizations", {
          method: "POST",
          body: JSON.stringify({ name: "Jetboat Co", region: "Queenstown" }),
        })
      );
      expect(res.status).toBe(201);
      expect(mockCreateOrganization).toHaveBeenCalled();
    });
  });

  describe("deals", () => {
    it("GET without org id returns live feed", async () => {
      mockListLiveDeals.mockResolvedValue([{ id: "d1", status: "live" }]);
      const res = await getDeals(new Request("http://localhost/api/marketplace/deals"));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.deals[0].id).toBe("d1");
    });

    it("POST requires bookingUrl when publishing live", async () => {
      mockGetMarketplaceAuth.mockResolvedValue({
        user: { id: "u1" },
        accessToken: "tok",
      });
      const res = await postDeal(
        new Request("http://localhost/api/marketplace/deals", {
          method: "POST",
          body: JSON.stringify({
            organizationId: "o1",
            title: "Half-price jetboat",
            departureAt: new Date(Date.now() + 3600_000).toISOString(),
            dealPrice: 99,
            status: "live",
          }),
        })
      );
      expect(res.status).toBe(400);
    });

    it("PATCH updates deal", async () => {
      mockGetMarketplaceAuth.mockResolvedValue({
        user: { id: "u1" },
        accessToken: "tok",
      });
      mockUpdateDeal.mockResolvedValue({ id: "d1", status: "live" });
      const res = await patchDeal(
        new Request("http://localhost/api/marketplace/deals/d1", {
          method: "PATCH",
          body: JSON.stringify({ status: "live", bookingUrl: "https://book.example" }),
        }),
        { params: { id: "d1" } }
      );
      expect(res.status).toBe(200);
    });

    it("DELETE removes deal", async () => {
      mockGetMarketplaceAuth.mockResolvedValue({
        user: { id: "u1" },
        accessToken: "tok",
      });
      mockDeleteDeal.mockResolvedValue(undefined);
      const res = await deleteDeal(
        new Request("http://localhost/api/marketplace/deals/d1", { method: "DELETE" }),
        { params: { id: "d1" } }
      );
      expect(res.status).toBe(200);
    });

    it("GET deal by id", async () => {
      mockGetMarketplaceAuth.mockResolvedValue({ user: null });
      mockGetDeal.mockResolvedValue({ id: "d1", status: "live", title: "Deal" });
      const res = await getDeal(new Request("http://localhost/api/marketplace/deals/d1"), {
        params: { id: "d1" },
      });
      expect(res.status).toBe(200);
    });
  });

  describe("click redirect", () => {
    it("redirects live deals and records click", async () => {
      mockGetMarketplaceAuth.mockResolvedValue({ user: null });
      mockGetDeal.mockResolvedValue({
        id: "d1",
        status: "live",
        organizationId: "o1",
        bookingProvider: "manual",
        bookingUrl: "https://operator.example/book",
        dealPrice: 50,
        currency: "NZD",
        title: "Deal",
        departureAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      mockGetOrganization.mockResolvedValue({ id: "o1", name: "Op" });
      mockRecordDealClick.mockResolvedValue({ clickId: "c1" });

      const res = await clickDeal(
        new Request("http://localhost/api/marketplace/deals/d1/click"),
        { params: { id: "d1" } }
      );

      expect(res.status).toBe(302);
      const location = res.headers.get("location") || "";
      expect(location.startsWith("https://operator.example/book")).toBe(true);
      expect(location).toContain("click_id=");
      expect(mockRecordDealClick).toHaveBeenCalled();
    });

    it("404s for non-live deals", async () => {
      mockGetMarketplaceAuth.mockResolvedValue({ user: null });
      mockGetDeal.mockResolvedValue({ id: "d1", status: "draft" });
      const res = await clickDeal(
        new Request("http://localhost/api/marketplace/deals/d1/click"),
        { params: { id: "d1" } }
      );
      expect(res.status).toBe(404);
    });
  });
});
