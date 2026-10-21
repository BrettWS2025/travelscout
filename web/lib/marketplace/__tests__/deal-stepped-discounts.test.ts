/**
 * Chunk 43 — stepped discounts: currentPrice, CRUD, ticker activation, Book now promo.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listDealEvents } from "@/lib/marketplace/deal-audit";
import {
  createDealDraftStore,
  createDraftDeal,
  seedDealDiscountStep,
  seedDealPriceOption,
  seedDealSession,
  updateDraftDeal,
} from "@/lib/marketplace/deal-draft";
import {
  listOperatorDeals,
  permissionUserForList,
} from "@/lib/marketplace/deal-list";
import {
  withDiscountPct,
  type DealPriceOption,
} from "@/lib/marketplace/deal-session";
import {
  applyCurrentDiscountSteps,
  bookingPromoForSession,
  createDiscountStep,
  currentPrice,
  deleteDiscountStep,
  hoursUntilSessionStart,
  updateDiscountStep,
} from "@/lib/marketplace/deal-stepped-discounts";
import { makeDealFixture } from "@/lib/marketplace/deal-status";
import { tickDealStatus } from "@/lib/marketplace/deal-status-ticker";
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
} from "@/lib/marketplace/providers";
import { DEV_SEED_IDS, seedDevMarketplace } from "@/lib/marketplace/seed-dev";

const BASE_NOW = "2026-10-20T12:00:00.000Z";
const ACTOR = {
  type: "user" as const,
  id: DEV_SEED_IDS.harbourKayaks.ownerUserId,
};

function hoursFromNow(hours: number, now = BASE_NOW): string {
  return new Date(Date.parse(now) + hours * 3_600_000).toISOString();
}

function freshManualStore() {
  const seeded = seedDevMarketplace({ now: BASE_NOW });
  const store = createDealDraftStore(seeded.store);
  return {
    store,
    operatorId: DEV_SEED_IDS.harbourKayaks.operatorId,
  };
}

function makeOption(
  dealId: string,
  overrides: Partial<DealPriceOption> = {}
): DealPriceOption {
  const base = withDiscountPct({
    originalPriceMinor: 10_000,
    dealPriceMinor: 5_000,
  });
  return {
    id: overrides.id ?? crypto.randomUUID(),
    dealId,
    label: "Adult",
    type: "adult",
    externalPriceOptionId: null,
    externalDealPriceOptionId: null,
    originalPriceMinor: base.originalPriceMinor,
    originalPriceSource: "operator_entered",
    originalPriceEvidenceUrl: "https://example.com/prices",
    dealPriceMinor: base.dealPriceMinor,
    discountPct: base.discountPct,
    sortOrder: 0,
    createdAt: BASE_NOW,
    updatedAt: BASE_NOW,
    ...overrides,
  };
}

describe("currentPrice / hoursUntilSessionStart", () => {
  const option = makeOption("d1", { id: "opt1" });
  const steps = [
    {
      id: "s72",
      dealId: "d1",
      priceOptionId: "opt1",
      hoursBeforeStart: 72,
      dealPriceMinor: 5_000,
      promoCode: "EARLY50",
      externalDealPriceOptionId: null,
      createdAt: BASE_NOW,
      updatedAt: BASE_NOW,
    },
    {
      id: "s24",
      dealId: "d1",
      priceOptionId: "opt1",
      hoursBeforeStart: 24,
      dealPriceMinor: 4_000,
      promoCode: "MID60",
      externalDealPriceOptionId: null,
      createdAt: BASE_NOW,
      updatedAt: BASE_NOW,
    },
    {
      id: "s6",
      dealId: "d1",
      priceOptionId: "opt1",
      hoursBeforeStart: 6,
      dealPriceMinor: 3_000,
      promoCode: "LATE70",
      externalDealPriceOptionId: null,
      createdAt: BASE_NOW,
      updatedAt: BASE_NOW,
    },
  ];

  it("at 30h → 50% / EARLY50; at 20h → 60% / MID60; at 5h → 70% / LATE70", () => {
    const session30 = { startAt: hoursFromNow(30) };
    const at30 = currentPrice(option, session30, BASE_NOW, steps);
    expect(at30.dealPriceMinor).toBe(5_000);
    expect(at30.promoCode).toBe("EARLY50");
    expect(at30.step?.id).toBe("s72");
    expect(hoursUntilSessionStart(session30.startAt, BASE_NOW)).toBeCloseTo(30);

    const session20 = { startAt: hoursFromNow(20) };
    const at20 = currentPrice(option, session20, BASE_NOW, steps);
    expect(at20.dealPriceMinor).toBe(4_000);
    expect(at20.promoCode).toBe("MID60");
    expect(at20.step?.id).toBe("s24");

    const session5 = { startAt: hoursFromNow(5) };
    const at5 = currentPrice(option, session5, BASE_NOW, steps);
    expect(at5.dealPriceMinor).toBe(3_000);
    expect(at5.promoCode).toBe("LATE70");
    expect(at5.step?.id).toBe("s6");
  });

  it("falls back to base deal price when outside all step windows", () => {
    const session = { startAt: hoursFromNow(80) };
    const result = currentPrice(option, session, BASE_NOW, steps, "BASECODE");
    expect(result.step).toBeNull();
    expect(result.dealPriceMinor).toBe(5_000);
    expect(result.promoCode).toBe("BASECODE");
  });
});

describe("discount step CRUD", () => {
  it("creates steps when stepped_discount_enabled and rejects invalid deepening", async () => {
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
      {
        stepped_discount_enabled: true,
        discount_mechanism: "quote_code",
        promo_code: "BASE50",
      },
      { actor: ACTOR, now: BASE_NOW }
    );
    const option = seedDealPriceOption(
      store,
      makeOption(deal.id, { id: "opt-a" })
    );

    const step72 = await createDiscountStep(
      store,
      deal.id,
      {
        price_option_id: option.id,
        hours_before_start: 72,
        deal_price_minor: 5_000,
        promo_code: "EARLY50",
      },
      { actor: ACTOR, now: BASE_NOW }
    );
    expect(step72.step.hoursBeforeStart).toBe(72);

    const step24 = await createDiscountStep(
      store,
      deal.id,
      {
        price_option_id: option.id,
        hours_before_start: 24,
        deal_price_minor: 4_000,
        promo_code: "MID60",
      },
      { actor: ACTOR, now: BASE_NOW }
    );
    expect(step24.step.dealPriceMinor).toBe(4_000);

    await expect(
      createDiscountStep(
        store,
        deal.id,
        {
          price_option_id: option.id,
          hours_before_start: 12,
          deal_price_minor: 4_500,
          promo_code: "BAD",
        },
        { actor: ACTOR, now: BASE_NOW }
      )
    ).rejects.toMatchObject({ status: 400 });

    await updateDiscountStep(
      store,
      deal.id,
      step24.step.id,
      { deal_price_minor: 3_500 },
      { actor: ACTOR, now: BASE_NOW }
    );
    expect(store.discountSteps.get(step24.step.id)!.dealPriceMinor).toBe(3_500);

    await deleteDiscountStep(store, deal.id, step72.step.id, {
      actor: ACTOR,
      now: BASE_NOW,
    });
    expect(store.discountSteps.has(step72.step.id)).toBe(false);
  });

  it("requires stepped_discount_enabled before create", async () => {
    const { store, operatorId } = freshManualStore();
    const deal = createDraftDeal(store, {
      operatorId,
      dealType: "manual_session",
      actor: ACTOR,
      now: BASE_NOW,
    });
    const option = seedDealPriceOption(store, makeOption(deal.id));
    await expect(
      createDiscountStep(
        store,
        deal.id,
        {
          price_option_id: option.id,
          hours_before_start: 48,
          deal_price_minor: 4_000,
          promo_code: "X48",
        },
        { actor: ACTOR, now: BASE_NOW }
      )
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("applyCurrentDiscountSteps (ticker)", () => {
  it("logs price_changed when a deeper step activates; idempotent on re-run", async () => {
    const { store, operatorId } = freshManualStore();
    const deal = makeDealFixture({
      id: crypto.randomUUID(),
      operatorId,
      dealType: "manual_session",
      status: "live",
      steppedDiscountEnabled: true,
      discountMechanism: "quote_code",
      promoCode: "BASE50",
      firstPublishedAt: BASE_NOW,
      publishedAt: BASE_NOW,
    });
    store.deals.set(deal.id, deal);
    const option = seedDealPriceOption(
      store,
      makeOption(deal.id, { id: "opt-tick" })
    );
    seedDealDiscountStep(store, {
      id: "step-72",
      dealId: deal.id,
      priceOptionId: option.id,
      hoursBeforeStart: 72,
      dealPriceMinor: 5_000,
      promoCode: "EARLY50",
      externalDealPriceOptionId: null,
      createdAt: BASE_NOW,
      updatedAt: BASE_NOW,
    });
    seedDealDiscountStep(store, {
      id: "step-24",
      dealId: deal.id,
      priceOptionId: option.id,
      hoursBeforeStart: 24,
      dealPriceMinor: 4_000,
      promoCode: "MID60",
      externalDealPriceOptionId: null,
      createdAt: BASE_NOW,
      updatedAt: BASE_NOW,
    });
    seedDealSession(store, {
      id: "sess-1",
      dealId: deal.id,
      externalSessionId: null,
      startAt: hoursFromNow(30),
      endAt: null,
      providerSeatsAvailable: null,
      manualSeatsAvailable: 4,
      seatCap: null,
      seatsDisplayed: 4,
      status: "live",
      lastSyncedAt: null,
      createdAt: BASE_NOW,
      updatedAt: BASE_NOW,
    });

    await applyCurrentDiscountSteps(store, deal.id, BASE_NOW);
    const after30 = listDealEvents(store.audit, deal.id).filter(
      (e) =>
        e.eventType === "price_changed" &&
        (e.detail as { action?: string })?.action === "step_activated"
    );
    expect(after30).toHaveLength(1);
    expect(after30[0]!.detail).toMatchObject({
      discount_step_id: "step-72",
      new_deal_price_minor: 5_000,
      promo_code: "EARLY50",
    });

    // Re-run at same time — no duplicate activation
    await applyCurrentDiscountSteps(store, deal.id, BASE_NOW);
    expect(
      listDealEvents(store.audit, deal.id).filter(
        (e) =>
          e.eventType === "price_changed" &&
          (e.detail as { action?: string })?.action === "step_activated"
      )
    ).toHaveLength(1);

    // Advance so 24h step activates
    const later = hoursFromNow(12); // session now ~18h away
    // Fix session relative to later? Session is BASE+30h; later is BASE+12h → 18h until start
    await applyCurrentDiscountSteps(store, deal.id, later);
    const activations = listDealEvents(store.audit, deal.id).filter(
      (e) =>
        e.eventType === "price_changed" &&
        (e.detail as { action?: string })?.action === "step_activated"
    );
    expect(activations).toHaveLength(2);
    expect(activations[1]!.detail).toMatchObject({
      discount_step_id: "step-24",
      new_deal_price_minor: 4_000,
      promo_code: "MID60",
    });
  });

  it("is invoked from tickDealStatus", async () => {
    const { store, operatorId } = freshManualStore();
    const deal = makeDealFixture({
      id: crypto.randomUUID(),
      operatorId,
      dealType: "manual_session",
      status: "live",
      steppedDiscountEnabled: true,
      discountMechanism: "manual_price",
      firstPublishedAt: BASE_NOW,
      publishedAt: BASE_NOW,
      salesCutoffMinutes: 0,
      lastAttestedAt: BASE_NOW,
      attestationExpiresAt: hoursFromNow(11),
    });
    store.deals.set(deal.id, deal);
    const option = seedDealPriceOption(store, makeOption(deal.id));
    seedDealDiscountStep(store, {
      id: "st1",
      dealId: deal.id,
      priceOptionId: option.id,
      hoursBeforeStart: 72,
      dealPriceMinor: 5_000,
      promoCode: null,
      externalDealPriceOptionId: null,
      createdAt: BASE_NOW,
      updatedAt: BASE_NOW,
    });
    seedDealSession(store, {
      id: "sess-tick",
      dealId: deal.id,
      externalSessionId: null,
      startAt: hoursFromNow(40),
      endAt: null,
      providerSeatsAvailable: null,
      manualSeatsAvailable: 2,
      seatCap: null,
      seatsDisplayed: 2,
      status: "live",
      lastSyncedAt: null,
      createdAt: BASE_NOW,
      updatedAt: BASE_NOW,
    });

    await tickDealStatus(store, deal.id, { now: BASE_NOW });
    expect(store.discountDisplayCache?.get(option.id)?.stepId).toBe("st1");
  });
});

describe("list + book now use currentPrice", () => {
  it("list shows the active step price for the next session", async () => {
    const { store, operatorId } = freshManualStore();
    const deal = makeDealFixture({
      id: crypto.randomUUID(),
      operatorId,
      dealType: "manual_session",
      status: "live",
      title: "Stepped Kayak Deal XX",
      steppedDiscountEnabled: true,
      discountMechanism: "quote_code",
      promoCode: "BASE50",
      firstPublishedAt: BASE_NOW,
      publishedAt: BASE_NOW,
      lastAttestedAt: BASE_NOW,
      attestationExpiresAt: hoursFromNow(11),
    });
    store.deals.set(deal.id, deal);
    const option = seedDealPriceOption(store, makeOption(deal.id));
    seedDealDiscountStep(store, {
      id: "ls24",
      dealId: deal.id,
      priceOptionId: option.id,
      hoursBeforeStart: 24,
      dealPriceMinor: 4_000,
      promoCode: "MID60",
      externalDealPriceOptionId: null,
      createdAt: BASE_NOW,
      updatedAt: BASE_NOW,
    });
    seedDealDiscountStep(store, {
      id: "ls72",
      dealId: deal.id,
      priceOptionId: option.id,
      hoursBeforeStart: 72,
      dealPriceMinor: 5_000,
      promoCode: "EARLY50",
      externalDealPriceOptionId: null,
      createdAt: BASE_NOW,
      updatedAt: BASE_NOW,
    });
    seedDealSession(store, {
      id: "sess-list",
      dealId: deal.id,
      externalSessionId: null,
      startAt: hoursFromNow(20),
      endAt: null,
      providerSeatsAvailable: null,
      manualSeatsAvailable: 3,
      seatCap: null,
      seatsDisplayed: 3,
      status: "live",
      lastSyncedAt: null,
      createdAt: BASE_NOW,
      updatedAt: BASE_NOW,
    });

    const result = listOperatorDeals(store, operatorId, {
      tab: "live",
      now: BASE_NOW,
      permissionUser: permissionUserForList(
        ACTOR.id,
        operatorId,
        "owner"
      ),
    });
    const row = result.deals.find((d) => d.id === deal.id);
    expect(row?.deal_price_minor).toBe(4_000);
    expect(row?.discount_pct).toBe(60);
  });

  it("bookingPromoForSession returns the active step code", () => {
    const { store, operatorId } = freshManualStore();
    const deal = makeDealFixture({
      id: crypto.randomUUID(),
      operatorId,
      dealType: "manual_session",
      status: "live",
      steppedDiscountEnabled: true,
      discountMechanism: "quote_code",
      promoCode: "BASE50",
    });
    store.deals.set(deal.id, deal);
    const option = seedDealPriceOption(store, makeOption(deal.id));
    seedDealDiscountStep(store, {
      id: "bp6",
      dealId: deal.id,
      priceOptionId: option.id,
      hoursBeforeStart: 6,
      dealPriceMinor: 3_000,
      promoCode: "LATE70",
      externalDealPriceOptionId: null,
      createdAt: BASE_NOW,
      updatedAt: BASE_NOW,
    });
    seedDealDiscountStep(store, {
      id: "bp72",
      dealId: deal.id,
      priceOptionId: option.id,
      hoursBeforeStart: 72,
      dealPriceMinor: 5_000,
      promoCode: "EARLY50",
      externalDealPriceOptionId: null,
      createdAt: BASE_NOW,
      updatedAt: BASE_NOW,
    });
    const session = seedDealSession(store, {
      id: "sess-book",
      dealId: deal.id,
      externalSessionId: null,
      startAt: hoursFromNow(5),
      endAt: null,
      providerSeatsAvailable: null,
      manualSeatsAvailable: 2,
      seatCap: null,
      seatsDisplayed: 2,
      status: "live",
      lastSyncedAt: null,
      createdAt: BASE_NOW,
      updatedAt: BASE_NOW,
    });

    expect(bookingPromoForSession(store, deal, session, BASE_NOW)).toBe(
      "LATE70"
    );
  });
});

describe("integrated step verify", () => {
  let mockController: ReturnType<typeof createMockAdapter>;

  beforeEach(() => {
    resetIntegrationSecretsBootstrap();
    ensureIntegrationSecretsConfigured();
    resetAdapterRegistry();
    resetSyncLocks();
    mockController = createMockAdapter({ now: new Date(BASE_NOW) });
    registerAdapterFactory("rezdy", () => mockController.adapter);
  });

  afterEach(() => {
    resetIntegrationSecretsBootstrap();
    resetAdapterRegistry();
    resetSyncLocks();
  });

  it("rejects a promo step not found in the provider", async () => {
    const seeded = seedDevMarketplace({ now: BASE_NOW });
    const store = createDealDraftStore(seeded.store);
    store.integrations = new Map(
      seeded.integrations.map((i) => [i.id, i])
    );
    store.externalProducts = new Map();
    store.externalSessions = new Map();
    store.syncLogs = new Map();

    const bayOwner = DEV_SEED_IDS.bayCruises.ownerUserId;
    const connected = await connectIntegration(
      store,
      DEV_SEED_IDS.bayCruises.operatorId,
      "rezdy",
      { api_key: "chunk43-key" },
      { actor: { type: "user", id: bayOwner }, now: BASE_NOW }
    );
    const kayak = [...store.externalProducts!.values()].find(
      (p) => p.externalId === "prod-harbour-kayak"
    )!;
    setProductEnabledForDeals(
      store,
      DEV_SEED_IDS.bayCruises.operatorId,
      "rezdy",
      kayak.id,
      true,
      { now: BASE_NOW }
    );
    await runSync(store, connected.integration.id, "full", { now: BASE_NOW });

    const deal = createDraftDeal(store, {
      operatorId: DEV_SEED_IDS.bayCruises.operatorId,
      dealType: "integrated_session",
      externalProductId: kayak.id,
      actor: { type: "user", id: bayOwner },
      now: BASE_NOW,
    });
    updateDraftDeal(
      store,
      deal.id,
      {
        stepped_discount_enabled: true,
        discount_mechanism: "promo_code",
        promo_code: "SAVE50",
      },
      { actor: { type: "user", id: bayOwner }, now: BASE_NOW }
    );

    const option = [...store.priceOptions.values()].find(
      (p) => p.dealId === deal.id
    )!;
    store.priceOptions.set(option.id, {
      ...option,
      ...withDiscountPct({
        originalPriceMinor: option.originalPriceMinor,
        dealPriceMinor: 5400,
      }),
    });

    mockController.addPromo({
      code: "SAVE50",
      product_external_id: "prod-harbour-kayak",
      price_option_external_id: "po-kayak-adult",
      deal_price_minor: 5400,
    });

    await expect(
      createDiscountStep(
        store,
        deal.id,
        {
          price_option_id: option.id,
          hours_before_start: 24,
          deal_price_minor: 4800,
          promo_code: "NOPE24",
        },
        { actor: { type: "user", id: bayOwner }, now: BASE_NOW }
      )
    ).rejects.toMatchObject({ status: 400 });
  });
});
