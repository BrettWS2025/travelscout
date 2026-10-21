import { describe, expect, it } from "vitest";
import {
  archiveDeal,
  bulkDealActions,
  DealActionsError,
  endDeal,
  markDealSoldOut,
  pauseDeal,
  resumeDeal,
  updateDealSeats,
} from "@/lib/marketplace/deal-actions";
import { listDealEvents } from "@/lib/marketplace/deal-audit";
import { addDealMedia } from "@/lib/marketplace/deal-media";
import {
  createDealDraftStore,
  createDraftDeal,
  seedDealPriceOption,
  seedDealSession,
  updateDraftDeal,
} from "@/lib/marketplace/deal-draft";
import {
  approveDeal,
  publishDeal,
} from "@/lib/marketplace/deal-publish";
import {
  applyAutoPause,
  makeDealFixture,
  seedDeal,
  transitionDeal,
} from "@/lib/marketplace/deal-status";
import { getPlatformConfig } from "@/lib/marketplace/config";
import { seedOperatorWithOwner } from "@/lib/marketplace/operators";
import { seedDevMarketplace, DEV_SEED_IDS } from "@/lib/marketplace/seed-dev";
import type { DealSession, DealPriceOption } from "@/lib/marketplace/deal-session";

const NOW = "2026-10-20T05:00:00.000Z";
const ACTOR = {
  type: "user" as const,
  id: DEV_SEED_IDS.harbourKayaks.managerUserId,
};
const ADMIN = { type: "admin" as const, id: "admin-user-1" };

function tomorrowStart(): string {
  return "2026-10-21T05:00:00.000Z";
}

function inFiveDays(): string {
  return "2026-10-25T05:00:00.000Z";
}

function freshStore() {
  const seeded = seedDevMarketplace({ now: NOW });
  const store = createDealDraftStore(seeded.store);
  const { operator } = seedOperatorWithOwner(store.operators, {
    legalName: "Actions Tours Ltd",
    tradingName: "Actions Tours",
    slug: `actions-tours-${crypto.randomUUID().slice(0, 8)}`,
    ownerUserId: "actions-owner-1",
    ownerEmail: "owner@actions.example",
    accountStatus: "active",
  });
  // Bypass manual review so publish goes straight to live/scheduled.
  store.operators.operators.set(operator.id, {
    ...operator,
    requiresManualReview: false,
  });
  return { store, operatorId: operator.id };
}

