import { describe, it, expect } from "vitest";
import { buildDealRedirectUrl } from "@/lib/marketplace/affiliates";
import type { Deal } from "@/lib/marketplace/types";

const baseDeal: Deal = {
  id: "d1",
  organizationId: "o1",
  title: "Deal",
  departureAt: new Date().toISOString(),
  dealPrice: 100,
  currency: "NZD",
  status: "live",
  bookingProvider: "manual",
  bookingUrl: "https://operator.example/book",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("buildDealRedirectUrl", () => {
  it("adds travelscout attribution for manual bookings", () => {
    const url = buildDealRedirectUrl(baseDeal, "click-1");
    expect(url).toContain("click_id=click-1");
    expect(url).toContain("utm_source=travelscout");
  });

  it("adds FareHarbor asn params", () => {
    const url = buildDealRedirectUrl(
      { ...baseDeal, bookingProvider: "fareharbor", affiliateAsn: "tscout" },
      "click-2"
    );
    expect(url).toContain("asn=tscout");
    expect(url).toContain("asnRef=click-2");
  });

  it("prefers affiliateTrackingUrl when present", () => {
    const url = buildDealRedirectUrl(
      {
        ...baseDeal,
        affiliateTrackingUrl: "https://affiliate.example/track",
      },
      "click-3"
    );
    expect(url.startsWith("https://affiliate.example/track")).toBe(true);
  });
});
