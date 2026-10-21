/**
 * Chunk 42 — Billing: GET/PATCH, stub invoices, usage, secrets stripped.
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  getOperatorBilling,
  patchBillingEmail,
  paymentMethodSummaryFromRef,
  seedBillingAccounts,
  setBillingProviderConfigured,
  upsertBillingAccount,
  BillingError,
} from "@/lib/marketplace/billing";
import {
  createClickEvent,
  upsertDealMetricDaily,
} from "@/lib/marketplace/deal-audit";
import { createDealDraftStore } from "@/lib/marketplace/deal-draft";
import { makeDealFixture, seedDeal } from "@/lib/marketplace/deal-status";
import { can, permissionUserFromStore } from "@/lib/marketplace/permissions";
import { DEV_SEED_IDS, seedDevMarketplace } from "@/lib/marketplace/seed-dev";

const NOW = "2026-10-21T12:00:00.000Z";

function freshStore() {
  const seeded = seedDevMarketplace({ now: NOW });
  const store = createDealDraftStore(seeded.store);
  seedBillingAccounts(store, seeded.billingAccounts);
  return {
    store,
    operatorId: DEV_SEED_IDS.harbourKayaks.operatorId,
    ownerId: DEV_SEED_IDS.harbourKayaks.ownerUserId,
    managerId: DEV_SEED_IDS.harbourKayaks.managerUserId,
    staffId: DEV_SEED_IDS.harbourKayaks.staffUserId,
    billingId: DEV_SEED_IDS.harbourKayaks.billingId,
  };
}

afterEach(() => {
  setBillingProviderConfigured(null);
});

describe("Chunk 42 billing permissions", () => {
  it("owner has settings.billing; manager and staff do not", () => {
    const { store, operatorId, ownerId, managerId, staffId } = freshStore();
    const members = [...store.operators.teamMembers.values()];
    expect(
      can(permissionUserFromStore(ownerId, members), operatorId, "settings.billing")
    ).toBe(true);
    expect(
      can(
        permissionUserFromStore(managerId, members),
        operatorId,
        "settings.billing"
      )
    ).toBe(false);
    expect(
      can(permissionUserFromStore(staffId, members), operatorId, "settings.billing")
    ).toBe(false);
  });
});

describe("Chunk 42 get billing", () => {
  it("returns plan, stubbed invoices, and strips payment_method_ref", () => {
    const { store, operatorId, billingId } = freshStore();
    upsertBillingAccount(store, {
      ...store.billingAccounts!.get(billingId)!,
      paymentMethodRef: "pm_test_visa_4242",
    });

    const billing = getOperatorBilling(store, operatorId, { now: NOW });
    expect(billing.plan).toBe("starter");
    expect(billing.billing_model).toBe("subscription");
    expect(billing.billing_email).toBe("billing@harbour-kayaks.dev");
    expect(billing.invoices_stubbed).toBe(true);
    expect(billing.billing_provider.configured).toBe(false);
    expect(billing.billing_provider.message).toMatch(/stub/i);
    expect(billing.invoices.length).toBeGreaterThan(0);
    expect(billing.payment_method).toEqual({
      brand: "Visa",
      last4: "4242",
      exp_month: 12,
      exp_year: 2028,
    });
    expect(JSON.stringify(billing)).not.toMatch(/payment_method_ref|pm_test/);
  });

  it("paymentMethodSummaryFromRef returns null when unset", () => {
    expect(paymentMethodSummaryFromRef(null)).toBeNull();
    expect(paymentMethodSummaryFromRef("")).toBeNull();
  });
});

describe("Chunk 42 patch billing email", () => {
  it("updates billing_email only", () => {
    const { store, operatorId } = freshStore();
    const updated = patchBillingEmail(
      store,
      operatorId,
      { billing_email: "accounts@harbour-kayaks.dev" },
      { now: "2026-10-21T13:00:00.000Z" }
    );
    expect(updated.billing_email).toBe("accounts@harbour-kayaks.dev");
    expect(updated.plan).toBe("starter");
  });

  it("rejects invalid email", () => {
    const { store, operatorId } = freshStore();
    expect(() =>
      patchBillingEmail(store, operatorId, { billing_email: "not-an-email" })
    ).toThrow(BillingError);
  });

  it("allows clearing billing_email with null", () => {
    const { store, operatorId } = freshStore();
    const updated = patchBillingEmail(store, operatorId, {
      billing_email: null,
    });
    expect(updated.billing_email).toBeNull();
  });
});

describe("Chunk 42 usage", () => {
  it("counts booking clicks for per_click model", () => {
    const { store, operatorId, billingId } = freshStore();
    upsertBillingAccount(store, {
      ...store.billingAccounts!.get(billingId)!,
      billingModel: "per_click",
    });

    const deal = seedDeal(
      store,
      makeDealFixture({
        id: "deal-click-1",
        operatorId,
        title: "Click deal",
        status: "live",
        createdAt: NOW,
      })
    );

    createClickEvent(
      store.audit,
      {
        dealId: deal.id,
        dealSessionId: null,
        clickId: "clk-1",
        visitorId: "v1",
        recheckResult: "available",
        redirectUrl: "https://example.com",
      },
      { now: "2026-10-15T10:00:00.000Z" }
    );
    createClickEvent(
      store.audit,
      {
        dealId: deal.id,
        dealSessionId: null,
        clickId: "clk-2",
        visitorId: "v2",
        recheckResult: "available",
        redirectUrl: "https://example.com",
      },
      { now: "2026-09-15T10:00:00.000Z" }
    );

    const billing = getOperatorBilling(store, operatorId, { now: NOW });
    expect(billing.usage.billing_model).toBe("per_click");
    expect(billing.usage.booking_clicks).toBe(1);
    expect(billing.usage.attributed_bookings).toBeNull();
  });

  it("sums attributed bookings for commission model", () => {
    const { store, operatorId, billingId } = freshStore();
    upsertBillingAccount(store, {
      ...store.billingAccounts!.get(billingId)!,
      billingModel: "commission",
      commissionPct: 10,
    });

    const deal = seedDeal(
      store,
      makeDealFixture({
        id: "deal-comm-1",
        operatorId,
        title: "Commission deal",
        status: "live",
        createdAt: NOW,
      })
    );

    upsertDealMetricDaily(
      store.audit,
      {
        dealId: deal.id,
        date: "2026-10-10",
        impressions: 10,
        detailViews: 5,
        bookingClicks: 2,
        soldOutOnClick: 0,
        attributedBookings: 3,
        attributedRevenueMinor: 15000,
      },
      { now: NOW }
    );
    upsertDealMetricDaily(
      store.audit,
      {
        dealId: deal.id,
        date: "2026-09-10",
        impressions: 1,
        detailViews: 1,
        bookingClicks: 1,
        soldOutOnClick: 0,
        attributedBookings: 9,
        attributedRevenueMinor: 90000,
      },
      { now: NOW }
    );

    const billing = getOperatorBilling(store, operatorId, { now: NOW });
    expect(billing.usage.attributed_bookings).toBe(3);
    expect(billing.usage.attributed_revenue_minor).toBe(15000);
    expect(billing.commission_pct).toBe(10);
  });
});
