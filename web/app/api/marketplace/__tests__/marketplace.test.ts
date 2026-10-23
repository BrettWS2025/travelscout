import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { GET as getOrgs, POST as postOrg } from "../organizations/route";
import { GET as getDeals, POST as postDeal } from "../deals/route";
import { GET as getDeal, PATCH as patchDeal, DELETE as deleteDeal } from "../deals/[id]/route";
import { GET as clickDeal } from "../deals/[id]/click/route";
import {
  PUBLIC_RATE_LIMIT_DEFAULTS,
  resetPublicRateLimits,
} from "@/lib/marketplace/public-rate-limit";

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
const mockTransitionLegacyDealStatus = vi.fn();
const mockStripLegacyDealStatus = vi.fn((input: Record<string, unknown>) => {
  const { status: _status, ...rest } = input;
  return rest;
});

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
  transitionLegacyDealStatus: (...args: unknown[]) =>
    mockTransitionLegacyDealStatus(...args),
  stripLegacyDealStatus: (...args: unknown[]) =>
    mockStripLegacyDealStatus(...(args as [Record<string, unknown>])),
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
          body: JSON.stringify({
            name: "Jetboat Co",
            phone: "+64 21 123 4567",
            website: "https://example.com",
            region: "Otago",
          }),
        })
      );
      expect(res.status).toBe(201);
      expect(mockCreateOrganization).toHaveBeenCalledWith(
        "tok",
        "u1",
        expect.objectContaining({ region: "Otago" })
      );
    });

    it("POST rejects regions outside the nz_places_final list", async () => {
      mockGetMarketplaceAuth.mockResolvedValue({
        user: { id: "u1" },
        accessToken: "tok",
      });
      const res = await postOrg(
        new Request("http://localhost/api/marketplace/organizations", {
          method: "POST",
          body: JSON.stringify({
            name: "Jetboat Co",
            phone: "+64 21 123 4567",
            website: "https://example.com",
            region: "Queenstown",
          }),
        })
      );
      expect(res.status).toBe(400);
      expect(mockCreateOrganization).not.toHaveBeenCalled();
    });

    it("POST requires phone, website, and region", async () => {
      mockGetMarketplaceAuth.mockResolvedValue({
        user: { id: "u1" },
        accessToken: "tok",
      });
      const res = await postOrg(
        new Request("http://localhost/api/marketplace/organizations", {
          method: "POST",
          body: JSON.stringify({ name: "Jetboat Co" }),
        })
      );
      expect(res.status).toBe(400);
      expect(mockCreateOrganization).not.toHaveBeenCalled();
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
      expect(mockCreateDeal).not.toHaveBeenCalled();
      expect(mockTransitionLegacyDealStatus).not.toHaveBeenCalled();
    });

    it("POST creates as draft then transitions status via helper (S14)", async () => {
      mockGetMarketplaceAuth.mockResolvedValue({
        user: { id: "u1" },
        accessToken: "tok",
      });
      mockCreateDeal.mockResolvedValue({ id: "d1", status: "draft" });
      mockTransitionLegacyDealStatus.mockResolvedValue({
        id: "d1",
        status: "live",
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
            bookingUrl: "https://book.example",
          }),
        })
      );
      expect(res.status).toBe(201);
      expect(mockCreateDeal).toHaveBeenCalledWith(
        "tok",
        "u1",
        expect.not.objectContaining({ status: expect.anything() })
      );
      expect(mockTransitionLegacyDealStatus).toHaveBeenCalledWith(
        "tok",
        "d1",
        "live"
      );
      const data = await res.json();
      expect(data.deal.status).toBe("live");
    });

    it("PATCH strips status from updateDeal and routes via transition (S14)", async () => {
      mockGetMarketplaceAuth.mockResolvedValue({
        user: { id: "u1" },
        accessToken: "tok",
      });
      mockUpdateDeal.mockResolvedValue({ id: "d1", status: "draft" });
      mockTransitionLegacyDealStatus.mockResolvedValue({
        id: "d1",
        status: "live",
      });
      const res = await patchDeal(
        new Request("http://localhost/api/marketplace/deals/d1", {
          method: "PATCH",
          body: JSON.stringify({
            status: "live",
            bookingUrl: "https://book.example",
          }),
        }),
        { params: { id: "d1" } }
      );
      expect(res.status).toBe(200);
      expect(mockStripLegacyDealStatus).toHaveBeenCalled();
      expect(mockUpdateDeal).toHaveBeenCalledWith(
        "tok",
        "d1",
        expect.not.objectContaining({ status: expect.anything() })
      );
      expect(mockTransitionLegacyDealStatus).toHaveBeenCalledWith(
        "tok",
        "d1",
        "live"
      );
    });

    it("PATCH without status does not call transition", async () => {
      mockGetMarketplaceAuth.mockResolvedValue({
        user: { id: "u1" },
        accessToken: "tok",
      });
      mockUpdateDeal.mockResolvedValue({ id: "d1", status: "draft", title: "T" });
      const res = await patchDeal(
        new Request("http://localhost/api/marketplace/deals/d1", {
          method: "PATCH",
          body: JSON.stringify({ title: "T" }),
        }),
        { params: { id: "d1" } }
      );
      expect(res.status).toBe(200);
      expect(mockTransitionLegacyDealStatus).not.toHaveBeenCalled();
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
    beforeEach(() => {
      resetPublicRateLimits();
    });

    afterEach(() => {
      resetPublicRateLimits();
    });

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

    it("S16: rate-limits legacy click by IP with 429", async () => {
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

      const max = PUBLIC_RATE_LIMIT_DEFAULTS.dealClick.max;
      const headers = { "x-forwarded-for": "203.0.113.77" };
      for (let i = 0; i < max; i++) {
        const res = await clickDeal(
          new Request("http://localhost/api/marketplace/deals/d1/click", {
            headers,
          }),
          { params: { id: "d1" } }
        );
        expect(res.status).toBe(302);
      }

      const limited = await clickDeal(
        new Request("http://localhost/api/marketplace/deals/d1/click", {
          headers,
        }),
        { params: { id: "d1" } }
      );
      expect(limited.status).toBe(429);
      expect(limited.headers.get("Retry-After")).toBeTruthy();
      await expect(limited.json()).resolves.toMatchObject({
        code: "rate_limited",
      });
    });
  });
});
