/**
 * Chunk 45 — metrics tracking, hourly rollup, attribution, deal stats.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createDealDraftStore,
  createDraftDeal,
  seedDealSession,
  updateDraftDeal,
} from "@/lib/marketplace/deal-draft";
import {
  attributeBookingsForDeal,
  getDealStats,
  recordDetailView,
  recordImpressions,
  runMetricsRollupJob,
  seedClickEventForMetrics,
} from "@/lib/marketplace/deal-metrics";
import { logDealEvent } from "@/lib/marketplace/deal-status";
import { withSeatsDisplayed } from "@/lib/marketplace/deal-session";
import {
  connectIntegration,
  ensureIntegrationSecretsConfigured,
  resetIntegrationSecretsBootstrap,
} from "@/lib/marketplace/integration-connect";
import {
  resetSyncLocks,
  runSync,
  setProductEnabledForDeals,
} from "@/lib/marketplace/integration-sync";
import {
  createMockAdapter,
  registerAdapterFactory,
  resetAdapterRegistry,
  type MockAdapterController,
} from "@/lib/marketplace/providers";
import { DEV_SEED_IDS, seedDevMarketplace } from "@/lib/marketplace/seed-dev";
import { localDateKey } from "@/lib/marketplace/timezone";

const BASE_NOW = "2026-10-20T12:00:00.000Z";
const ACTOR = {
  type: "user" as const,
  id: DEV_SEED_IDS.harbourKayaks.ownerUserId,
};
const BAY_ACTOR = {
  type: "user" as const,
  id: DEV_SEED_IDS.bayCruises.ownerUserId,
};

describe("deal metrics (Chunk 45)", () => {
  let mock: MockAdapterController;

  beforeEach(() => {
    resetAdapterRegistry();
    resetIntegrationSecretsBootstrap();
    resetSyncLocks();
    ensureIntegrationSecretsConfigured();
    mock = createMockAdapter({ now: new Date(BASE_NOW) });
    registerAdapterFactory("rezdy", () => mock.adapter);
  });

  afterEach(() => {
    resetAdapterRegistry();
    resetIntegrationSecretsBootstrap();
    resetSyncLocks();
  });

  function freshManualStore() {
    const seeded = seedDevMarketplace({ now: BASE_NOW });
    const store = createDealDraftStore(seeded.store);
    return {
      store,
      operatorId: DEV_SEED_IDS.harbourKayaks.operatorId,
    };
  }

  async function freshIntegratedDeal() {
    const seeded = seedDevMarketplace({ now: BASE_NOW });
    const store = createDealDraftStore(seeded.store);
    store.integrations = new Map(
      seeded.integrations.map((i) => [i.id, i])
    );
    store.externalProducts = new Map();
    store.externalSessions = new Map();
    store.syncLogs = new Map();

    const operatorId = DEV_SEED_IDS.bayCruises.operatorId;
    const connected = await connectIntegration(
      store,
      operatorId,
      "rezdy",
      { api_key: "test-key" },
      { actor: BAY_ACTOR, now: BASE_NOW }
    );

    const product = [...store.externalProducts!.values()].find(
      (p) => p.externalId === "prod-harbour-kayak"
    );
    expect(product).toBeTruthy();

    setProductEnabledForDeals(
      store,
      operatorId,
      "rezdy",
      product!.id,
      true,
      { now: BASE_NOW }
    );
    await runSync(store, connected.integration.id, "full", {
      now: BASE_NOW,
    });

    const deal = createDraftDeal(store, {
      operatorId,
      dealType: "integrated_session",
      externalProductId: product!.id,
      actor: BAY_ACTOR,
      now: BASE_NOW,
    });

    updateDraftDeal(
      store,
      deal.id,
      {
        promo_code: "HALFKAKE",
        discount_mechanism: "promo_code",
      },
      { actor: BAY_ACTOR, now: BASE_NOW }
    );

    const integration = store.integrations!.get(connected.integration.id)!;
    store.integrations!.set(integration.id, {
      ...integration,
      conversionTrackingMethod: "promo_code",
      bookingSourceLabel: "TRAVELSCOUT",
    });

    return {
      store,
      dealId: deal.id,
      integrationId: connected.integration.id,
      productExternalId: product!.externalId,
      operatorId,
    };
  }

  it("records batched impressions and detail views", () => {
    const { store, operatorId } = freshManualStore();
    const deal = createDraftDeal(store, {
      operatorId,
      dealType: "manual_session",
      actor: ACTOR,
      now: BASE_NOW,
    });

    const impressions = recordImpressions(
      store,
      {
        items: [
          { deal_id: deal.id, visitor_id: "v1" },
          { slug: deal.slug, visitor_id: "v2" },
          { slug: "missing-deal" },
        ],
      },
      { now: BASE_NOW }
    );
    expect(impressions.recorded).toBe(2);
    expect(impressions.skipped).toBe(1);

    const view = recordDetailView(
      store,
      { slug: deal.slug, visitor_id: "v3" },
      { now: BASE_NOW }
    );
    expect(view.deal_id).toBe(deal.id);
    expect(store.trackingEvents!.size).toBe(3);
  });

  it("rollups impressions, clicks and sold_out into DealMetricDaily idempotently", async () => {
    const { store, operatorId } = freshManualStore();
    const deal = createDraftDeal(store, {
      operatorId,
      dealType: "manual_session",
      actor: ACTOR,
      now: BASE_NOW,
    });
    const operator = store.operators.operators.get(operatorId)!;
    const day = localDateKey(BASE_NOW, operator.timezone);

    recordImpressions(
      store,
      {
        items: [
          { deal_id: deal.id },
          { deal_id: deal.id },
          { deal_id: deal.id },
        ],
      },
      { now: BASE_NOW }
    );
    recordDetailView(store, { deal_id: deal.id }, { now: BASE_NOW });
    recordDetailView(store, { deal_id: deal.id }, { now: BASE_NOW });

    seedClickEventForMetrics(store, {
      dealId: deal.id,
      recheckResult: "available",
      createdAt: BASE_NOW,
    });
    seedClickEventForMetrics(store, {
      dealId: deal.id,
      recheckResult: "sold_out",
      createdAt: BASE_NOW,
    });

    const first = await runMetricsRollupJob(store, {
      now: BASE_NOW,
      from: day,
      to: day,
      dealIds: [deal.id],
    });
    expect(first.daysUpserted).toBe(1);

    const second = await runMetricsRollupJob(store, {
      now: BASE_NOW,
      from: day,
      to: day,
      dealIds: [deal.id],
    });
    expect(second.daysUpserted).toBe(1);

    const metrics = [...store.audit.metrics.values()].filter(
      (m) => m.dealId === deal.id && m.date === day
    );
    expect(metrics).toHaveLength(1);
    expect(metrics[0]!.impressions).toBe(3);
    expect(metrics[0]!.detailViews).toBe(2);
    expect(metrics[0]!.bookingClicks).toBe(2);
    expect(metrics[0]!.soldOutOnClick).toBe(1);
  });

  it("attributes bookings by promo_code via listBookings", async () => {
    const ctx = await freshIntegratedDeal();
    const deal = ctx.store.deals.get(ctx.dealId)!;
    const operator = ctx.store.operators.operators.get(ctx.operatorId)!;
    const day = localDateKey(BASE_NOW, operator.timezone);

    mock.addBooking({
      external_id: "ORD-1",
      product_external_id: ctx.productExternalId,
      booked_at: BASE_NOW,
      total_amount_minor: 5400,
      currency: "NZD",
      promo_code: "HALFKAKE",
      source_channel: null,
      click_id: null,
      status: "CONFIRMED",
    });
    mock.addBooking({
      external_id: "ORD-OTHER",
      product_external_id: ctx.productExternalId,
      booked_at: BASE_NOW,
      total_amount_minor: 9900,
      currency: "NZD",
      promo_code: "OTHER",
      source_channel: null,
      click_id: null,
      status: "CONFIRMED",
    });

    const attributed = await attributeBookingsForDeal(
      ctx.store,
      deal,
      day,
      day
    );
    expect(attributed.get(day)?.attributedBookings).toBe(1);
    expect(attributed.get(day)?.attributedRevenueMinor).toBe(5400);

    await runMetricsRollupJob(ctx.store, {
      now: BASE_NOW,
      from: day,
      to: day,
      dealIds: [ctx.dealId],
    });

    const row = [...ctx.store.audit.metrics.values()].find(
      (m) => m.dealId === ctx.dealId && m.date === day
    );
    expect(row?.attributedBookings).toBe(1);
    expect(row?.attributedRevenueMinor).toBe(5400);
  });

  it("attributes by booking_source label and webhook click_id", async () => {
    const ctx = await freshIntegratedDeal();
    const deal = ctx.store.deals.get(ctx.dealId)!;
    const operator = ctx.store.operators.operators.get(ctx.operatorId)!;
    const day = localDateKey(BASE_NOW, operator.timezone);

    const integration = ctx.store.integrations!.get(ctx.integrationId)!;
    ctx.store.integrations!.set(integration.id, {
      ...integration,
      conversionTrackingMethod: "booking_source",
      bookingSourceLabel: "TRAVELSCOUT",
    });

    mock.clearBookings();
    mock.addBooking({
      external_id: "ORD-SRC",
      product_external_id: ctx.productExternalId,
      booked_at: BASE_NOW,
      total_amount_minor: 4000,
      currency: "NZD",
      promo_code: null,
      source_channel: "TRAVELSCOUT",
      click_id: null,
      status: "CONFIRMED",
    });

    let attributed = await attributeBookingsForDeal(
      ctx.store,
      deal,
      day,
      day
    );
    expect(attributed.get(day)?.attributedBookings).toBe(1);

    ctx.store.integrations!.set(integration.id, {
      ...integration,
      conversionTrackingMethod: "webhook",
      bookingSourceLabel: null,
    });
    const click = seedClickEventForMetrics(ctx.store, {
      dealId: ctx.dealId,
      clickId: "click-abc",
      createdAt: BASE_NOW,
    });
    mock.clearBookings();
    mock.addBooking({
      external_id: "ORD-WH",
      product_external_id: ctx.productExternalId,
      booked_at: BASE_NOW,
      total_amount_minor: 3200,
      currency: "NZD",
      promo_code: null,
      source_channel: null,
      click_id: click.clickId,
      status: "CONFIRMED",
    });

    attributed = await attributeBookingsForDeal(ctx.store, deal, day, day);
    expect(attributed.get(day)?.attributedBookings).toBe(1);
    expect(attributed.get(day)?.attributedRevenueMinor).toBe(3200);
  });

  it("getDealStats returns totals, CTR, series, sessions and activity", async () => {
    const { store, operatorId } = freshManualStore();
    const deal = createDraftDeal(store, {
      operatorId,
      dealType: "manual_session",
      actor: ACTOR,
      now: BASE_NOW,
    });
    updateDraftDeal(
      store,
      deal.id,
      { title: "Harbour sunset kayak tour" },
      { actor: ACTOR, now: BASE_NOW }
    );

    const session = withSeatsDisplayed(
      {
        id: crypto.randomUUID(),
        dealId: deal.id,
        externalSessionId: null,
        startAt: "2026-10-21T01:00:00.000Z",
        endAt: null,
        providerSeatsAvailable: null,
        manualSeatsAvailable: 6,
        seatCap: null,
        seatsDisplayed: 0,
        status: "live" as const,
        lastSyncedAt: null,
        createdAt: BASE_NOW,
        updatedAt: BASE_NOW,
      },
      store.deals.get(deal.id)!
    );
    seedDealSession(store, session);

    logDealEvent(store.audit, deal.id, "updated", ACTOR, {
      fields: ["title"],
    });

    const operator = store.operators.operators.get(operatorId)!;
    const day = localDateKey(BASE_NOW, operator.timezone);

    recordImpressions(
      store,
      { items: [{ deal_id: deal.id }, { deal_id: deal.id }] },
      { now: BASE_NOW }
    );
    recordDetailView(store, { deal_id: deal.id }, { now: BASE_NOW });
    seedClickEventForMetrics(store, {
      dealId: deal.id,
      recheckResult: "available",
      createdAt: BASE_NOW,
    });

    await runMetricsRollupJob(store, {
      now: BASE_NOW,
      from: day,
      to: day,
      dealIds: [deal.id],
    });

    const stats = getDealStats(store, deal.id, { from: day, to: day });
    expect(stats.deal.title).toContain("Harbour");
    expect(stats.totals.impressions).toBe(2);
    expect(stats.totals.detail_views).toBe(1);
    expect(stats.totals.booking_clicks).toBe(1);
    expect(stats.totals.ctr).toBe(1);
    expect(stats.series).toHaveLength(1);
    expect(stats.sessions).toHaveLength(1);
    expect(stats.sessions[0]!.seats_displayed).toBe(6);
    expect(stats.activity.some((a) => a.event_type === "updated")).toBe(true);
  });

  it("leaves attributed metrics at zero when conversion_tracking_method is none", async () => {
    const ctx = await freshIntegratedDeal();
    const integration = ctx.store.integrations!.get(ctx.integrationId)!;
    ctx.store.integrations!.set(integration.id, {
      ...integration,
      conversionTrackingMethod: "none",
    });

    const operator = ctx.store.operators.operators.get(ctx.operatorId)!;
    const day = localDateKey(BASE_NOW, operator.timezone);
    mock.addBooking({
      external_id: "ORD-IGNORED",
      product_external_id: ctx.productExternalId,
      booked_at: BASE_NOW,
      total_amount_minor: 5400,
      currency: "NZD",
      promo_code: "HALFKAKE",
      source_channel: null,
      click_id: null,
      status: "CONFIRMED",
    });

    await runMetricsRollupJob(ctx.store, {
      now: BASE_NOW,
      from: day,
      to: day,
      dealIds: [ctx.dealId],
    });

    const row = [...ctx.store.audit.metrics.values()].find(
      (m) => m.dealId === ctx.dealId && m.date === day
    );
    expect(row?.attributedBookings ?? 0).toBe(0);
  });
});
