import { describe, expect, it } from "vitest";
import { addDealMedia } from "@/lib/marketplace/deal-media";
import {
  createDealDraftStore,
  createDraftDeal,
  getDealDetail,
  seedDealPriceOption,
  seedDealSession,
  updateDraftDeal,
} from "@/lib/marketplace/deal-draft";
import {
  validateDealInStore,
  validateForPublish,
} from "@/lib/marketplace/deal-publish-validation";
import { makeDealFixture, seedDeal } from "@/lib/marketplace/deal-status";
import { seedDevMarketplace, DEV_SEED_IDS } from "@/lib/marketplace/seed-dev";
import type { DealSession, DealPriceOption } from "@/lib/marketplace/deal-session";

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

function tomorrowStart(): string {
  // ~24h after NOW → within MAX_LEAD_HOURS (72)
  return "2026-10-21T05:00:00.000Z";
}

function inFiveDays(): string {
  return "2026-10-25T05:00:00.000Z";
}

async function seedIncompleteDraft() {
  const { store } = harbourStore();
  const deal = createDraftDeal(store, {
    operatorId: DEV_SEED_IDS.harbourKayaks.operatorId,
    dealType: "manual_session",
    actor: ACTOR,
    now: NOW,
    id: "incomplete-1",
  });
  return { store, deal };
}

