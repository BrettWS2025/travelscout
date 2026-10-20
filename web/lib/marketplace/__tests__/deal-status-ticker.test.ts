import { describe, expect, it, vi } from "vitest";
import { listDealEvents } from "@/lib/marketplace/deal-audit";
import { getPlatformConfig } from "@/lib/marketplace/config";
import {
  createDealDraftStore,
  seedDealPriceOption,
  seedDealSession,
} from "@/lib/marketplace/deal-draft";
import {
  applyCurrentDiscountSteps,
  filterVisibleToTravellers,
  isVisibleToTravellers,
  runStatusTickerJob,
  tickDealStatus,
} from "@/lib/marketplace/deal-status-ticker";
import {
  makeDealFixture,
  seedDeal,
  transitionDeal,
} from "@/lib/marketplace/deal-status";
import type { DealSession, DealPriceOption } from "@/lib/marketplace/deal-session";
import type { PublishValidationOutcome } from "@/lib/marketplace/deal-publish-validation";

const NOW = "2026-10-20T12:00:00.000Z";
const OPERATOR_ID = "op-ticker-1";
const SYSTEM = { type: "system" as const };

function hoursFrom(baseIso: string, hours: number): string {
  return new Date(Date.parse(baseIso) + hours * 3600_000).toISOString();
}

function daysFrom(baseIso: string, days: number): string {
  return new Date(Date.parse(baseIso) + days * 24 * 3600_000).toISOString();
}

function okValidation(): PublishValidationOutcome {
  return { ok: true, checks: [], hasSessionWithinLeadHours: true };
}

