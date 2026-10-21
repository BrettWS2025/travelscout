/**
 * Chunk 33 — integrated pricing and discount verification.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createDealDraftStore,
  createDraftDeal,
  getDealDetail,
  updateDraftDeal,
} from "@/lib/marketplace/deal-draft";
import {
  syncIntegratedOriginalPrices,
  updateIntegratedPriceOption,
  verifyDealDiscount,
} from "@/lib/marketplace/deal-integrated-pricing";
import { updateDealPriceOption } from "@/lib/marketplace/deal-inventory";
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

describe("Chunk 33 integrated pricing and discount verification", () => {
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

  async function connectEnableAndCreateDeal() {
    const { store, bayOperatorId, bayOwnerId } = freshStore();
    const connected = await connectIntegration(
      store,
      bayOperatorId,
      "rezdy",
      { api_key: "chunk33-key" },
      { actor: { type: "user", id: bayOwnerId }, now: NOW }
    );
    const kayak = [...store.externalProducts!.values()].find(
      (p) => p.externalId === "prod-harbour-kayak"
    )!;
    setProductEnabledForDeals(store, bayOperatorId, "rezdy", kayak.id, true, {
      now: NOW,
    });
    await runSync(store, connected.integration.id, "full", { now: NOW });

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
      { discount_mechanism: "price_option" },
      { actor: ACTOR, now: NOW }
    );

    const adult = [...store.priceOptions.values()].find(
      (p) =>
        p.dealId === deal.id && p.externalPriceOptionId === "po-kayak-adult"
    )!;

    return {
      store,
      dealId: deal.id,
      adult,
      kayak,
      integration: connected.integration,
    };
  }

  it("rejects PATCH of original_price_minor on integrated options", async () => {
    const { store, dealId, adult } = await connectEnableAndCreateDeal();

    await expect(
      updateDealPriceOption(
        store,
        dealId,
        adult.id,
        { original_price_minor: 1 },
        { actor: ACTOR, now: NOW }
      )
    ).rejects.toThrow(/read-only/i);
  });

  it("price_option at 55% off verifies; lowering provider original fails with message", async () => {
    const { store, dealId, adult } = await connectEnableAndCreateDeal();

    // Adult 12000 → deal option 5400 = 55% off
    const updated = await updateIntegratedPriceOption(
      store,
      dealId,
      adult.id,
      { external_deal_price_option_id: "po-kayak-deal-adult" },
      { actor: ACTOR, now: NOW }
    );
    expect(updated.priceOption.dealPriceMinor).toBe(5400);
    expect(updated.priceOption.originalPriceMinor).toBe(12000);
    expect(updated.priceOption.discountPct).toBe(55);

    const ok = await verifyDealDiscount(store, dealId, {
      actor: ACTOR,
      now: NOW,
    });
    expect(ok.verification.status).toBe("verified");
    expect(ok.verification.options[0]!.status).toBe("verified");

    const detail = await getDealDetail(store, dealId, {
      refreshStaleLinks: false,
    });
    expect(detail.discount_verification?.status).toBe("verified");
    expect(detail.provider_price_options?.length).toBeGreaterThan(0);

    // Lower provider original so 5400 no longer meets 50% (max = 4000 at 8000)
    mockController.setProductPrice("prod-harbour-kayak", "po-kayak-adult", 8000);
    // Refresh ExternalProduct catalogue from adapter (simulates sync)
    const products = await mockController.adapter.listProducts(
      store.integrations!.get(
        store.deals.get(dealId)!.integrationId!
      )!
    );
    const kayakNorm = products.find((p) => p.external_id === "prod-harbour-kayak")!;
    const kayakRow = [...store.externalProducts!.values()].find(
      (p) => p.externalId === "prod-harbour-kayak"
    )!;
    store.externalProducts!.set(kayakRow.id, {
      ...kayakRow,
      priceOptions: kayakNorm.price_options,
      lastSyncedAt: NOW,
    });

    syncIntegratedOriginalPrices(store, dealId, { now: NOW });
    const adultAfter = store.priceOptions.get(adult.id)!;
    expect(adultAfter.originalPriceMinor).toBe(8000);

    const fail = await verifyDealDiscount(store, dealId, {
      actor: ACTOR,
      now: NOW,
    });
    expect(fail.verification.status).toBe("failed");
    expect(fail.verification.options[0]!.message).toMatch(
      /minimum discount|max allowed/i
    );
  });

  it("promo_code mechanism verifies against mock promos", async () => {
    const { store, dealId, adult } = await connectEnableAndCreateDeal();

    updateDraftDeal(
      store,
      dealId,
      { discount_mechanism: "promo_code", promo_code: "HALFKAKE" },
      { actor: ACTOR, now: NOW }
    );

    await updateIntegratedPriceOption(
      store,
      dealId,
      adult.id,
      { deal_price_minor: 5400 },
      { actor: ACTOR, now: NOW }
    );

    const promo = await verifyDealDiscount(store, dealId, {
      actor: ACTOR,
      now: NOW,
    });
    expect(promo.verification.status).toBe("verified");
  });

  it("separate_product stores product:<uuid> and cannot_verify sets confirmation", async () => {
    const { store, dealId, adult } = await connectEnableAndCreateDeal();
    // Enable cruise and set its adult price to 5400 so 50% passes vs kayak 12000
    const cruise = [...store.externalProducts!.values()].find(
      (p) => p.externalId === "prod-bay-cruise"
    )!;
    mockController.setProductPrice("prod-bay-cruise", "po-cruise-adult", 5400);
    setProductEnabledForDeals(
      store,
      DEV_SEED_IDS.bayCruises.operatorId,
      "rezdy",
      cruise.id,
      true,
      { now: NOW }
    );
    await runSync(
      store,
      store.deals.get(dealId)!.integrationId!,
      "full",
      { now: NOW }
    );

    updateDraftDeal(
      store,
      dealId,
      { discount_mechanism: "separate_product" },
      { actor: ACTOR, now: NOW }
    );

    await updateIntegratedPriceOption(
      store,
      dealId,
      adult.id,
      { external_deal_price_option_id: cruise.id },
      { actor: ACTOR, now: NOW }
    );
    const opt = store.priceOptions.get(adult.id)!;
    expect(opt.externalDealPriceOptionId).toBe(`product:${cruise.id}`);
    expect(opt.dealPriceMinor).toBe(5400);

    const result = await verifyDealDiscount(store, dealId, {
      actor: ACTOR,
      now: NOW,
      promo_code_confirmed_by_operator: true,
    });
    expect(result.verification.status).toBe("cannot_verify");
    expect(result.deal.promoCodeConfirmedByOperator).toBe(true);
  });
});
