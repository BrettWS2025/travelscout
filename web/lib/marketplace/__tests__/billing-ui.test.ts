import { describe, expect, it } from "vitest";
import {
  canManageBilling,
  formatMoneyMinor,
  formatPaymentMethod,
  usageSummaryText,
} from "@/lib/marketplace/billing-ui";

describe("billing-ui", () => {
  it("canManageBilling is owner only", () => {
    expect(canManageBilling("owner")).toBe(true);
    expect(canManageBilling("manager")).toBe(false);
    expect(canManageBilling("staff")).toBe(false);
  });

  it("formats money and payment method", () => {
    expect(formatMoneyMinor(1999, "NZD")).toMatch(/19\.99/);
    expect(formatPaymentMethod(null)).toMatch(/No payment method/);
    expect(
      formatPaymentMethod({
        brand: "Visa",
        last4: "4242",
        exp_month: 12,
        exp_year: 2028,
      })
    ).toContain("4242");
  });

  it("usageSummaryText covers models", () => {
    expect(
      usageSummaryText(
        {
          billing_model: "per_click",
          booking_clicks: 4,
          attributed_bookings: null,
          attributed_revenue_minor: null,
          period: { label: "2026-10" },
        },
        "NZD"
      )
    ).toContain("4 booking clicks");
    expect(
      usageSummaryText(
        {
          billing_model: "commission",
          booking_clicks: null,
          attributed_bookings: 2,
          attributed_revenue_minor: 5000,
          period: { label: "2026-10" },
        },
        "NZD"
      )
    ).toContain("2 attributed bookings");
    expect(
      usageSummaryText(
        {
          billing_model: "subscription",
          booking_clicks: null,
          attributed_bookings: null,
          attributed_revenue_minor: null,
          period: { label: "2026-10" },
        },
        "NZD"
      )
    ).toMatch(/Subscription/);
  });
});