async function seedCompleteManualDraft(
  store: ReturnType<typeof createDealDraftStore>,
  operatorId: string,
  opts?: { sessionStart?: string; id?: string; seats?: number }
) {
  const id = opts?.id ?? crypto.randomUUID();
  createDraftDeal(store, {
    operatorId,
    dealType: "manual_session",
    actor: ACTOR,
    now: NOW,
    id,
  });

  const description =
    "<p>" +
    "A guided harbour kayak paddle past the city skyline with a stop for photos. ".repeat(
      3
    ) +
    "</p>";

  updateDraftDeal(
    store,
    id,
    {
      title: `Actions Tour ${id.slice(0, 6)}`,
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
      booking_destination_type: "phone",
      booking_phone: "+64211234567",
    },
    { actor: ACTOR, now: NOW }
  );

  addDealMedia(
    store.media,
    {
      dealId: id,
      mediaType: "image",
      source: "upload",
      url: "https://cdn.example.com/kayak.jpg",
      altText: "Kayakers on the harbour at sunrise",
      isCover: true,
      sortOrder: 0,
    },
    { id: `img-${id}`, now: NOW }
  );

  const seats = opts?.seats ?? 6;
  const session: DealSession = {
    id: `sess-${id}`,
    dealId: id,
    externalSessionId: null,
    startAt: opts?.sessionStart ?? tomorrowStart(),
    endAt: null,
    providerSeatsAvailable: null,
    manualSeatsAvailable: seats,
    seatCap: null,
    seatsDisplayed: seats,
    status: "live",
    lastSyncedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
  seedDealSession(store, session);

  const option: DealPriceOption = {
    id: `opt-${id}`,
    dealId: id,
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

  if (!store.evidenceUrlChecks) store.evidenceUrlChecks = new Map();
  store.evidenceUrlChecks.set(option.id, {
    priceOptionId: option.id,
    dealId: id,
    url: "https://harbour.example/prices",
    checkedAt: NOW,
    ok: true,
    status: 200,
    error: null,
  });

  return { dealId: id, sessionId: session.id };
}

/** Publish enough deals so MANUAL_REVIEW_COUNT is satisfied, then return a live deal. */
async function makeLiveManualDeal(
  store: ReturnType<typeof createDealDraftStore>,
  operatorId: string,
  opts?: { sessionStart?: string; id?: string; seats?: number }
) {
  const reviewCount = getPlatformConfig().MANUAL_REVIEW_COUNT;
  const approved = [...store.deals.values()].filter(
    (d) =>
      d.operatorId === operatorId &&
      listDealEvents(store.audit, d.id).some((e) => e.eventType === "approved")
  ).length;

  for (let i = approved; i < reviewCount; i++) {
    const { dealId } = await seedCompleteManualDraft(store, operatorId, {
      id: `warmup-${operatorId.slice(0, 4)}-${i}`,
      sessionStart: tomorrowStart(),
    });
    await publishDeal(store, dealId, {
      actor: ACTOR,
      attest: true,
      now: NOW,
      skipLinkCheck: true,
    });
    // Warmup deals may land in pending_review if review count not yet met.
    const status = store.deals.get(dealId)!.status;
    if (status === "pending_review") {
      await approveDeal(store, dealId, {
        actor: ADMIN,
        now: NOW,
        skipLinkCheck: true,
      });
    }
  }

  const { dealId, sessionId } = await seedCompleteManualDraft(
    store,
    operatorId,
    opts
  );
  const published = await publishDeal(store, dealId, {
    actor: ACTOR,
    attest: true,
    now: NOW,
    skipLinkCheck: true,
  });
  if (published.deal.status === "pending_review") {
    await approveDeal(store, dealId, {
      actor: ADMIN,
      now: NOW,
      skipLinkCheck: true,
    });
  }
  return { dealId, sessionId };
}

describe("Chunk 19 operator actions", () => {
  it("pause live → paused with reason operator", async () => {
    const { store, operatorId } = freshStore();
    const { dealId } = await makeLiveManualDeal(store, operatorId);
    expect(store.deals.get(dealId)?.status).toBe("live");

    const paused = pauseDeal(store, dealId, { actor: ACTOR, now: NOW });
    expect(paused.status).toBe("paused");
    expect(paused.pauseReason).toBe("operator");
    const events = listDealEvents(store.audit, dealId).map((e) => e.eventType);
    expect(events).toContain("paused");
  });

  it("resume with expired manual attestation without attest → 422", async () => {
    const { store, operatorId } = freshStore();
    const { dealId } = await makeLiveManualDeal(store, operatorId);

    pauseDeal(store, dealId, { actor: ACTOR, now: NOW });

    // Expire attestation
    const deal = store.deals.get(dealId)!;
    store.deals.set(dealId, {
      ...deal,
      attestationExpiresAt: "2026-10-19T05:00:00.000Z",
      lastAttestedAt: "2026-10-19T00:00:00.000Z",
    });

    await expect(
      resumeDeal(store, dealId, { actor: ACTOR, now: NOW })
    ).rejects.toMatchObject({
      name: "DealActionsError",
      status: 422,
    });

    expect(store.deals.get(dealId)?.status).toBe("paused");
  });

  it("resume with attest after expired attestation → live", async () => {
    const { store, operatorId } = freshStore();
    const { dealId } = await makeLiveManualDeal(store, operatorId);
    pauseDeal(store, dealId, { actor: ACTOR, now: NOW });

    const deal = store.deals.get(dealId)!;
    store.deals.set(dealId, {
      ...deal,
      attestationExpiresAt: "2026-10-19T05:00:00.000Z",
    });

    const resumed = await resumeDeal(store, dealId, {
      actor: ACTOR,
      attest: true,
      now: NOW,
    });

    expect(resumed.deal.status).toBe("live");
    expect(resumed.target_status).toBe("live");
    expect(resumed.attestation).not.toBeNull();
    expect(resumed.deal.attestationExpiresAt).toBe(
      new Date(
        Date.parse(NOW) +
          getPlatformConfig().MANUAL_ATTESTATION_HOURS * 3600_000
      ).toISOString()
    );
  });

  it("resume with no session within 72h → scheduled", async () => {
    const { store, operatorId } = freshStore();
    const { dealId } = await makeLiveManualDeal(store, operatorId, {
      sessionStart: inFiveDays(),
      id: "far-session",
    });
    // Publish/approve may have left it scheduled already; force live then pause.
    const current = store.deals.get(dealId)!;
    if (current.status === "scheduled") {
      transitionDeal(
        { deals: store.deals, audit: store.audit },
        dealId,
        "live",
        { actor: ACTOR, now: NOW }
      );
    }
    // Ensure we can pause from live — if still scheduled, pause from scheduled.
    const beforePause = store.deals.get(dealId)!;
    if (beforePause.status === "live" || beforePause.status === "scheduled") {
      pauseDeal(store, dealId, { actor: ACTOR, now: NOW });
    }

    const resumed = await resumeDeal(store, dealId, {
      actor: ACTOR,
      now: NOW,
    });
    expect(resumed.target_status).toBe("scheduled");
    expect(resumed.deal.status).toBe("scheduled");
  });

  it("end → ended; archive from ended", async () => {
    const { store, operatorId } = freshStore();
    const { dealId } = await makeLiveManualDeal(store, operatorId);

    const ended = endDeal(store, dealId, { actor: ACTOR, now: NOW });
    expect(ended.status).toBe("ended");
    expect(ended.endedAt).toBe(NOW);

    const archived = archiveDeal(store, dealId, { actor: ACTOR, now: NOW });
    expect(archived.status).toBe("archived");
  });

  it("update seats and mark sold out", async () => {
    const { store, operatorId } = freshStore();
    const { dealId, sessionId } = await makeLiveManualDeal(store, operatorId);

    const updated = updateDealSeats(store, dealId, {
      actor: ACTOR,
      seats: { [sessionId]: 2 },
      now: NOW,
    });
    expect(updated.sessions.find((s) => s.id === sessionId)?.manualSeatsAvailable).toBe(
      2
    );
    expect(
      listDealEvents(store.audit, dealId).some((e) => e.eventType === "seats_changed")
    ).toBe(true);

    const sold = markDealSoldOut(store, dealId, { actor: ACTOR, now: NOW });
    expect(sold.deal.status).toBe("sold_out");
    expect(
      sold.sessions.every((s) => s.manualSeatsAvailable === 0)
    ).toBe(true);
  });

  it("bulk pause 3 deals — one already ended fails, others succeed", async () => {
    const { store, operatorId } = freshStore();
    const a = await makeLiveManualDeal(store, operatorId, { id: "bulk-a" });
    const b = await makeLiveManualDeal(store, operatorId, { id: "bulk-b" });
    const c = await makeLiveManualDeal(store, operatorId, { id: "bulk-c" });

    endDeal(store, c.dealId, { actor: ACTOR, now: NOW });

    await expect(
      bulkDealActions(store, operatorId, {
        action: "pause",
        dealIds: [a.dealId, b.dealId, c.dealId],
        actor: ACTOR,
        now: NOW,
      })
    ).rejects.toMatchObject({
      name: "DealActionsError",
      message: expect.stringMatching(/confirm/i),
    });

    const result = await bulkDealActions(store, operatorId, {
      action: "pause",
      dealIds: [a.dealId, b.dealId, c.dealId],
      confirm: true,
      actor: ACTOR,
      now: NOW,
    });

    expect(result.results).toHaveLength(3);
    const byId = Object.fromEntries(result.results.map((r) => [r.id, r]));
    expect(byId[a.dealId].ok).toBe(true);
    expect(byId[b.dealId].ok).toBe(true);
    expect(byId[c.dealId].ok).toBe(false);
    expect(byId[c.dealId].error).toMatch(/ended|Pause/i);

    expect(store.deals.get(a.dealId)?.status).toBe("paused");
    expect(store.deals.get(b.dealId)?.status).toBe("paused");
    expect(store.deals.get(c.dealId)?.status).toBe("ended");
  });

  it("bulk mark_sold_out skips integrated deals", async () => {
    const { store, operatorId } = freshStore();
    const manual = await makeLiveManualDeal(store, operatorId, {
      id: "bulk-manual",
    });

    // Seed an integrated live deal for the same operator.
    const integratedId = "bulk-integrated";
    seedDeal(
      { deals: store.deals, audit: store.audit },
      makeDealFixture({
        id: integratedId,
        operatorId,
        dealType: "integrated_session",
        sourceProvider: "rezdy",
        capacityMode: "live_provider",
        status: "live",
        createdAt: NOW,
        updatedAt: NOW,
      })
    );

    const result = await bulkDealActions(store, operatorId, {
      action: "mark_sold_out",
      dealIds: [manual.dealId, integratedId],
      actor: ACTOR,
      now: NOW,
    });

    const byId = Object.fromEntries(result.results.map((r) => [r.id, r]));
    expect(byId[manual.dealId].ok).toBe(true);
    expect(store.deals.get(manual.dealId)?.status).toBe("sold_out");
    expect(byId[integratedId].ok).toBe(false);
    expect(byId[integratedId].error).toMatch(/manual/i);
  });

  it("resume from auto_paused with expired attestation requires attest", async () => {
    const { store, operatorId } = freshStore();
    const { dealId } = await makeLiveManualDeal(store, operatorId);

    applyAutoPause(
      { deals: store.deals, audit: store.audit },
      dealId,
      "attestation_expired",
      "Seats not reconfirmed",
      { actor: { type: "system" }, now: NOW }
    );

    store.deals.set(dealId, {
      ...store.deals.get(dealId)!,
      attestationExpiresAt: "2026-10-19T00:00:00.000Z",
    });

    await expect(
      resumeDeal(store, dealId, { actor: ACTOR, now: NOW })
    ).rejects.toBeInstanceOf(DealActionsError);

    const resumed = await resumeDeal(store, dealId, {
      actor: ACTOR,
      attest: true,
      now: NOW,
    });
    expect(resumed.deal.status).toBe("live");
    expect(resumed.deal.pauseReason).toBeNull();
  });
});
