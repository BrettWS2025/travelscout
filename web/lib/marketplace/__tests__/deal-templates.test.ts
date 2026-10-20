/**
 * Chunk 25 — deal templates: save, list, rename, delete, create-deal.
 */

import { describe, expect, it } from "vitest";
import { addDealMedia } from "@/lib/marketplace/deal-media";
import {
  createDealDraftStore,
  createDealFromTemplate,
  createDraftDeal,
  getDealDetail,
  seedDealPriceOption,
  seedDealSession,
  updateDraftDeal,
} from "@/lib/marketplace/deal-draft";
import type { DealPriceOption, DealSession } from "@/lib/marketplace/deal-session";
import {
  deleteOperatorTemplate,
  listOperatorTemplates,
  renameOperatorTemplate,
  saveDealAsTemplate,
  serializeDealTemplate,
} from "@/lib/marketplace/deal-templates";
import { DEV_SEED_IDS, seedDevMarketplace } from "@/lib/marketplace/seed-dev";

const NOW = "2026-10-20T05:00:00.000Z";
const ACTOR = {
  type: "user" as const,
  id: DEV_SEED_IDS.harbourKayaks.managerUserId,
};

function harbourStore() {
  const seeded = seedDevMarketplace({ now: NOW });
  return { store: createDealDraftStore(seeded.store) };
}

function richDeal() {
  const { store } = harbourStore();
  const deal = createDraftDeal(store, {
    operatorId: DEV_SEED_IDS.harbourKayaks.operatorId,
    dealType: "manual_session",
    actor: ACTOR,
    now: NOW,
  });
  updateDraftDeal(
    store,
    deal.id,
    {
      title: "Evening Harbour Paddle",
      summary: "A calm evening paddle around the harbour basin",
      description:
        "Join our guides for a two-hour paddle past the city lights with hot drinks at the end. Suitable for beginners and comfortable with a short briefing before launch from the viaduct pontoon.",
      category: "water",
      location_name: "Viaduct Harbour",
      address: "1 Quay St, Auckland",
      latitude: -36.84,
      longitude: 174.76,
      region: "Auckland",
      languages: ["en"],
      booking_url: "https://harbour.example/book",
      booking_destination_type: "operator_website",
    },
    { actor: ACTOR, now: NOW }
  );

  addDealMedia(
    store.media,
    {
      dealId: deal.id,
      mediaType: "image",
      source: "upload",
      url: "https://cdn.example.com/kayak.jpg",
      altText: "Kayaks on the water at dusk",
      isCover: true,
      sortOrder: 0,
      width: 1600,
      height: 1067,
    },
    { now: NOW }
  );

  const option: DealPriceOption = {
    id: "opt-tpl-1",
    dealId: deal.id,
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

  const session: DealSession = {
    id: "sess-tpl-1",
    dealId: deal.id,
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

  return { store, deal };
}

describe("saveDealAsTemplate + createDealFromTemplate", () => {
  it("saves content, media and prices; create-deal is draft with no sessions", async () => {
    const { store, deal } = richDeal();

    const template = saveDealAsTemplate(store, deal.id, "Kayak evening", {
      actor: ACTOR,
      now: NOW,
    });

    expect(template.name).toBe("Kayak evening");
    expect(template.operatorId).toBe(DEV_SEED_IDS.harbourKayaks.operatorId);
    expect(template.payload.deal_type).toBe("manual_session");
    expect(template.payload.title).toBe("Evening Harbour Paddle");
    expect(template.payload.booking_url).toBe("https://harbour.example/book");
    expect(Array.isArray(template.payload.media)).toBe(true);
    expect((template.payload.media as unknown[]).length).toBe(1);
    expect(Array.isArray(template.payload.price_options)).toBe(true);
    expect((template.payload.price_options as unknown[]).length).toBe(1);
    expect(template.payload.sessions).toBeUndefined();

    const created = createDealFromTemplate(
      store,
      DEV_SEED_IDS.harbourKayaks.operatorId,
      template.id,
      { actor: ACTOR, now: "2026-10-20T06:00:00.000Z" }
    );

    expect(created.status).toBe("draft");
    expect(created.title).toBe("Evening Harbour Paddle");
    expect(created.dealType).toBe("manual_session");
    expect(created.sourceProvider).toBe("manual");
    expect(created.firstPublishedAt).toBeNull();

    const detail = await getDealDetail(store, created.id);
    expect(detail.sessions).toHaveLength(0);
    expect(detail.media).toHaveLength(1);
    expect(detail.media[0].url).toBe("https://cdn.example.com/kayak.jpg");
    expect(detail.media[0].dealId).toBe(created.id);
    expect(detail.priceOptions).toHaveLength(1);
    expect(detail.priceOptions[0].label).toBe("Adult");
    expect(detail.priceOptions[0].originalPriceMinor).toBe(20000);
    expect(detail.priceOptions[0].dealPriceMinor).toBe(9000);
    expect(detail.priceOptions[0].id).not.toBe("opt-tpl-1");

    // Source still has its session; new deal does not.
    expect((await getDealDetail(store, deal.id)).sessions).toHaveLength(1);
  });

  it("lists, renames and deletes templates for the operator", () => {
    const { store } = harbourStore();
    const deal = createDraftDeal(store, {
      operatorId: DEV_SEED_IDS.harbourKayaks.operatorId,
      dealType: "manual_open_window",
      actor: ACTOR,
      now: NOW,
    });
    updateDraftDeal(
      store,
      deal.id,
      { title: "Campervan Weekend Hire" },
      { actor: ACTOR, now: NOW }
    );

    const t = saveDealAsTemplate(store, deal.id, "Campervan", {
      actor: ACTOR,
      now: NOW,
    });
    expect(
      listOperatorTemplates(store, DEV_SEED_IDS.harbourKayaks.operatorId)
    ).toHaveLength(1);

    const renamed = renameOperatorTemplate(
      store,
      DEV_SEED_IDS.harbourKayaks.operatorId,
      t.id,
      "Campervan hire"
    );
    expect(renamed.name).toBe("Campervan hire");

    const serialized = serializeDealTemplate(renamed);
    expect(serialized.operator_id).toBe(DEV_SEED_IDS.harbourKayaks.operatorId);
    expect(serialized.deal_type).toBe("manual_open_window");

    deleteOperatorTemplate(
      store,
      DEV_SEED_IDS.harbourKayaks.operatorId,
      t.id
    );
    expect(
      listOperatorTemplates(store, DEV_SEED_IDS.harbourKayaks.operatorId)
    ).toHaveLength(0);
  });

  it("rejects empty template name and wrong-operator template access", () => {
    const { store } = harbourStore();
    const d = createDraftDeal(store, {
      operatorId: DEV_SEED_IDS.harbourKayaks.operatorId,
      dealType: "manual_session",
      actor: ACTOR,
      now: NOW,
    });

    expect(() =>
      saveDealAsTemplate(store, d.id, "  ", { actor: ACTOR })
    ).toThrow(/name is required/);

    const t = saveDealAsTemplate(store, d.id, "Ok", { actor: ACTOR });
    expect(() =>
      renameOperatorTemplate(
        store,
        DEV_SEED_IDS.bayCruises.operatorId,
        t.id,
        "Nope"
      )
    ).toThrow(/not found/i);
  });
});
