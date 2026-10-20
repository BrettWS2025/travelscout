import { describe, expect, it } from "vitest";
import { addDealMedia } from "@/lib/marketplace/deal-media";
import {
  assertCanWriteDeal,
  createDealDraftStore,
  createDraftDeal,
  deleteDraftDeal,
  DealDeleteNotAllowedError,
  DealDraftError,
  duplicateDeal,
  ensureUniqueDealSlug,
  getDealDetail,
  isMechanismValidForDealType,
  listDealCreatedEvents,
  prefillFromBookingDefaults,
  seedDealPriceOption,
  seedDealSession,
  slugifyDealTitle,
  updateDraftDeal,
} from "@/lib/marketplace/deal-draft";
import { createDealTemplate } from "@/lib/marketplace/deal-audit";
import { makeDealFixture, transitionDeal } from "@/lib/marketplace/deal-status";
import {
  createOperatorStore,
  createOperator,
  seedOperatorWithOwner,
} from "@/lib/marketplace/operators";
import { permissionUserFromStore } from "@/lib/marketplace/permissions";
import { seedDevMarketplace, DEV_SEED_IDS } from "@/lib/marketplace/seed-dev";
import type { DealSession, DealPriceOption } from "@/lib/marketplace/deal-session";

const NOW = "2026-10-20T05:00:00.000Z";
const ACTOR = { type: "user" as const, id: DEV_SEED_IDS.harbourKayaks.managerUserId };

function harbourStore() {
  const seeded = seedDevMarketplace({ now: NOW });
  const store = createDealDraftStore(seeded.store);
  return { store, seeded };
}

describe("slug helpers", () => {
  it("slugifyDealTitle lowercases and hyphenates", () => {
    expect(slugifyDealTitle("Harbour Kayak Morning!")).toBe(
      "harbour-kayak-morning"
    );
  });

  it("ensureUniqueDealSlug adds numeric suffix", () => {
    const { store } = harbourStore();
    store.deals.set(
      "a",
      makeDealFixture({
        id: "a",
        operatorId: DEV_SEED_IDS.harbourKayaks.operatorId,
        slug: "harbour-kayak",
      })
    );
    expect(ensureUniqueDealSlug(store, "harbour-kayak")).toBe("harbour-kayak-2");
  });
});

describe("mechanism validity", () => {
  it("allows manual_price for manual types only", () => {
    expect(isMechanismValidForDealType("manual_session", "manual_price")).toBe(
      true
    );
    expect(isMechanismValidForDealType("manual_session", "promo_code")).toBe(
      false
    );
    expect(
      isMechanismValidForDealType("integrated_session", "promo_code")
    ).toBe(true);
    expect(
      isMechanismValidForDealType("integrated_session", "manual_price")
    ).toBe(false);
  });
});

