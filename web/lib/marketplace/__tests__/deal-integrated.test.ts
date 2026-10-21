/**
 * Chunk 32 — integrated deal creation and content overrides.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createDealDraftStore,
  createDraftDeal,
  getDealDetail,
  revertDealField,
  updateDraftDeal,
} from "@/lib/marketplace/deal-draft";
import { listDealMedia } from "@/lib/marketplace/deal-media";
import { importProviderImages } from "@/lib/marketplace/deal-media-api";
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

const NOW = "2026-10-20T04:00:00.000Z";
const NOW_DATE = new Date(NOW);
const ACTOR = {
  type: "user" as const,
  id: DEV_SEED_IDS.bayCruises.ownerUserId,
};

function freshStore() {
  const seeded = seedDevMarketplace({ now: NOW });
  const store = createDealDraftStore(seeded.store);
  store.integrations = new Map(seeded.integrations.map((i) => [i.id, i]));
  store.syncLogs = new Map();
  store.externalProducts = new Map();
  store.externalSessions = new Map();
  store.integrationPollState = new Map();
  return {
    store,
    bayOperatorId: DEV_SEED_IDS.bayCruises.operatorId,
    bayOwnerId: DEV_SEED_IDS.bayCruises.ownerUserId,
  };
}

describe("Chunk 32 integrated deal creation and content overrides", () => {
  let mockController: ReturnType<typeof createMockAdapter>;

  beforeEach(() => {
    resetIntegrationSecretsBootstrap();
    ensureIntegrationSecretsConfigured();
    resetAdapterRegistry();
    resetSyncLocks();
    mockController = createMockAdapter({ now: NOW_DATE });
    registerAdapterFactory("rezdy", () => mockController.adapter);
  });

  afterEach(() => {
    resetIntegrationSecretsBootstrap();
    resetAdapterRegistry();
    resetSyncLocks();
  });

  async function connectAndEnableKayak() {
    const { store, bayOperatorId, bayOwnerId } = freshStore();
    const connected = await connectIntegration(
      store,
      bayOperatorId,
      "rezdy",
      { api_key: "chunk32-key" },
      { actor: { type: "user", id: bayOwnerId }, now: NOW }
    );
    const kayak = [...store.externalProducts!.values()].find(
      (p) => p.externalId === "prod-harbour-kayak"
    )!;
    setProductEnabledForDeals(store, bayOperatorId, "rezdy", kayak.id, true, {
      now: NOW,
    });
    await runSync(store, connected.integration.id, "full", { now: NOW });
    return { store, bayOperatorId, kayak, integration: connected.integration };
  }

  it("creates from a mock product with content, media and price options", async () => {
    const { store, bayOperatorId, kayak, integration } =
      await connectAndEnableKayak();

    const deal = createDraftDeal(store, {
      operatorId: bayOperatorId,
      dealType: "integrated_session",
      externalProductId: kayak.id,
      actor: ACTOR,
      now: NOW,
    });

    expect(deal.sourceProvider).toBe("rezdy");
    expect(deal.integrationId).toBe(integration.id);
    expect(deal.externalProductId).toBe(kayak.id);
    expect(deal.capacityMode).toBe("live_provider");
    expect(deal.title).toBe("Harbour Kayak Tour");
    expect(deal.description).toContain("inner harbour");
    expect(deal.summary).toContain("Paddle");
    expect(deal.durationMinutes).toBe(120);
    expect(deal.locationName).toBe("Viaduct Harbour");
    expect(deal.region).toBe("Auckland");
    expect(deal.overriddenFields).toEqual([]);
    expect(deal.bookingDestinationType).toBe("provider_booking_page");
    expect(deal.bookingUrl).toContain("prod-harbour-kayak");

    const media = listDealMedia(store.media, deal.id);
    expect(media.length).toBeGreaterThanOrEqual(1);
    expect(media.every((m) => m.source === "provider")).toBe(true);
    expect(media.filter((m) => m.isCover)).toHaveLength(1);

    const prices = [...store.priceOptions.values()].filter(
      (p) => p.dealId === deal.id
    );
    expect(prices.length).toBeGreaterThanOrEqual(2);
    expect(prices.every((p) => p.originalPriceSource === "provider")).toBe(
      true
    );
    expect(prices.every((p) => p.externalPriceOptionId != null)).toBe(true);

    const detail = await getDealDetail(store, deal.id, {
      refreshStaleLinks: false,
    });
    expect(detail.provider_values?.title).toBe("Harbour Kayak Tour");
    expect(detail.overridden_fields).toEqual([]);
  });

  it("override title; resync keeps title and updates description; revert restores title", async () => {
    const { store, bayOperatorId, kayak, integration } =
      await connectAndEnableKayak();

    const deal = createDraftDeal(store, {
      operatorId: bayOperatorId,
      dealType: "integrated_session",
      externalProductId: kayak.id,
      actor: ACTOR,
      now: NOW,
    });

    updateDraftDeal(
      store,
      deal.id,
      { title: "My Custom Kayak Title" },
      { actor: ACTOR, now: NOW }
    );
    const afterOverride = store.deals.get(deal.id)!;
    expect(afterOverride.title).toBe("My Custom Kayak Title");
    expect(afterOverride.overriddenFields).toContain("title");
    expect(afterOverride.overriddenFields).not.toContain("description");

    // Change provider description (and title) in mock, then sync.
    const mockProduct = mockController.state.products.find(
      (p) => p.external_id === "prod-harbour-kayak"
    )!;
    mockProduct.name = "Harbour Kayak Tour UPDATED";
    mockProduct.description =
      "Brand new description from the provider that should sync through.";

    await runSync(store, integration.id, "incremental", {
      now: "2026-10-20T04:10:00.000Z",
    });

    const afterSync = store.deals.get(deal.id)!;
    expect(afterSync.title).toBe("My Custom Kayak Title");
    expect(afterSync.description).toContain("Brand new description");
    expect(afterSync.overriddenFields).toContain("title");

    const reverted = revertDealField(store, deal.id, "title", {
      actor: ACTOR,
      now: "2026-10-20T04:11:00.000Z",
    });
    expect(reverted.title).toBe("Harbour Kayak Tour UPDATED");
    expect(reverted.overriddenFields).not.toContain("title");

    const detail = await getDealDetail(store, deal.id, {
      refreshStaleLinks: false,
    });
    expect(detail.provider_values?.title).toBe("Harbour Kayak Tour UPDATED");
    expect(detail.overridden_fields).not.toContain("title");
  });

  it("rejects integrated create when product is not enabled", async () => {
    const { store, bayOperatorId, bayOwnerId } = freshStore();
    await connectIntegration(
      store,
      bayOperatorId,
      "rezdy",
      { api_key: "chunk32-key" },
      { actor: { type: "user", id: bayOwnerId }, now: NOW }
    );
    const kayak = [...store.externalProducts!.values()].find(
      (p) => p.externalId === "prod-harbour-kayak"
    )!;
    expect(kayak.isEnabledForDeals).toBe(false);

    expect(() =>
      createDraftDeal(store, {
        operatorId: bayOperatorId,
        dealType: "integrated_session",
        externalProductId: kayak.id,
        actor: ACTOR,
        now: NOW,
      })
    ).toThrow(/not enabled for deals/i);
  });

  it("importProviderImages imports remaining provider URLs", async () => {
    const { store, bayOperatorId, kayak } = await connectAndEnableKayak();
    const deal = createDraftDeal(store, {
      operatorId: bayOperatorId,
      dealType: "integrated_multi_session",
      externalProductId: kayak.id,
      actor: ACTOR,
      now: NOW,
    });

    // Clear media then re-import
    for (const m of listDealMedia(store.media, deal.id)) {
      store.media.media.delete(m.id);
    }
    expect(listDealMedia(store.media, deal.id)).toHaveLength(0);

    const result = await importProviderImages(store, deal.id, {
      actor: ACTOR,
      now: NOW,
    });
    expect(result.imported).toBeGreaterThanOrEqual(1);
    expect(result.media.some((m) => m.isCover)).toBe(true);
  });
});