function session(
  dealId: string,
  overrides: Partial<DealSession> & Pick<DealSession, "id" | "startAt">
): DealSession {
  return {
    dealId,
    externalSessionId: null,
    endAt: null,
    providerSeatsAvailable: null,
    manualSeatsAvailable: 4,
    seatCap: null,
    seatsDisplayed: overrides.seatsDisplayed ?? overrides.manualSeatsAvailable ?? 4,
    status: "live",
    lastSyncedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function seedScheduledDeal(opts?: {
  id?: string;
  publishAt?: string | null;
  sessionStart?: string;
  seats?: number;
  now?: string;
}) {
  const store = createDealDraftStore();
  const now = opts?.now ?? NOW;
  const id = opts?.id ?? "deal-scheduled-1";
  const deal = makeDealFixture({
    id,
    operatorId: OPERATOR_ID,
    status: "scheduled",
    salesCutoffMinutes: 60,
    publishAt: opts?.publishAt === undefined ? null : opts.publishAt,
    publishedAt: now,
    firstPublishedAt: now,
    lastAttestedAt: now,
    attestationExpiresAt: hoursFrom(now, 12),
    bookingDestinationType: "phone",
    bookingPhone: "+64211234567",
    createdAt: now,
    updatedAt: now,
  });
  seedDeal({ deals: store.deals, audit: store.audit }, deal);

  seedDealSession(
    store,
    session(id, {
      id: `sess-${id}`,
      startAt: opts?.sessionStart ?? hoursFrom(now, 24),
      manualSeatsAvailable: opts?.seats ?? 4,
      seatsDisplayed: opts?.seats ?? 4,
    })
  );

  const option: DealPriceOption = {
    id: `opt-${id}`,
    dealId: id,
    label: "Adult",
    type: "adult",
    externalPriceOptionId: null,
    externalDealPriceOptionId: null,
    originalPriceMinor: 20000,
    originalPriceSource: "operator_entered",
    originalPriceEvidenceUrl: "https://example.com/prices",
    dealPriceMinor: 9000,
    discountPct: 55,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  };
  seedDealPriceOption(store, option);
  store.evidenceUrlChecks = new Map([
    [
      option.id,
      {
        priceOptionId: option.id,
        dealId: id,
        url: "https://example.com/prices",
        checkedAt: now,
        ok: true,
        status: 200,
        error: null,
      },
    ],
  ]);

  return { store, dealId: id };
}

describe("isVisibleToTravellers", () => {
  it("true only when live with a sellable session within MAX_LEAD_HOURS", () => {
    const deal = makeDealFixture({
      id: "vis-1",
      operatorId: OPERATOR_ID,
      status: "live",
      salesCutoffMinutes: 60,
    });
    const within = [
      session("vis-1", {
        id: "s1",
        startAt: hoursFrom(NOW, 24),
        seatsDisplayed: 3,
      }),
    ];
    expect(isVisibleToTravellers(deal, within, NOW)).toBe(true);

    const beyond = [
      session("vis-1", {
        id: "s1",
        startAt: hoursFrom(NOW, 80),
        seatsDisplayed: 3,
      }),
    ];
    expect(isVisibleToTravellers(deal, beyond, NOW)).toBe(false);

    const pastCutoff = [
      session("vis-1", {
        id: "s1",
        // start in 30 min, cutoff 60 → already past cutoff
        startAt: hoursFrom(NOW, 0.5),
        seatsDisplayed: 3,
      }),
    ];
    expect(isVisibleToTravellers(deal, pastCutoff, NOW)).toBe(false);

    expect(
      isVisibleToTravellers({ ...deal, status: "scheduled" }, within, NOW)
    ).toBe(false);
  });

  it("filterVisibleToTravellers keeps only visible deals", () => {
    const live = makeDealFixture({
      id: "a",
      operatorId: OPERATOR_ID,
      status: "live",
      salesCutoffMinutes: 0,
    });
    const paused = makeDealFixture({
      id: "b",
      operatorId: OPERATOR_ID,
      status: "paused",
      salesCutoffMinutes: 0,
    });
    const sessions = new Map<string, DealSession[]>([
      [
        "a",
        [
          session("a", {
            id: "sa",
            startAt: hoursFrom(NOW, 10),
            seatsDisplayed: 2,
          }),
        ],
      ],
      [
        "b",
        [
          session("b", {
            id: "sb",
            startAt: hoursFrom(NOW, 10),
            seatsDisplayed: 2,
          }),
        ],
      ],
    ]);
    const visible = filterVisibleToTravellers([live, paused], sessions, NOW);
    expect(visible.map((d) => d.id)).toEqual(["a"]);
  });
});

describe("runStatusTickerJob", () => {
  it("scheduled → live when publish_at reached and session within lead hours", async () => {
    const { store, dealId } = seedScheduledDeal({
      publishAt: hoursFrom(NOW, -1),
      sessionStart: hoursFrom(NOW, 24),
    });

    const first = await runStatusTickerJob(store, {
      now: NOW,
      validate: async () => okValidation(),
    });
    expect(store.deals.get(dealId)?.status).toBe("live");
    expect(first.transitions).toBe(1);

    const eventsAfterFirst = listDealEvents(store.audit, dealId);
    const publishedCount = eventsAfterFirst.filter(
      (e) => e.eventType === "published"
    ).length;
    expect(publishedCount).toBe(1);

    // Idempotent: second run at same clock → no duplicate events
    const second = await runStatusTickerJob(store, {
      now: NOW,
      validate: async () => okValidation(),
    });
    expect(second.transitions).toBe(0);
    expect(
      listDealEvents(store.audit, dealId).filter((e) => e.eventType === "published")
    ).toHaveLength(1);
  });

  it("stays scheduled when publish_at is still in the future", async () => {
    const { store, dealId } = seedScheduledDeal({
      publishAt: hoursFrom(NOW, 2),
      sessionStart: hoursFrom(NOW, 24),
    });
    await runStatusTickerJob(store, {
      now: NOW,
      validate: async () => okValidation(),
    });
    expect(store.deals.get(dealId)?.status).toBe("scheduled");
  });

  it("stays scheduled when no session within MAX_LEAD_HOURS", async () => {
    const { store, dealId } = seedScheduledDeal({
      publishAt: null,
      sessionStart: hoursFrom(NOW, 80),
    });
    await runStatusTickerJob(store, {
      now: NOW,
      validate: async () => okValidation(),
    });
    expect(store.deals.get(dealId)?.status).toBe("scheduled");
  });

  it("stays scheduled when validateForPublish fails", async () => {
    const { store, dealId } = seedScheduledDeal({
      publishAt: null,
      sessionStart: hoursFrom(NOW, 24),
    });
    await runStatusTickerJob(store, {
      now: NOW,
      validate: async () => ({
        ok: false,
        checks: [
          {
            key: "images",
            label: "Images",
            passed: false,
            message: "need image",
            editorStep: "images",
          },
        ],
      }),
    });
    expect(store.deals.get(dealId)?.status).toBe("scheduled");
  });

  it("expires sessions past sales cutoff", async () => {
    const store = createDealDraftStore();
    const deal = makeDealFixture({
      id: "deal-sess-exp",
      operatorId: OPERATOR_ID,
      status: "live",
      salesCutoffMinutes: 120,
      publishedAt: NOW,
      firstPublishedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    });
    seedDeal({ deals: store.deals, audit: store.audit }, deal);

    // start in 1h, cutoff 2h → past cutoff now
    seedDealSession(
      store,
      session(deal.id, {
        id: "sess-past",
        startAt: hoursFrom(NOW, 1),
        status: "live",
        seatsDisplayed: 2,
      })
    );
    // still sellable
    seedDealSession(
      store,
      session(deal.id, {
        id: "sess-ok",
        startAt: hoursFrom(NOW, 48),
        status: "live",
        seatsDisplayed: 2,
      })
    );

    await runStatusTickerJob(store, { now: NOW });
    expect(store.sessions.get("sess-past")?.status).toBe("expired");
    expect(store.sessions.get("sess-ok")?.status).toBe("live");
    expect(store.deals.get(deal.id)?.status).toBe("live");
  });

  it("expires deal when every session is expired or cancelled", async () => {
    const store = createDealDraftStore();
    const deal = makeDealFixture({
      id: "deal-all-gone",
      operatorId: OPERATOR_ID,
      status: "live",
      salesCutoffMinutes: 0,
      publishedAt: NOW,
      firstPublishedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    });
    seedDeal({ deals: store.deals, audit: store.audit }, deal);
    seedDealSession(
      store,
      session(deal.id, {
        id: "s1",
        startAt: hoursFrom(NOW, -2),
        status: "live",
        seatsDisplayed: 0,
      })
    );
    seedDealSession(
      store,
      session(deal.id, {
        id: "s2",
        startAt: hoursFrom(NOW, 10),
        status: "cancelled",
        seatsDisplayed: 0,
      })
    );

    await runStatusTickerJob(store, { now: NOW });
    expect(store.sessions.get("s1")?.status).toBe("expired");
    expect(store.deals.get(deal.id)?.status).toBe("expired");
    expect(
      listDealEvents(store.audit, deal.id).some((e) => e.eventType === "expired")
    ).toBe(true);

    const again = await runStatusTickerJob(store, { now: NOW });
    expect(again.transitions).toBe(0);
    expect(
      listDealEvents(store.audit, deal.id).filter((e) => e.eventType === "expired")
    ).toHaveLength(1);
  });

  it("live → sold_out when every remaining session has 0 seats; sold_out → live when seats return", async () => {
    const store = createDealDraftStore();
    const deal = makeDealFixture({
      id: "deal-soldout",
      operatorId: OPERATOR_ID,
      status: "live",
      salesCutoffMinutes: 0,
      publishedAt: NOW,
      firstPublishedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    });
    seedDeal({ deals: store.deals, audit: store.audit }, deal);
    seedDealSession(
      store,
      session(deal.id, {
        id: "s-zero",
        startAt: hoursFrom(NOW, 24),
        manualSeatsAvailable: 0,
        seatsDisplayed: 0,
        status: "live",
      })
    );

    await runStatusTickerJob(store, { now: NOW });
    expect(store.deals.get(deal.id)?.status).toBe("sold_out");

    // Seats reappear (operator / sync update)
    const s = store.sessions.get("s-zero")!;
    store.sessions.set("s-zero", {
      ...s,
      manualSeatsAvailable: 3,
      seatsDisplayed: 3,
      updatedAt: NOW,
    });

    await runStatusTickerJob(store, { now: hoursFrom(NOW, 0.01) });
    expect(store.deals.get(deal.id)?.status).toBe("live");
  });

  it("archives after ARCHIVE_AFTER_DAYS from expired event / ended_at", async () => {
    const { ARCHIVE_AFTER_DAYS } = getPlatformConfig();
    const store = createDealDraftStore();
    const expiredAt = NOW;

    const expiredDeal = makeDealFixture({
      id: "deal-exp-arch",
      operatorId: OPERATOR_ID,
      status: "live",
      salesCutoffMinutes: 0,
      publishedAt: expiredAt,
      firstPublishedAt: expiredAt,
      createdAt: expiredAt,
      updatedAt: expiredAt,
    });
    seedDeal({ deals: store.deals, audit: store.audit }, expiredDeal);
    transitionDeal(
      { deals: store.deals, audit: store.audit },
      expiredDeal.id,
      "expired",
      { actor: SYSTEM, now: expiredAt }
    );

    const endedDeal = makeDealFixture({
      id: "deal-end-arch",
      operatorId: OPERATOR_ID,
      status: "live",
      salesCutoffMinutes: 0,
      publishedAt: expiredAt,
      firstPublishedAt: expiredAt,
      createdAt: expiredAt,
      updatedAt: expiredAt,
    });
    seedDeal({ deals: store.deals, audit: store.audit }, endedDeal);
    transitionDeal(
      { deals: store.deals, audit: store.audit },
      endedDeal.id,
      "ended",
      { actor: SYSTEM, now: expiredAt }
    );

    // Too early
    await runStatusTickerJob(store, {
      now: daysFrom(expiredAt, ARCHIVE_AFTER_DAYS - 1),
    });
    expect(store.deals.get(expiredDeal.id)?.status).toBe("expired");
    expect(store.deals.get(endedDeal.id)?.status).toBe("ended");

    const later = daysFrom(expiredAt, ARCHIVE_AFTER_DAYS);
    await runStatusTickerJob(store, { now: later });
    expect(store.deals.get(expiredDeal.id)?.status).toBe("archived");
    expect(store.deals.get(endedDeal.id)?.status).toBe("archived");

    const again = await runStatusTickerJob(store, { now: later });
    expect(again.transitions).toBe(0);
    expect(
      listDealEvents(store.audit, expiredDeal.id).filter(
        (e) => e.eventType === "archived"
      )
    ).toHaveLength(1);
  });

  it("calls discount-step hook for each deal (Chunk 43 placeholder)", async () => {
    const { store, dealId } = seedScheduledDeal({
      publishAt: hoursFrom(NOW, 5),
      sessionStart: hoursFrom(NOW, 24),
    });
    const hook = vi.fn(applyCurrentDiscountSteps);
    await tickDealStatus(store, dealId, {
      now: NOW,
      applyDiscountSteps: hook,
      validate: async () => okValidation(),
    });
    expect(hook).toHaveBeenCalledWith(store, dealId, NOW);
  });

  it("running the job twice is idempotent across rules", async () => {
    const store = createDealDraftStore();
    const deal = makeDealFixture({
      id: "deal-idem",
      operatorId: OPERATOR_ID,
      status: "live",
      salesCutoffMinutes: 0,
      publishedAt: NOW,
      firstPublishedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    });
    seedDeal({ deals: store.deals, audit: store.audit }, deal);
    seedDealSession(
      store,
      session(deal.id, {
        id: "s-idem",
        startAt: hoursFrom(NOW, -1),
        status: "live",
        seatsDisplayed: 0,
      })
    );

    const t1 = await runStatusTickerJob(store, { now: NOW });
    expect(store.deals.get(deal.id)?.status).toBe("expired");
    expect(t1.transitions).toBeGreaterThan(0);

    const eventCount = listDealEvents(store.audit, deal.id).length;
    const t2 = await runStatusTickerJob(store, { now: NOW });
    expect(t2.transitions).toBe(0);
    expect(listDealEvents(store.audit, deal.id)).toHaveLength(eventCount);
  });
});
