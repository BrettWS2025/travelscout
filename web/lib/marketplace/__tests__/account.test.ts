/**
 * Chunk 42 — Account: CSV export, close (end deals + disconnect + suspend).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AccountError,
  closeOperatorAccount,
  exportOperatorData,
  isCloseConfirmValid,
} from "@/lib/marketplace/account";
import {
  createClickEvent,
  upsertDealMetricDaily,
} from "@/lib/marketplace/deal-audit";
import { createDealDraftStore } from "@/lib/marketplace/deal-draft";
import {
  connectIntegration,
  resetIntegrationSecretsBootstrap,
} from "@/lib/marketplace/integration-connect";
import {
  logDealEvent,
  makeDealFixture,
  seedDeal,
} from "@/lib/marketplace/deal-status";
import { can, permissionUserFromStore } from "@/lib/marketplace/permissions";
import { resetSecretsConfig } from "@/lib/marketplace/secrets";
import { DEV_SEED_IDS, seedDevMarketplace } from "@/lib/marketplace/seed-dev";
import { seedBillingAccounts } from "@/lib/marketplace/billing";
import {
  createMockAdapter,
  registerAdapterFactory,
  resetAdapterRegistry,
} from "@/lib/marketplace/providers";

const NOW = "2026-10-21T12:00:00.000Z";
const LATER = "2026-10-21T13:00:00.000Z";

function freshStore() {
  const seeded = seedDevMarketplace({ now: NOW });
  const store = createDealDraftStore(seeded.store);
  store.integrations = new Map(seeded.integrations.map((i) => [i.id, i]));
  seedBillingAccounts(store, seeded.billingAccounts);
  return {
    store,
    harbourId: DEV_SEED_IDS.harbourKayaks.operatorId,
    harbourOwnerId: DEV_SEED_IDS.harbourKayaks.ownerUserId,
    harbourManagerId: DEV_SEED_IDS.harbourKayaks.managerUserId,
    bayId: DEV_SEED_IDS.bayCruises.operatorId,
    bayOwnerId: DEV_SEED_IDS.bayCruises.ownerUserId,
  };
}

beforeEach(() => {
  resetIntegrationSecretsBootstrap();
  resetAdapterRegistry();
  const mock = createMockAdapter({ now: new Date(NOW) });
  registerAdapterFactory("rezdy", () => mock.adapter);
});

afterEach(() => {
  resetIntegrationSecretsBootstrap();
  resetAdapterRegistry();
  resetSecretsConfig();
});

describe("Chunk 42 account permissions", () => {
  it("owner has settings.account; manager does not", () => {
    const { store, harbourId, harbourOwnerId, harbourManagerId } = freshStore();
    const members = [...store.operators.teamMembers.values()];
    expect(
      can(
        permissionUserFromStore(harbourOwnerId, members),
        harbourId,
        "settings.account"
      )
    ).toBe(true);
    expect(
      can(
        permissionUserFromStore(harbourManagerId, members),
        harbourId,
        "settings.account"
      )
    ).toBe(false);
  });
});

describe("Chunk 42 export CSVs", () => {
  it("exports deals, metrics, and events as CSV files", () => {
    const { store, harbourId } = freshStore();
    const deal = seedDeal(
      store,
      makeDealFixture({
        id: "export-deal-1",
        operatorId: harbourId,
        title: "Export Kayak",
        status: "live",
        createdAt: NOW,
      })
    );
    upsertDealMetricDaily(
      store.audit,
      {
        dealId: deal.id,
        date: "2026-10-20",
        impressions: 4,
        detailViews: 2,
        bookingClicks: 1,
        soldOutOnClick: 0,
        attributedBookings: 0,
        attributedRevenueMinor: 0,
      },
      { now: NOW }
    );
    logDealEvent(
      store.audit,
      deal.id,
      "published",
      { type: "user", id: DEV_SEED_IDS.harbourKayaks.ownerUserId },
      { from_status: "draft", to_status: "live" },
      { now: NOW }
    );
    createClickEvent(
      store.audit,
      {
        dealId: deal.id,
        dealSessionId: null,
        clickId: "export-clk-1",
        visitorId: "v1",
        recheckResult: "available",
        redirectUrl: null,
      },
      { now: NOW }
    );

    const result = exportOperatorData(store, harbourId, { now: NOW });
    expect(result.deal_count).toBe(1);
    expect(result.files.map((f) => f.filename)).toEqual([
      "deals.csv",
      "deal_metric_daily.csv",
      "deal_events.csv",
    ]);

    const dealsCsv = result.files[0]!.content;
    expect(dealsCsv).toContain("id,title,slug");
    expect(dealsCsv).toContain("Export Kayak");
    expect(dealsCsv).toContain("export-deal-1");

    const metricsCsv = result.files[1]!.content;
    expect(metricsCsv).toContain("attributed_bookings");
    expect(metricsCsv).toContain("2026-10-20");

    const eventsCsv = result.files[2]!.content;
    expect(eventsCsv).toContain("published");
    expect(eventsCsv).toContain("export-deal-1");
  });
});

describe("Chunk 42 close account", () => {
  it("requires confirm_text matching trading name", async () => {
    const { store, harbourId, harbourOwnerId } = freshStore();
    await expect(
      closeOperatorAccount(store, harbourId, {
        confirmText: "wrong",
        actor: { type: "user", id: harbourOwnerId },
        now: LATER,
      })
    ).rejects.toMatchObject({ code: "confirm_required", status: 400 });

    expect(isCloseConfirmValid("Harbour Kayaks", "Harbour Kayaks")).toBe(true);
    expect(isCloseConfirmValid("Harbour Kayaks", " harbour kayaks ")).toBe(
      false
    );
  });

  it("ends live/scheduled deals, disconnects integrations, suspends account", async () => {
    const { store, bayId, bayOwnerId } = freshStore();

    const connected = await connectIntegration(
      store,
      bayId,
      "rezdy",
      { api_key: "bay-key-close" },
      { actor: { type: "user", id: bayOwnerId }, now: NOW }
    );
    const integrationId = connected.integration.id;

    seedDeal(
      store,
      makeDealFixture({
        id: "bay-live-1",
        operatorId: bayId,
        title: "Bay Live",
        status: "live",
        integrationId,
        sourceProvider: "rezdy",
        dealType: "integrated_session",
        createdAt: NOW,
      })
    );
    seedDeal(
      store,
      makeDealFixture({
        id: "bay-sched-1",
        operatorId: bayId,
        title: "Bay Sched",
        status: "scheduled",
        integrationId,
        sourceProvider: "rezdy",
        dealType: "integrated_session",
        createdAt: NOW,
      })
    );
    seedDeal(
      store,
      makeDealFixture({
        id: "bay-draft-1",
        operatorId: bayId,
        title: "Bay Draft",
        status: "draft",
        integrationId,
        sourceProvider: "rezdy",
        dealType: "integrated_session",
        createdAt: NOW,
      })
    );

    const op = store.operators.operators.get(bayId)!;
    const result = await closeOperatorAccount(store, bayId, {
      confirmText: op.tradingName,
      actor: { type: "user", id: bayOwnerId },
      now: LATER,
    });

    expect(result.account_status).toBe("suspended");
    expect(result.ended_deal_ids.sort()).toEqual(
      ["bay-live-1", "bay-sched-1"].sort()
    );
    expect(result.disconnected_providers).toEqual(["rezdy"]);

    expect(store.deals.get("bay-live-1")?.status).toBe("ended");
    expect(store.deals.get("bay-sched-1")?.status).toBe("ended");
    expect(store.deals.get("bay-draft-1")?.status).toBe("draft");

    expect(store.operators.operators.get(bayId)?.accountStatus).toBe(
      "suspended"
    );
    expect(store.integrations!.get(integrationId)?.status).toBe("disconnected");
    expect(store.integrations!.get(integrationId)?.credentialsRef).toBeNull();

    await expect(
      closeOperatorAccount(store, bayId, {
        confirmText: op.tradingName,
        actor: { type: "user", id: bayOwnerId },
        now: LATER,
      })
    ).rejects.toMatchObject({ code: "already_closed", status: 409 });
  });

  it("throws AccountError for unknown operator", async () => {
    const { store, harbourOwnerId } = freshStore();
    await expect(
      closeOperatorAccount(store, "missing-op", {
        confirmText: "x",
        actor: { type: "user", id: harbourOwnerId },
      })
    ).rejects.toBeInstanceOf(AccountError);
  });
});