describe("createDraftDeal", () => {
  it("creates a manual_session draft as manager with defaults pre-filled", () => {
    const { store, seeded } = harbourStore();
    const deal = createDraftDeal(store, {
      operatorId: DEV_SEED_IDS.harbourKayaks.operatorId,
      dealType: "manual_session",
      actor: ACTOR,
      now: NOW,
    });

    expect(deal.status).toBe("draft");
    expect(deal.sourceProvider).toBe("manual");
    expect(deal.capacityMode).toBe("manual_count");
    expect(deal.currency).toBe(seeded.harbourKayaks.operator.currency);
    expect(deal.salesCutoffMinutes).toBe(
      seeded.harbourKayaks.defaults.defaultSalesCutoffMinutes
    );
    expect(deal.seatCap).toBe(seeded.harbourKayaks.defaults.defaultSeatCap);
    expect(deal.discountMechanism).toBe(
      seeded.harbourKayaks.defaults.defaultDiscountMechanism
    );
    expect(deal.bookingDestinationType).toBe(
      seeded.harbourKayaks.defaults.defaultBookingDestinationType
    );
    expect(deal.cancellationPolicyType).toBe(
      seeded.harbourKayaks.defaults.defaultCancellationPolicyType
    );

    const events = listDealCreatedEvents(store, deal.id);
    expect(events).toHaveLength(1);
    expect(events[0].detail.deal_type).toBe("manual_session");
  });

  it("staff inventory.write is denied via assertCanWriteDeal", () => {
    const { store, seeded } = harbourStore();
    const staff = permissionUserFromStore(
      DEV_SEED_IDS.harbourKayaks.staffUserId,
      store.operators.teamMembers.values()
    );
    expect(() =>
      assertCanWriteDeal(staff, DEV_SEED_IDS.harbourKayaks.operatorId)
    ).toThrow(DealDraftError);

    const manager = permissionUserFromStore(
      DEV_SEED_IDS.harbourKayaks.managerUserId,
      store.operators.teamMembers.values()
    );
    expect(() =>
      assertCanWriteDeal(manager, DEV_SEED_IDS.harbourKayaks.operatorId)
    ).not.toThrow();
    expect(seeded.harbourKayaks.staff.role).toBe("staff");
  });

  it("skips default discount_mechanism when invalid for integrated type", () => {
    const opStore = createOperatorStore();
    const { operator, defaults } = createOperator(opStore, {
      legalName: "Bay Co",
      tradingName: "Bay Co",
      slug: "bay-co",
      currency: "NZD",
    });
    // Defaults use manual_price — invalid for integrated.
    expect(defaults.defaultDiscountMechanism).toBe("manual_price");
    const store = createDealDraftStore(opStore);
    const deal = createDraftDeal(store, {
      operatorId: operator.id,
      dealType: "integrated_session",
      sourceProvider: "rezdy",
      actor: { type: "user", id: "u1" },
      now: NOW,
    });
    expect(deal.discountMechanism).toBeNull();
    expect(deal.capacityMode).toBe("live_provider");
    expect(deal.sourceProvider).toBe("rezdy");
  });

  it("prefillFromBookingDefaults uses operator currency", () => {
    const opStore = createOperatorStore();
    const { operator, defaults } = seedOperatorWithOwner(opStore, {
      legalName: "Test",
      tradingName: "Test",
      slug: "test-op",
      currency: "AUD",
      ownerUserId: "owner-1",
      ownerEmail: "o@test.dev",
    });
    const prefill = prefillFromBookingDefaults(
      "manual_open_window",
      operator,
      defaults
    );
    expect(prefill.currency).toBe("AUD");
    expect(prefill.sourceProvider).toBe("manual");
    expect(prefill.capacityMode).toBe("manual_count");
  });

  it("creates from template_id content", () => {
    const { store } = harbourStore();
    const template = createDealTemplate(store.audit, {
      operatorId: DEV_SEED_IDS.harbourKayaks.operatorId,
      name: "Kayak template",
      payload: {
        title: "Sunrise Harbour Paddle",
        summary: "A calm morning paddle around the harbour basin",
        category: "water",
      },
    });
    const deal = createDraftDeal(store, {
      operatorId: DEV_SEED_IDS.harbourKayaks.operatorId,
      dealType: "manual_session",
      templateId: template.id,
      actor: ACTOR,
      now: NOW,
    });
    expect(deal.title).toBe("Sunrise Harbour Paddle");
    expect(deal.summary).toBe(
      "A calm morning paddle around the harbour basin"
    );
    expect(deal.category).toBe("water");
    expect(deal.slug).toContain("sunrise-harbour-paddle");
  });
});