async function seedCompleteManualDraft(opts?: {
  sessionStart?: string;
  attested?: boolean;
}) {
  const { store } = harbourStore();
  const deal = createDraftDeal(store, {
    operatorId: DEV_SEED_IDS.harbourKayaks.operatorId,
    dealType: "manual_session",
    actor: ACTOR,
    now: NOW,
    id: "complete-1",
  });

  const description =
    "<p>" +
    "A guided harbour kayak paddle past the city skyline with a stop for photos. ".repeat(
      3
    ) +
    "</p>";

  updateDraftDeal(
    store,
    deal.id,
    {
      title: "Harbour Kayak Morning Tour",
      summary: "Paddle the harbour with a local guide at sunrise.",
      description,
      category: "water",
      location_name: "Viaduct Harbour",
      address: "1 Quay St, Auckland",
      latitude: -36.84,
      longitude: 174.76,
      region: "Auckland",
      languages: ["en"],
      cancellation_policy_type: "operator_standard",
      duration_minutes: 120,
      booking_destination_type: "operator_website",
      booking_url: "https://harbour.example/book",
      link_status: "ok",
      link_last_checked_at: NOW,
    },
    { actor: ACTOR, now: NOW }
  );

  const updated = store.deals.get(deal.id)!;
  // ensure link fields survived client strip (link_* are system — set directly)
  store.deals.set(deal.id, {
    ...updated,
    linkStatus: "ok",
    linkLastCheckedAt: NOW,
    linkConsecutiveFailures: 0,
    ...(opts?.attested
      ? {
          lastAttestedAt: NOW,
          attestationExpiresAt: "2026-10-20T17:00:00.000Z",
        }
      : {}),
  });

  addDealMedia(
    store.media,
    {
      dealId: deal.id,
      mediaType: "image",
      source: "upload",
      url: "https://cdn.example.com/kayak.jpg",
      altText: "Kayakers on the harbour at sunrise",
      isCover: true,
      sortOrder: 0,
    },
    { id: "img-1", now: NOW }
  );

  const session: DealSession = {
    id: "sess-1",
    dealId: deal.id,
    externalSessionId: null,
    startAt: opts?.sessionStart ?? tomorrowStart(),
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

  store.evidenceUrlChecks = new Map([
    [
      "opt-1",
      {
        priceOptionId: "opt-1",
        dealId: deal.id,
        url: "https://harbour.example/prices",
        checkedAt: NOW,
        ok: true,
        status: 200,
        error: null,
      },
    ],
  ]);

  return { store, dealId: deal.id };
}

describe("validateForPublish — incomplete draft", () => {
  it("returns failing checks with the right editorStep", async () => {
    const { store, deal } = await seedIncompleteDraft();
    const result = await validateDealInStore(store, deal.id, {
      now: NOW,
      refreshStaleLinks: false,
    });

    expect(result.ok).toBe(false);

    const byKey = Object.fromEntries(result.checks.map((c) => [c.key, c]));

    expect(byKey.required_fields.passed).toBe(false);
    expect(byKey.required_fields.editorStep).toMatch(
      /content|pricing|availability|destination/
    );
    expect(byKey.required_fields.message).toMatch(/Missing or invalid/);

    expect(byKey.min_discount.passed).toBe(false);
    expect(byKey.min_discount.editorStep).toBe("pricing");

    expect(byKey.images.passed).toBe(false);
    expect(byKey.images.editorStep).toBe("images");

    expect(byKey.session_timing.passed).toBe(false);
    expect(byKey.session_timing.editorStep).toBe("availability");

    expect(byKey.booking_destination.passed).toBe(false);
    expect(byKey.booking_destination.editorStep).toBe("destination");

    expect(byKey.price_evidence.passed).toBe(false);
    expect(byKey.price_evidence.editorStep).toBe("pricing");

    expect(byKey.seats_entered.passed).toBe(false);
    expect(byKey.seats_entered.editorStep).toBe("availability");

    expect(byKey.attestation.passed).toBe(false);
    expect(byKey.attestation.editorStep).toBe("review");

    // No integrated stubs on a manual deal
    expect(byKey.integration_healthy).toBeUndefined();
  });
});

describe("validateForPublish — complete manual draft", () => {
  it("passes when attested and fully filled", async () => {
    const { store, dealId } = await seedCompleteManualDraft({
      attested: true,
    });
    const result = await validateDealInStore(store, dealId, {
      now: NOW,
      attested: true,
      refreshStaleLinks: false,
    });

    expect(result.ok).toBe(true);
    expect(result.hasSessionWithinLeadHours).toBe(true);
    for (const c of result.checks) {
      expect(c.passed, `${c.key}: ${c.message}`).toBe(true);
    }
  });

  it("reports scheduled (no session within lead hours) but still passes timing", async () => {
    const { store, dealId } = await seedCompleteManualDraft({
      sessionStart: inFiveDays(),
      attested: true,
    });
    const result = await validateDealInStore(store, dealId, {
      now: NOW,
      attested: true,
      refreshStaleLinks: false,
    });

    expect(result.ok).toBe(true);
    expect(result.hasSessionWithinLeadHours).toBe(false);
    const timing = result.checks.find((c) => c.key === "session_timing")!;
    expect(timing.passed).toBe(true);
    expect(timing.message).toMatch(/will schedule/i);
  });

  it("fails attestation until publish confirms seats", async () => {
    const { store, dealId } = await seedCompleteManualDraft();
    const result = await validateDealInStore(store, dealId, {
      now: NOW,
      refreshStaleLinks: false,
    });
    expect(result.ok).toBe(false);
    const att = result.checks.find((c) => c.key === "attestation")!;
    expect(att.passed).toBe(false);
    expect(att.editorStep).toBe("review");
  });
});

describe("validateForPublish — integrated stubs", () => {
  it("includes not-yet-built integrated checks", async () => {
    const { store } = harbourStore();
    const deal = makeDealFixture({
      id: "int-1",
      operatorId: DEV_SEED_IDS.harbourKayaks.operatorId,
      dealType: "integrated_session",
      sourceProvider: "rezdy",
      capacityMode: "live_provider",
      status: "draft",
      createdAt: NOW,
      updatedAt: NOW,
    });
    seedDeal({ deals: store.deals, audit: store.audit }, deal);

    const result = await validateForPublish(store.deals.get(deal.id)!, {
      sessions: [],
      priceOptions: [],
      discountSteps: [],
      media: [],
      now: NOW,
    });

    const stubKeys = [
      "integration_healthy",
      "product_active",
      "original_price_locked",
      "discount_in_provider",
      "promo_code_confirmed",
      "session_available",
    ];
    for (const key of stubKeys) {
      const c = result.checks.find((x) => x.key === key);
      expect(c, key).toBeDefined();
      expect(c!.passed).toBe(false);
      expect(c!.message).toMatch(/Not yet built/i);
    }
  });
});

describe("getDealDetail validation block", () => {
  it("includes real checks for an incomplete draft", async () => {
    const { store, deal } = await seedIncompleteDraft();
    const detail = await getDealDetail(store, deal.id, {
      now: NOW,
      refreshStaleLinks: false,
    });
    expect(detail.validation.ok).toBe(false);
    expect(detail.validation.checks.length).toBeGreaterThan(0);
    expect(
      detail.validation.checks.every(
        (c) => c.editorStep != null && c.key != null
      )
    ).toBe(true);
  });

  it("passes for a complete attested deal", async () => {
    const { store, dealId } = await seedCompleteManualDraft({
      attested: true,
    });
    const detail = await getDealDetail(store, dealId, {
      now: NOW,
      attested: true,
      refreshStaleLinks: false,
    });
    expect(detail.validation.ok).toBe(true);
  });
});

describe("min_discount on options", () => {
  it("fails when a price option is under 50% off", async () => {
    const { store, dealId } = await seedCompleteManualDraft({
      attested: true,
    });
    const opt = store.priceOptions.get("opt-1")!;
    store.priceOptions.set("opt-1", {
      ...opt,
      dealPriceMinor: 11000, // only 45% off $200
    });

    const result = await validateDealInStore(store, dealId, {
      now: NOW,
      attested: true,
      refreshStaleLinks: false,
    });
    const min = result.checks.find((c) => c.key === "min_discount")!;
    expect(min.passed).toBe(false);
    expect(min.editorStep).toBe("pricing");
  });
});
