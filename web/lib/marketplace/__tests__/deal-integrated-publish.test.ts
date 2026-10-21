/**
 * Chunk 35 — integrated publish checks + provider-driven auto-pauses.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resumeDeal } from "@/lib/marketplace/deal-actions";
import {
  createDealDraftStore,
  createDraftDeal,
  updateDraftDeal,
} from "@/lib/marketplace/deal-draft";
import {
  selectIntegratedSessions,
} from "@/lib/marketplace/deal-integrated-availability";
import {
  updateIntegratedPriceOption,
  verifyDealDiscount,
} from "@/lib/marketplace/deal-integrated-pricing";
import {
  setSendDealAutoPaused,
} from "@/lib/marketplace/deal-integrated-sync-hooks";
import { validateDealInStore } from "@/lib/marketplace/deal-publish-validation";
import { transitionDeal } from "@/lib/marketplace/deal-status";
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
const LATER = "2026-10-20T04:15:00.000Z";
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

describe("Chunk 35 integrated publish checks and auto-pauses", () => {
  let mockController: ReturnType<typeof createMockAdapter>;
  const notify = vi.fn();

  beforeEach(() => {
    resetIntegrationSecretsBootstrap();
    ensureIntegrationSecretsConfigured();
    resetAdapterRegistry();
    resetSyncLocks();
    mockController = createMockAdapter({ now: NOW_DATE });
    registerAdapterFactory("rezdy", () => mockController.adapter);
    notify.mockReset();
    setSendDealAutoPaused(notify);
  });

  afterEach(() => {
    resetIntegrationSecretsBootstrap();
    resetAdapterRegistry();
    resetSyncLocks();
    setSendDealAutoPaused(null);
  });

  async function connectEnableKayak() {
    const { store, bayOperatorId, bayOwnerId } = freshStore();
    const connected = await connectIntegration(
      store,
      bayOperatorId,
      "rezdy",
      { api_key: "chunk35-key" },
      { actor: { type: "user", id: bayOwnerId }, now: NOW }
    );
    const kayak = [...store.externalProducts!.values()].find(
      (p) => p.externalId === "prod-harbour-kayak"
    )!;
    setProductEnabledForDeals(store, bayOperatorId, "rezdy", kayak.id, true, {
      now: NOW,
    });
    await runSync(store, connected.integration.id, "full", { now: NOW });
    return {
      store,
      bayOperatorId,
      integration: store.integrations!.get(connected.integration.id)!,
      kayak: store.externalProducts!.get(kayak.id)!,
    };
  }

  async function createLivePriceOptionDeal() {
    const ctx = await connectEnableKayak();
    const { store, bayOperatorId, kayak, integration } = ctx;

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

    // Keep a single mapped adult option (provider also lists deal/child options).
    for (const opt of [...store.priceOptions.values()]) {
      if (
        opt.dealId === deal.id &&
        opt.externalPriceOptionId !== "po-kayak-adult"
      ) {
        store.priceOptions.delete(opt.id);
      }
    }

    const adult = [...store.priceOptions.values()].find(
      (p) =>
        p.dealId === deal.id && p.externalPriceOptionId === "po-kayak-adult"
    )!;
    await updateIntegratedPriceOption(
      store,
      deal.id,
      adult.id,
      { external_deal_price_option_id: "po-kayak-deal-adult" },
      { actor: ACTOR, now: NOW }
    );

    const ext = [...store.externalSessions!.values()]
      .filter((s) => s.externalProductId === kayak.id)
      .sort((a, b) => a.startAt.localeCompare(b.startAt))[0]!;

    await selectIntegratedSessions(
      store,
      deal.id,
      { external_session_ids: [ext.id], capacity_mode: "live_provider" },
      { actor: ACTOR, now: NOW }
    );

    // Fill remaining publish-required fields so resume can re-validate.
    // Mark description overridden so a later sync does not restore the short
    // provider blurb (under the 100-char publish minimum).
    const withLink = store.deals.get(deal.id)!;
    const description =
      "Guided harbour kayak tour with all gear provided. ".repeat(3);
    store.deals.set(deal.id, {
      ...withLink,
      description,
      category: withLink.category ?? "water",
      languages:
        withLink.languages.length > 0 ? withLink.languages : ["en"],
      cancellationPolicyType:
        withLink.cancellationPolicyType ?? "operator_standard",
      overriddenFields: Array.from(
        new Set([...(withLink.overriddenFields ?? []), "description"])
      ),
      linkStatus: "ok",
      linkLastCheckedAt: NOW,
      bookingDestinationType: "provider_booking_page",
      bookingUrl: withLink.bookingUrl ?? "https://book.mock.example/kayak",
      salesCutoffMinutes: withLink.salesCutoffMinutes ?? 60,
    });

    transitionDeal(store, deal.id, "live", {
      actor: { type: "system" },
      now: NOW,
    });

    return {
      store,
      dealId: deal.id,
      kayak,
      integration,
      externalSession: ext,
      adultId: adult.id,
    };
  }

  it("integrated publish checks pass for a healthy price_option deal", async () => {
    const { store, dealId } = await createLivePriceOptionDeal();
    // Back to draft-like validation via validateDealInStore (status ignored)
    const result = await validateDealInStore(store, dealId, {
      now: NOW,
      refreshStaleLinks: false,
    });

    const byKey = Object.fromEntries(
      result.checks.map((c) => [c.key, c] as const)
    );
    expect(byKey.integration_healthy?.passed).toBe(true);
    expect(byKey.product_active?.passed).toBe(true);
    expect(byKey.original_price_locked?.passed).toBe(true);
    expect(byKey.discount_in_provider?.passed).toBe(true);
    expect(byKey.promo_code_confirmed?.passed).toBe(true);
    expect(byKey.session_available?.passed).toBe(true);
    expect(byKey.promo_code_confirmed?.message).toMatch(/Not using promo_code/i);
  });

  it("cancel a session → auto_paused session_cancelled and notifies", async () => {
    const { store, dealId, kayak, integration, externalSession } =
      await createLivePriceOptionDeal();

    mockController.cancelSession(
      "prod-harbour-kayak",
      externalSession.externalId
    );

    await runSync(store, integration.id, "incremental", { now: LATER });

    const deal = store.deals.get(dealId)!;
    expect(deal.status).toBe("auto_paused");
    expect(deal.pauseReason).toBe("session_cancelled");

    const session = [...store.sessions.values()].find(
      (s) => s.dealId === dealId
    )!;
    expect(session.status).toBe("cancelled");

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        dealId,
        reason: "session_cancelled",
        operatorId: store.deals.get(dealId)!.operatorId,
      })
    );
    expect(kayak.externalId).toBe("prod-harbour-kayak");
  });

  it("raise discounted option price → auto_paused price_below_threshold; fix and resume → live", async () => {
    const { store, dealId, integration, adultId } =
      await createLivePriceOptionDeal();

    // Raise deal option so it no longer matches stored deal_price (5400)
    mockController.setProductPrice(
      "prod-harbour-kayak",
      "po-kayak-deal-adult",
      9000
    );

    await runSync(store, integration.id, "incremental", { now: LATER });

    let deal = store.deals.get(dealId)!;
    expect(deal.status).toBe("auto_paused");
    expect(deal.pauseReason).toBe("price_below_threshold");
    expect(deal.pauseDetail).toMatch(/Adult/i);

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        dealId,
        reason: "price_below_threshold",
      })
    );

    // Operator fixes: re-select discounted option at new provider price.
    // 9000 vs original 12000 is only 25% off — must also lower original or
    // pick a valid discount. Set deal option back to 5400 for a clean resume,
    // then restore provider discount to 5400.
    mockController.setProductPrice(
      "prod-harbour-kayak",
      "po-kayak-deal-adult",
      5400
    );
    await runSync(store, integration.id, "incremental", {
      now: "2026-10-20T04:20:00.000Z",
    });

    // Still auto_paused (no auto-resume for price_below_threshold)
    deal = store.deals.get(dealId)!;
    expect(deal.status).toBe("auto_paused");
    expect(deal.pauseReason).toBe("price_below_threshold");

    // Re-apply price option so deal_price matches provider again
    await updateIntegratedPriceOption(
      store,
      dealId,
      adultId,
      { external_deal_price_option_id: "po-kayak-deal-adult" },
      { actor: ACTOR, now: "2026-10-20T04:20:00.000Z", confirm: true }
    );

    const resumed = await resumeDeal(store, dealId, {
      actor: ACTOR,
      now: "2026-10-20T04:20:00.000Z",
    });
    expect(resumed.deal.status).toBe("live");
    expect(resumed.deal.pauseReason).toBeNull();
  });

  it("promo_code_confirmed requires verify or operator confirm + test link", async () => {
    const { store, bayOperatorId, kayak } = await connectEnableKayak();

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
      {
        discount_mechanism: "promo_code",
        promo_code: "HALFOFF",
      },
      { actor: ACTOR, now: NOW }
    );

    for (const opt of [...store.priceOptions.values()]) {
      if (
        opt.dealId === deal.id &&
        opt.externalPriceOptionId !== "po-kayak-adult"
      ) {
        store.priceOptions.delete(opt.id);
      }
    }

    const adult = [...store.priceOptions.values()].find(
      (p) =>
        p.dealId === deal.id && p.externalPriceOptionId === "po-kayak-adult"
    )!;
    await updateIntegratedPriceOption(
      store,
      deal.id,
      adult.id,
      { deal_price_minor: 5400 },
      { actor: ACTOR, now: NOW }
    );

    mockController.addPromo({
      code: "HALFOFF",
      deal_price_minor: 5400,
    });

    const before = await validateDealInStore(store, deal.id, {
      now: NOW,
      refreshStaleLinks: false,
    });
    const promoBefore = before.checks.find(
      (c) => c.key === "promo_code_confirmed"
    )!;
    expect(promoBefore.passed).toBe(false);

    await verifyDealDiscount(store, deal.id, {
      actor: ACTOR,
      now: NOW,
    });

    // Verified but link not ok yet
    store.deals.set(deal.id, {
      ...store.deals.get(deal.id)!,
      linkStatus: "unchecked",
    });
    const mid = await validateDealInStore(store, deal.id, {
      now: NOW,
      refreshStaleLinks: false,
    });
    expect(
      mid.checks.find((c) => c.key === "promo_code_confirmed")!.passed
    ).toBe(true);

    // cannot_verify path: clear verification, confirm + link
    store.deals.set(deal.id, {
      ...store.deals.get(deal.id)!,
      discountVerification: {
        status: "cannot_verify",
        checked_at: NOW,
        options: [],
      },
      promoCodeConfirmedByOperator: false,
      linkStatus: "ok",
      linkLastCheckedAt: NOW,
    });
    const needConfirm = await validateDealInStore(store, deal.id, {
      now: NOW,
      refreshStaleLinks: false,
    });
    expect(
      needConfirm.checks.find((c) => c.key === "promo_code_confirmed")!.passed
    ).toBe(false);

    store.deals.set(deal.id, {
      ...store.deals.get(deal.id)!,
      promoCodeConfirmedByOperator: true,
    });
    const afterConfirm = await validateDealInStore(store, deal.id, {
      now: NOW,
      refreshStaleLinks: false,
    });
    expect(
      afterConfirm.checks.find((c) => c.key === "promo_code_confirmed")!.passed
    ).toBe(true);
  });

  it("product archived → session_cancelled auto-pause", async () => {
    const { store, dealId, kayak, integration } =
      await createLivePriceOptionDeal();

    store.externalProducts!.set(kayak.id, {
      ...store.externalProducts!.get(kayak.id)!,
      archivedInProvider: true,
      updatedAt: LATER,
    });

    // Direct hook path via runSync: mark product archived in mock by removing it
    // Force another sync after marking archived in store — runSync will also
    // re-archive missing products. Remove from mock products so sync archives it.
    mockController.state.products = mockController.state.products.filter(
      (p) => p.external_id !== "prod-harbour-kayak"
    );

    await runSync(store, integration.id, "full", { now: LATER });

    const deal = store.deals.get(dealId)!;
    expect(deal.status).toBe("auto_paused");
    expect(deal.pauseReason).toBe("session_cancelled");
    expect(deal.pauseDetail).toMatch(/archived/i);
  });
});