describe("updateDraftDeal", () => {
  it("ignores status / pause_* from PATCH", () => {
    const { store } = harbourStore();
    const deal = createDraftDeal(store, {
      operatorId: DEV_SEED_IDS.harbourKayaks.operatorId,
      dealType: "manual_session",
      actor: ACTOR,
      now: NOW,
    });

    const updated = updateDraftDeal(
      store,
      deal.id,
      {
        title: "Harbour Kayak Morning",
        status: "live",
        pause_reason: "operator",
        pause_detail: "hacked",
      },
      { actor: ACTOR, now: "2026-10-20T06:00:00.000Z" }
    );

    expect(updated.title).toBe("Harbour Kayak Morning");
    expect(updated.status).toBe("draft");
    expect(updated.pauseReason).toBeNull();
    expect(updated.pauseDetail).toBeNull();
    expect(updated.slug).toBe("harbour-kayak-morning");

    const events = store.audit.events;
    const updatedEvents = [...events.values()].filter(
      (e) => e.dealId === deal.id && e.eventType === "updated"
    );
    expect(updatedEvents).toHaveLength(1);
    expect(updatedEvents[0].detail.fields).toEqual(
      expect.arrayContaining(["title", "slug"])
    );
  });

  it("rejects deal_type change after first publish", () => {
    const { store } = harbourStore();
    const deal = createDraftDeal(store, {
      operatorId: DEV_SEED_IDS.harbourKayaks.operatorId,
      dealType: "manual_session",
      actor: ACTOR,
      now: NOW,
      id: "deal-pub-1",
    });
    // Use status store shape via draft store deals map
    const statusStore = { deals: store.deals, audit: store.audit };
    transitionDeal(statusStore, deal.id, "live", {
      actor: ACTOR,
      now: "2026-10-20T07:00:00.000Z",
    });

    expect(() =>
      updateDraftDeal(
        store,
        deal.id,
        { deal_type: "manual_open_window" },
        { actor: ACTOR }
      )
    ).toThrow(/deal_type cannot be changed/);
  });

  it("rejects mechanism not valid for type", () => {
    const { store } = harbourStore();
    const deal = createDraftDeal(store, {
      operatorId: DEV_SEED_IDS.harbourKayaks.operatorId,
      dealType: "manual_session",
      actor: ACTOR,
      now: NOW,
    });
    expect(() =>
      updateDraftDeal(
        store,
        deal.id,
        { discount_mechanism: "promo_code" },
        { actor: ACTOR }
      )
    ).toThrow(DealDraftError);
  });

  it("keeps slug unique when title changes collide", () => {
    const { store } = harbourStore();
    const a = createDraftDeal(store, {
      operatorId: DEV_SEED_IDS.harbourKayaks.operatorId,
      dealType: "manual_session",
      actor: ACTOR,
      now: NOW,
      id: "deal-a",
    });
    updateDraftDeal(
      store,
      a.id,
      { title: "Shared Title X" },
      { actor: ACTOR, now: NOW }
    );
    const b = createDraftDeal(store, {
      operatorId: DEV_SEED_IDS.harbourKayaks.operatorId,
      dealType: "manual_session",
      actor: ACTOR,
      now: NOW,
      id: "deal-b",
    });
    const updatedB = updateDraftDeal(
      store,
      b.id,
      { title: "Shared Title X" },
      { actor: ACTOR, now: NOW }
    );
    expect(updatedB.slug).toBe("shared-title-x-2");
  });
});

