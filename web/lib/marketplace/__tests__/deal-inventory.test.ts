import { describe, expect, it } from "vitest";
import {
  createDealDraftStore,
  createDraftDeal,
  getDealDetail,
  updateDraftDeal,
} from "@/lib/marketplace/deal-draft";
import {
  createDealPriceOption,
  createDealSession,
  deleteDealSession,
  LiveDealConfirmRequiredError,
  listPriceChangeEvents,
  listSessionEvents,
  maxDealPrice,
  MinDiscountError,
  MAX_OPEN_WINDOW_DAYS,
  reorderDealPriceOptions,
  updateDealPriceOption,
  updateDealSession,
} from "@/lib/marketplace/deal-inventory";
import { transitionDeal } from "@/lib/marketplace/deal-status";
import { localDateKey, zonedLocalToUtcIso } from "@/lib/marketplace/timezone";
import { seedDevMarketplace, DEV_SEED_IDS } from "@/lib/marketplace/seed-dev";

const NOW = "2026-10-20T05:00:00.000Z";
const ACTOR = {
  type: "user" as const,
  id: DEV_SEED_IDS.harbourKayaks.managerUserId,
};

function harbourStore() {
  const seeded = seedDevMarketplace({ now: NOW });
  const store = createDealDraftStore(seeded.store);
  return { store, seeded };
}

function createManualOpenWindow() {
  const { store } = harbourStore();
  const deal = createDraftDeal(store, {
    operatorId: DEV_SEED_IDS.harbourKayaks.operatorId,
    dealType: "manual_open_window",
    actor: ACTOR,
    now: NOW,
  });
  return { store, deal };
}

function createManualSessionDeal() {
  const { store } = harbourStore();
  const deal = createDraftDeal(store, {
    operatorId: DEV_SEED_IDS.harbourKayaks.operatorId,
    dealType: "manual_session",
    actor: ACTOR,
    now: NOW,
  });
  return { store, deal };
}

describe("timezone helpers", () => {
  it("converts Auckland local midnight to UTC", () => {
    // 2026-10-22 is NZDT (UTC+13)
    const iso = zonedLocalToUtcIso("2026-10-22", "00:00:00", "Pacific/Auckland");
    expect(iso).toBe("2026-10-21T11:00:00.000Z");
    expect(localDateKey(iso, "Pacific/Auckland")).toBe("2026-10-22");
  });
});

describe("open-window sessions", () => {
  it("allows 3 days and rejects a 4th; no duplicate days", async () => {
    const { store, deal } = createManualOpenWindow();
    const days = ["2026-10-22", "2026-10-23", "2026-10-24"];

    for (const date of days) {
      const { session } = await createDealSession(
        store,
        deal.id,
        { date, manual_seats_available: 3 },
        { actor: ACTOR, now: NOW }
      );
      expect(localDateKey(session.startAt, "Pacific/Auckland")).toBe(date);
      expect(session.endAt).not.toBeNull();
      expect(session.seatsDisplayed).toBe(3);
    }

    expect(getDealDetail(store, deal.id).sessions).toHaveLength(
      MAX_OPEN_WINDOW_DAYS
    );

    await expect(
      createDealSession(
        store,
        deal.id,
        { date: "2026-10-22", manual_seats_available: 1 },
        { actor: ACTOR, now: NOW }
      )
    ).rejects.toThrow(/duplicate/i);

    await expect(
      createDealSession(
        store,
        deal.id,
        { date: "2026-10-25", manual_seats_available: 2 },
        { actor: ACTOR, now: NOW }
      )
    ).rejects.toThrow(/at most 3 days/i);

    const events = listSessionEvents(store, deal.id);
    expect(events.filter((e) => e.eventType === "session_added")).toHaveLength(3);
  });

  it("logs seats_changed and session_removed", async () => {
    const { store, deal } = createManualOpenWindow();
    const { session } = await createDealSession(
      store,
      deal.id,
      { date: "2026-10-22", manual_seats_available: 5 },
      { actor: ACTOR, now: NOW }
    );

    await updateDealSession(
      store,
      deal.id,
      session.id,
      { manual_seats_available: 2 },
      { actor: ACTOR, now: NOW }
    );
    expect(store.sessions.get(session.id)?.seatsDisplayed).toBe(2);

    await deleteDealSession(store, deal.id, session.id, {
      actor: ACTOR,
      now: NOW,
    });

    const events = listSessionEvents(store, deal.id);
    expect(events.some((e) => e.eventType === "seats_changed")).toBe(true);
    expect(events.some((e) => e.eventType === "session_removed")).toBe(true);
  });
});

describe("manual_session", () => {
  it("requires future start_at and recomputes seats_displayed with seat_cap", async () => {
    const { store, deal } = createManualSessionDeal();
    updateDraftDeal(
      store,
      deal.id,
      { seat_cap: 4 },
      { actor: ACTOR, now: NOW }
    );
    const refreshed = store.deals.get(deal.id)!;

    await expect(
      createDealSession(
        store,
        refreshed.id,
        {
          start_at: "2026-10-19T12:00:00.000Z",
          manual_seats_available: 10,
        },
        { actor: ACTOR, now: NOW }
      )
    ).rejects.toThrow(/future/i);

    const { session } = await createDealSession(
      store,
      refreshed.id,
      {
        start_at: "2026-10-22T01:00:00.000Z",
        manual_seats_available: 10,
      },
      { actor: ACTOR, now: NOW }
    );
    // deal seat_cap 4 caps displayed seats
    expect(session.seatsDisplayed).toBe(4);
  });
});

