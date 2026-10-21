/**
 * Chunk 36 — Book now click flow and tracking.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PLATFORM_DEFAULTS } from "@/lib/marketplace/config";
import {
  bookDealNow,
  DealBookNowError,
  resetBookNowRateLimit,
} from "@/lib/marketplace/deal-book-now";
import {
  createDealDraftStore,
  createDraftDeal,
  updateDraftDeal,
} from "@/lib/marketplace/deal-draft";
import { selectIntegratedSessions } from "@/lib/marketplace/deal-integrated-availability";
import { updateIntegratedPriceOption } from "@/lib/marketplace/deal-integrated-pricing";
import { makeDealFixture, seedDeal, transitionDeal } from "@/lib/marketplace/deal-status";
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
import { AdapterOperationError } from "@/lib/marketplace/providers/errors";
import { DEV_SEED_IDS, seedDevMarketplace } from "@/lib/marketplace/seed-dev";
import type { DealSession } from "@/lib/marketplace/deal-session";

const NOW = "2026-10-20T04:00:00.000Z";
const NOW_DATE = new Date(NOW);
const ACTOR = {
  type: "user" as const,
  id: DEV_SEED_IDS.bayCruises.ownerUserId,
};

function hoursFrom(iso: string, hours: number): string {
  return new Date(Date.parse(iso) + hours * 3600_000).toISOString();
}

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
    harbourOperatorId: DEV_SEED_IDS.harbourKayaks.operatorId,
  };
}

describe("Chunk 36 Book now click flow", () => {
  let mockController: ReturnType<typeof createMockAdapter>;

  beforeEach(() => {
    resetIntegrationSecretsBootstrap();
    ensureIntegrationSecretsConfigured();
    resetAdapterRegistry();
    resetSyncLocks();
    resetBookNowRateLimit();
    mockController = createMockAdapter({ now: NOW_DATE });
    registerAdapterFactory("rezdy", () => mockController.adapter);
  });

  afterEach(() => {
    resetIntegrationSecretsBootstrap();
    resetAdapterRegistry();
    resetSyncLocks();
    resetBookNowRateLimit();
  });

  async function createLiveIntegratedDeal() {
    const { store, bayOperatorId, bayOwnerId } = freshStore();
    const connected = await connectIntegration(
      store,
      bayOperatorId,
      "rezdy",
      { api_key: "chunk36-key" },
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
      {
        discount_mechanism: "price_option",
        region: "Auckland",
        booking_instructions: "Bring sunscreen",
        append_tracking_params: true,
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

    const live = store.deals.get(deal.id)!;
    store.deals.set(deal.id, {
      ...live,
      description:
        "Guided harbour kayak tour with all gear provided. ".repeat(3),
      category: live.category ?? "water",
      languages: live.languages.length > 0 ? live.languages : ["en"],
      cancellationPolicyType:
        live.cancellationPolicyType ?? "operator_standard",
      linkStatus: "ok",
      linkLastCheckedAt: NOW,
      bookingDestinationType: "provider_booking_page",
      bookingUrl: live.bookingUrl ?? "https://mock.book.example/book/prod-harbour-kayak",
      salesCutoffMinutes: live.salesCutoffMinutes ?? 60,
      region: "Auckland",
      bookingInstructions: "Bring sunscreen",
      appendTrackingParams: true,
    });

    transitionDeal(store, deal.id, "live", {
      actor: { type: "system" },
      now: NOW,
    });

    const session = [...store.sessions.values()].find(
      (s) => s.dealId === deal.id
    )!;

    // Ensure session has fresh sync timestamp for cache-age tests
    store.sessions.set(session.id, {
      ...session,
      lastSyncedAt: NOW,
      providerSeatsAvailable: session.providerSeatsAvailable ?? 8,
      seatsDisplayed: session.seatsDisplayed || 8,
      status: "live",
    });

    return {
      store,
      deal: store.deals.get(deal.id)!,
      session: store.sessions.get(session.id)!,
      kayak,
      integration: connected.integration,
      ext,
    };
  }

  function seedManualLiveDeal(
    store: ReturnType<typeof createDealDraftStore>,
    opts?: { id?: string; region?: string; seats?: number; slug?: string }
  ) {
    const id = opts?.id ?? "manual-live-1";
    const deal = makeDealFixture({
      id,
      operatorId: DEV_SEED_IDS.harbourKayaks.operatorId,
      status: "live",
      dealType: "manual_session",
      sourceProvider: "manual",
      slug: opts?.slug ?? `manual-${id}`,
      title: "Sunset Fishing Charter",
      region: opts?.region ?? "Auckland",
      salesCutoffMinutes: 60,
      publishedAt: NOW,
      firstPublishedAt: NOW,
      lastAttestedAt: NOW,
      attestationExpiresAt: hoursFrom(NOW, 12),
      bookingDestinationType: "operator_website",
      bookingUrl: "https://harbour.example/book?ref=home",
      bookingInstructions: "Call from the pier",
      appendTrackingParams: true,
      createdAt: NOW,
      updatedAt: NOW,
    });
    seedDeal({ deals: store.deals, audit: store.audit }, deal);

    const session: DealSession = {
      id: `sess-${id}`,
      dealId: id,
      externalSessionId: null,
      startAt: hoursFrom(NOW, 24),
      endAt: null,
      providerSeatsAvailable: null,
      manualSeatsAvailable: opts?.seats ?? 4,
      seatCap: null,
      seatsDisplayed: opts?.seats ?? 4,
      status: "live",
      lastSyncedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    };
    store.sessions.set(session.id, session);
    return { deal, session };
  }

  it("available → redirect URL has utm params and click_id; SyncLog click_recheck", async () => {
    const { store, deal, session } = await createLiveIntegratedDeal();

    const result = await bookDealNow(
      store,
      deal.slug,
      { session_id: session.id, visitor_id: "visitor-a" },
      { now: NOW, skipRateLimit: true }
    );

    expect(result.outcome).toBe("redirect");
    if (result.outcome !== "redirect") return;

    const url = new URL(result.url);
    expect(url.searchParams.get("utm_source")).toBe("travelscout");
    expect(url.searchParams.get("utm_medium")).toBe("referral");
    expect(url.searchParams.get("utm_campaign")).toBe(deal.slug);
    expect(url.searchParams.get("click_id")).toBe(result.click_id);
    expect(result.instructions).toBe("Bring sunscreen");

    const click = [...store.audit.clicks.values()].find(
      (c) => c.clickId === result.click_id
    )!;
    expect(click.recheckResult).toBe("available");
    expect(click.redirectUrl).toBe(result.url);
    expect(click.visitorId).toBe("visitor-a");
    expect(click.dealSessionId).toBe(session.id);

    const logs = [...store.syncLogs!.values()].filter(
      (l) => l.syncType === "click_recheck"
    );
    expect(logs).toHaveLength(1);
    expect(logs[0]!.status).toBe("success");
    expect(logs[0]!.affectedDealIds).toContain(deal.id);
  });

  it("sold out → just_sold_out with alternatives; deal may go sold_out", async () => {
    const { store, deal, session, kayak } = await createLiveIntegratedDeal();

    // Nearby alternative in same region
    seedManualLiveDeal(store, {
      id: "alt-1",
      slug: "alt-harbour-1",
      region: "Auckland",
      seats: 3,
    });

    const ext = store.externalSessions!.get(session.externalSessionId!)!;
    mockController.setSeats(kayak.externalId, ext.externalId, 0);

    const result = await bookDealNow(
      store,
      deal.slug,
      { session_id: session.id, visitor_id: "visitor-b" },
      { now: NOW, skipRateLimit: true }
    );

    expect(result.outcome).toBe("just_sold_out");
    if (result.outcome !== "just_sold_out") return;
    expect(result.alternatives.length).toBeGreaterThanOrEqual(1);
    expect(result.alternatives[0]!.slug).toBe("alt-harbour-1");

    const updatedSession = store.sessions.get(session.id)!;
    expect(updatedSession.status).toBe("sold_out");
    expect(updatedSession.seatsDisplayed).toBe(0);

    const click = [...store.audit.clicks.values()].find(
      (c) => c.clickId === result.click_id
    )!;
    expect(click.recheckResult).toBe("sold_out");

    expect(store.deals.get(deal.id)!.status).toBe("sold_out");
  });

  it("timeout with fresh cache → redirect", async () => {
    const { store, deal, session } = await createLiveIntegratedDeal();
    mockController.setAvailabilityDelayMs(5000); // > CLICK_RECHECK_TIMEOUT_MS

    const result = await bookDealNow(
      store,
      deal.slug,
      { session_id: session.id, visitor_id: "visitor-c" },
      {
        now: NOW,
        skipRateLimit: true,
        config: { ...PLATFORM_DEFAULTS, CLICK_RECHECK_TIMEOUT_MS: 50 },
      }
    );

    expect(result.outcome).toBe("redirect");
    if (result.outcome !== "redirect") return;
    expect(result.url).toContain("click_id=");

    const click = [...store.audit.clicks.values()].find(
      (c) => c.clickId === result.click_id
    )!;
    expect(click.recheckResult).toBe("error");
    expect(click.redirectUrl).toBe(result.url);

    const logs = [...store.syncLogs!.values()].filter(
      (l) => l.syncType === "click_recheck"
    );
    expect(logs[0]!.status).toBe("failed");
  });

  it("timeout with stale cache → cannot_confirm with operator contact", async () => {
    const { store, deal, session } = await createLiveIntegratedDeal();

    // Stale last_synced_at (> 5 minutes)
    store.sessions.set(session.id, {
      ...session,
      lastSyncedAt: hoursFrom(NOW, -1),
      seatsDisplayed: 5,
    });

    mockController.setAvailabilityDelayMs(5000);

    // Ensure operator has public contact
    const op = store.operators.operators.get(deal.operatorId)!;
    store.operators.operators.set(op.id, {
      ...op,
      publicPhone: "+64219998877",
      publicEmail: "book@baycruises.example",
      website: "https://baycruises.example",
    });

    const result = await bookDealNow(
      store,
      deal.slug,
      { session_id: session.id, visitor_id: "visitor-d" },
      {
        now: NOW,
        skipRateLimit: true,
        config: { ...PLATFORM_DEFAULTS, CLICK_RECHECK_TIMEOUT_MS: 50 },
      }
    );

    expect(result.outcome).toBe("cannot_confirm");
    if (result.outcome !== "cannot_confirm") return;
    expect(result.message).toBe("We couldn't confirm live availability");
    expect(result.operator.public_phone).toBe("+64219998877");
    expect(result.operator.public_email).toBe("book@baycruises.example");
    expect(result.operator.website).toBe("https://baycruises.example");
  });

  it("manual deal with current attestation → show_instructions + tracked url", async () => {
    const { store } = freshStore();
    const { deal, session } = seedManualLiveDeal(store);

    const result = await bookDealNow(
      store,
      deal.slug,
      { session_id: session.id, visitor_id: "visitor-manual" },
      { now: NOW, skipRateLimit: true }
    );

    expect(result.outcome).toBe("show_instructions");
    if (result.outcome !== "show_instructions") return;
    expect(result.booking_instructions).toBe("Call from the pier");
    expect(result.url).toContain("utm_source=travelscout");
    expect(result.url).toContain(`click_id=${result.click_id}`);
    expect(result.destination.type).toBe("operator_website");
  });

  it("manual deal with expired attestation → unavailable", async () => {
    const { store } = freshStore();
    const { deal, session } = seedManualLiveDeal(store);
    store.deals.set(deal.id, {
      ...deal,
      attestationExpiresAt: hoursFrom(NOW, -1),
    });

    const result = await bookDealNow(
      store,
      deal.slug,
      { session_id: session.id, visitor_id: "visitor-expired" },
      { now: NOW, skipRateLimit: true }
    );

    expect(result.outcome).toBe("unavailable");
  });

  it("not visible deal → unavailable with alternatives", async () => {
    const { store, deal, session } = await createLiveIntegratedDeal();
    seedManualLiveDeal(store, {
      id: "alt-2",
      slug: "alt-visible",
      region: "Auckland",
    });

    // Hide by pausing
    transitionDeal(store, deal.id, "paused", {
      actor: { type: "user", id: ACTOR.id },
      reason: "operator",
      now: NOW,
    });

    const result = await bookDealNow(
      store,
      deal.slug,
      { session_id: session.id, visitor_id: "visitor-hidden" },
      { now: NOW, skipRateLimit: true }
    );

    expect(result.outcome).toBe("unavailable");
    if (result.outcome !== "unavailable") return;
    expect(result.alternatives.some((a) => a.slug === "alt-visible")).toBe(
      true
    );
  });

  it("phone destination builds tel: link", async () => {
    const { store } = freshStore();
    const { deal, session } = seedManualLiveDeal(store);
    store.deals.set(deal.id, {
      ...store.deals.get(deal.id)!,
      bookingDestinationType: "phone",
      bookingPhone: "+64211234567",
      bookingUrl: null,
    });

    const result = await bookDealNow(
      store,
      deal.slug,
      { session_id: session.id, visitor_id: "visitor-phone" },
      { now: NOW, skipRateLimit: true }
    );

    expect(result.outcome).toBe("show_instructions");
    if (result.outcome !== "show_instructions") return;
    expect(result.url).toBe("tel:+64211234567");
  });

  it("rate-limits by visitor_id", async () => {
    const { store, deal, session } = await createLiveIntegratedDeal();

    for (let i = 0; i < 30; i++) {
      await bookDealNow(
        store,
        deal.slug,
        { session_id: session.id, visitor_id: "same-visitor" },
        { now: NOW }
      );
    }

    await expect(
      bookDealNow(
        store,
        deal.slug,
        { session_id: session.id, visitor_id: "same-visitor" },
        { now: NOW }
      )
    ).rejects.toMatchObject({
      name: "DealBookNowError",
      status: 429,
    } satisfies Partial<DealBookNowError>);
  });

  it("adapter error with fresh cache still redirects", async () => {
    const { store, deal, session } = await createLiveIntegratedDeal();

    const result = await bookDealNow(
      store,
      deal.slug,
      { session_id: session.id, visitor_id: "visitor-err" },
      {
        now: NOW,
        skipRateLimit: true,
        getAvailabilityFn: async () => {
          throw new AdapterOperationError("rezdy", "timeout", "forced timeout");
        },
      }
    );

    expect(result.outcome).toBe("redirect");
  });
});