describe("duplicateDeal", () => {
  it("copies content, media, price options but not sessions", () => {
    const { store } = harbourStore();
    const source = createDraftDeal(store, {
      operatorId: DEV_SEED_IDS.harbourKayaks.operatorId,
      dealType: "manual_session",
      actor: ACTOR,
      now: NOW,
      id: "src-deal",
    });
    updateDraftDeal(
      store,
      source.id,
      {
        title: "Evening Paddle Trip",
        summary: "Sunset kayak around the harbour edge",
        booking_url: "https://harbour.example/book",
      },
      { actor: ACTOR, now: NOW }
    );

    addDealMedia(store.media, {
      dealId: source.id,
      mediaType: "image",
      source: "upload",
      url: "https://cdn.example.com/kayak.jpg",
      altText: "Kayaks on the beach at dusk",
      isCover: true,
    });

    const session: DealSession = {
      id: "sess-1",
      dealId: source.id,
      externalSessionId: null,
      startAt: "2026-10-21T01:00:00.000Z",
      endAt: null,
      providerSeatsAvailable: null,
      manualSeatsAvailable: 6,
      seatCap: null,
      seatsDisplayed: 6,
      status: "live",
      lastSyncedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    };
    seedDealSession(store, session);

    const option: DealPriceOption = {
      id: "opt-1",
      dealId: source.id,
      label: "Adult",
      type: "adult",
      externalPriceOptionId: null,
      externalDealPriceOptionId: null,
      originalPriceMinor: 20000,
      originalPriceSource: "operator_entered",
      originalPriceEvidenceUrl: "https://harbour.example/prices",
      dealPriceMinor: 9000,
      discountPct: 55,
      sortOrder: 0,
      createdAt: NOW,
      updatedAt: NOW,
    };
    seedDealPriceOption(store, option);

    const copy = duplicateDeal(store, source.id, {
      actor: ACTOR,
      now: "2026-10-20T08:00:00.000Z",
    });

    expect(copy.id).not.toBe(source.id);
    expect(copy.title).toBe("Copy of Evening Paddle Trip");
    expect(copy.status).toBe("draft");
    expect(copy.bookingUrl).toBe("https://harbour.example/book");
    expect(copy.firstPublishedAt).toBeNull();

    const detail = getDealDetail(store, copy.id);
    expect(detail.sessions).toHaveLength(0);
    expect(detail.media).toHaveLength(1);
    expect(detail.media[0].url).toBe("https://cdn.example.com/kayak.jpg");
    expect(detail.media[0].dealId).toBe(copy.id);
    expect(detail.priceOptions).toHaveLength(1);
    expect(detail.priceOptions[0].label).toBe("Adult");
    expect(detail.priceOptions[0].id).not.toBe("opt-1");
    expect(detail.validation).toEqual({ ok: true, checks: [] });

    // Source still has its session
    expect(getDealDetail(store, source.id).sessions).toHaveLength(1);
  });

  it("createDraftDeal with duplicate_of uses duplicate path", () => {
    const { store } = harbourStore();
    const source = createDraftDeal(store, {
      operatorId: DEV_SEED_IDS.harbourKayaks.operatorId,
      dealType: "manual_session",
      actor: ACTOR,
      now: NOW,
    });
    updateDraftDeal(
      store,
      source.id,
      { title: "Original Deal Title" },
      { actor: ACTOR, now: NOW }
    );
    const copy = createDraftDeal(store, {
      operatorId: DEV_SEED_IDS.harbourKayaks.operatorId,
      dealType: "manual_open_window", // ignored when duplicating
      duplicateOf: source.id,
      actor: ACTOR,
      now: NOW,
    });
    expect(copy.title).toBe("Copy of Original Deal Title");
    expect(copy.dealType).toBe("manual_session");
  });
});

describe("deleteDraftDeal", () => {
  it("deletes never-published drafts only", () => {
    const { store } = harbourStore();
    const deal = createDraftDeal(store, {
      operatorId: DEV_SEED_IDS.harbourKayaks.operatorId,
      dealType: "manual_session",
      actor: ACTOR,
      now: NOW,
      id: "del-1",
    });
    deleteDraftDeal(store, deal.id);
    expect(store.deals.has("del-1")).toBe(false);

    const live = createDraftDeal(store, {
      operatorId: DEV_SEED_IDS.harbourKayaks.operatorId,
      dealType: "manual_session",
      actor: ACTOR,
      now: NOW,
      id: "del-2",
    });
    transitionDeal(
      { deals: store.deals, audit: store.audit },
      live.id,
      "live",
      { actor: ACTOR, now: NOW }
    );
    expect(() => deleteDraftDeal(store, live.id)).toThrow(
      DealDeleteNotAllowedError
    );
  });
});

describe("getDealDetail", () => {
  it("returns empty validation block until Chunk 16", () => {
    const { store } = harbourStore();
    const deal = createDraftDeal(store, {
      operatorId: DEV_SEED_IDS.harbourKayaks.operatorId,
      dealType: "manual_session",
      actor: ACTOR,
      now: NOW,
    });
    const detail = getDealDetail(store, deal.id);
    expect(detail.deal.id).toBe(deal.id);
    expect(detail.validation.ok).toBe(true);
    expect(detail.validation.checks).toEqual([]);
    expect(detail.sessions).toEqual([]);
    expect(detail.media).toEqual([]);
  });
});