describe("price options", () => {
  it("accepts $200 → $90 and rejects $110 with max $100 message", async () => {
    const { store, deal } = createManualSessionDeal();

    const { priceOption } = await createDealPriceOption(
      store,
      deal.id,
      {
        label: "Adult",
        type: "adult",
        original_price_minor: 20000,
        deal_price_minor: 9000,
        original_price_evidence_url: "https://example.com/prices",
      },
      { actor: ACTOR, now: NOW }
    );
    expect(priceOption.dealPriceMinor).toBe(9000);
    expect(priceOption.discountPct).toBe(55);
    expect(priceOption.originalPriceSource).toBe("operator_entered");

    expect(maxDealPrice(20000)).toBe(10000);

    try {
      await createDealPriceOption(
        store,
        deal.id,
        {
          label: "Adult bad",
          type: "adult",
          original_price_minor: 20000,
          deal_price_minor: 11000,
        },
        { actor: ACTOR, now: NOW }
      );
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(MinDiscountError);
      const e = err as MinDiscountError;
      expect(e.maxDealPriceMinor).toBe(10000);
      expect(e.message).toMatch(/≤ 10000/);
    }
  });

  it("percentage 60% on $200 stores $80", async () => {
    const { store, deal } = createManualSessionDeal();
    updateDraftDeal(
      store,
      deal.id,
      { discount_input_mode: "percentage" },
      { actor: ACTOR, now: NOW }
    );

    const { priceOption } = await createDealPriceOption(
      store,
      deal.id,
      {
        label: "Adult",
        type: "adult",
        original_price_minor: 20000,
        percentage: 60,
      },
      { actor: ACTOR, now: NOW }
    );
    expect(priceOption.dealPriceMinor).toBe(8000);
    expect(priceOption.discountPct).toBe(60);

    const events = listPriceChangeEvents(store, deal.id);
    expect(events).toHaveLength(1);
    expect(events[0].detail.new).toMatchObject({
      deal_price_minor: 8000,
    });
  });

  it("reorders sort_order from ordered_ids", async () => {
    const { store, deal } = createManualSessionDeal();
    const a = (
      await createDealPriceOption(
        store,
        deal.id,
        {
          label: "Adult",
          type: "adult",
          original_price_minor: 20000,
          deal_price_minor: 9000,
        },
        { actor: ACTOR, now: NOW, id: "opt-a" }
      )
    ).priceOption;
    const b = (
      await createDealPriceOption(
        store,
        deal.id,
        {
          label: "Child",
          type: "child",
          original_price_minor: 10000,
          deal_price_minor: 4000,
        },
        { actor: ACTOR, now: NOW, id: "opt-b" }
      )
    ).priceOption;

    const { priceOptions } = await reorderDealPriceOptions(
      store,
      deal.id,
      [b.id, a.id],
      { actor: ACTOR, now: NOW }
    );
    expect(priceOptions.map((o) => o.id)).toEqual([b.id, a.id]);
    expect(priceOptions[0].sortOrder).toBe(0);
    expect(priceOptions[1].sortOrder).toBe(1);
  });

  it("logs price_changed old/new on update", async () => {
    const { store, deal } = createManualSessionDeal();
    const { priceOption } = await createDealPriceOption(
      store,
      deal.id,
      {
        label: "Adult",
        type: "adult",
        original_price_minor: 20000,
        deal_price_minor: 9000,
      },
      { actor: ACTOR, now: NOW }
    );

    await updateDealPriceOption(
      store,
      deal.id,
      priceOption.id,
      { deal_price_minor: 8000 },
      { actor: ACTOR, now: NOW }
    );

    const events = listPriceChangeEvents(store, deal.id);
    expect(events.length).toBeGreaterThanOrEqual(2);
    const last = events[events.length - 1];
    expect(last.detail.old).toMatchObject({ deal_price_minor: 9000 });
    expect(last.detail.new).toMatchObject({ deal_price_minor: 8000 });
  });
});

describe("live deal confirm", () => {
  it("requires confirm: true when the deal is live", async () => {
    const { store, deal } = createManualSessionDeal();
    // Force live via status store transition path (shared deal map + audit).
    const statusStore = { deals: store.deals, audit: store.audit };
    transitionDeal(statusStore, deal.id, "live", {
      actor: { type: "system" },
      now: NOW,
    });
    expect(store.deals.get(deal.id)?.status).toBe("live");

    await expect(
      createDealSession(
        store,
        deal.id,
        {
          start_at: "2026-10-22T01:00:00.000Z",
          manual_seats_available: 2,
        },
        { actor: ACTOR, now: NOW }
      )
    ).rejects.toBeInstanceOf(LiveDealConfirmRequiredError);

    const { session } = await createDealSession(
      store,
      deal.id,
      {
        start_at: "2026-10-22T01:00:00.000Z",
        manual_seats_available: 2,
      },
      { actor: ACTOR, now: NOW, confirm: true }
    );
    expect(session.manualSeatsAvailable).toBe(2);
  });
});
