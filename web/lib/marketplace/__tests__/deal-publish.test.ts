import { afterEach, describe, expect, it, vi } from "vitest";
import { addDealMedia } from "@/lib/marketplace/deal-media";
import { listDealEvents } from "@/lib/marketplace/deal-audit";
import {
  createDealDraftStore,
  createDraftDeal,
  getDealDetail,
  seedDealPriceOption,
  seedDealSession,
  updateDraftDeal,
} from "@/lib/marketplace/deal-draft";
import {
  adminPauseDeal,
  approveDeal,
  countApprovedManualDeals,
  getPublishButtonLabel,
  publishDeal,
  rejectDeal,
  setManualReviewFlag,
  setNotifyAdminsOfDealReview,
} from "@/lib/marketplace/deal-publish";
import { getPlatformConfig } from "@/lib/marketplace/config";
import { seedDevMarketplace, DEV_SEED_IDS } from "@/lib/marketplace/seed-dev";
import { seedOperatorWithOwner } from "@/lib/marketplace/operators";
import type { DealSession, DealPriceOption } from "@/lib/marketplace/deal-session";

const NOW = "2026-10-20T05:00:00.000Z";
const ACTOR = {
  type: "user" as const,
  id: DEV_SEED_IDS.harbourKayaks.managerUserId,
};
const ADMIN = { type: "admin" as const, id: "admin-user-1" };

function freshOperatorStore() {
  const seeded = seedDevMarketplace({ now: NOW });
  const store = createDealDraftStore(seeded.store);
  // New operator with zero approved manual deals
  const { operator } = seedOperatorWithOwner(store.operators, {
    legalName: "Fresh Tours Ltd",
    tradingName: "Fresh Tours",
    slug: `fresh-tours-${crypto.randomUUID().slice(0, 8)}`,
    ownerUserId: "fresh-owner-1",
    ownerEmail: "owner@fresh.example",
    accountStatus: "active",
  });
  return { store, operatorId: operator.id };
}

function tomorrowStart(): string {
  return "2026-10-21T05:00:00.000Z";
}

function inFiveDays(): string {
  return "2026-10-25T05:00:00.000Z";
}

async function seedCompleteManualDraft(
  store: ReturnType<typeof createDealDraftStore>,
  operatorId: string,
  opts?: { sessionStart?: string; id?: string; publishAt?: string | null }
) {
  const id = opts?.id ?? crypto.randomUUID();
  const deal = createDraftDeal(store, {
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
    deal.id,
    {
      title: `Fresh Tour ${id.slice(0, 6)}`,
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
      ...(opts?.publishAt !== undefined
        ? { publish_at: opts.publishAt }
        : {}),
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
      altText: "Kayakers on the harbour at sunrise",
      isCover: true,
      sortOrder: 0,
    },
    { id: `img-${id}`, now: NOW }
  );

  const session: DealSession = {
    id: `sess-${id}`,
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
    id: `opt-${id}`,
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

  if (!store.evidenceUrlChecks) store.evidenceUrlChecks = new Map();
  store.evidenceUrlChecks.set(option.id, {
    priceOptionId: option.id,
    dealId: deal.id,
    url: "https://harbour.example/prices",
    checkedAt: NOW,
    ok: true,
    status: 200,
    error: null,
  });

  return deal.id;
}

afterEach(() => {
  setNotifyAdminsOfDealReview(null);
  vi.restoreAllMocks();
});

describe("Chunk 17 publish / review / attestation", () => {
  it("first manual deal for a new operator → pending_review", async () => {
    const notify = vi.fn();
    setNotifyAdminsOfDealReview(notify);
    const { store, operatorId } = freshOperatorStore();
    const dealId = await seedCompleteManualDraft(store, operatorId);

    expect(getPublishButtonLabel(store, dealId, {
      now: NOW,
      hasSessionWithinLeadHours: true,
    })).toBe("Submit for review");

    const result = await publishDeal(store, dealId, {
      actor: ACTOR,
      attest: true,
      now: NOW,
      skipLinkCheck: true,
    });

    expect(result.target_status).toBe("pending_review");
    expect(result.publish_button).toBe("Submit for review");
    expect(result.deal.status).toBe("pending_review");
    expect(result.attestation).not.toBeNull();
    expect(result.deal.lastAttestedAt).toBe(NOW);
    const hours = getPlatformConfig().MANUAL_ATTESTATION_HOURS;
    expect(result.deal.attestationExpiresAt).toBe(
      new Date(Date.parse(NOW) + hours * 3600_000).toISOString()
    );

    const events = listDealEvents(store.audit, dealId).map((e) => e.eventType);
    expect(events).toContain("attested");
    expect(events).toContain("submitted_for_review");
    expect(notify).toHaveBeenCalledOnce();
  });

  it("approve → live when session is tomorrow", async () => {
    const { store, operatorId } = freshOperatorStore();
    const dealId = await seedCompleteManualDraft(store, operatorId, {
      sessionStart: tomorrowStart(),
    });
    await publishDeal(store, dealId, {
      actor: ACTOR,
      attest: true,
      now: NOW,
      skipLinkCheck: true,
    });

    const approved = await approveDeal(store, dealId, {
      actor: ADMIN,
      now: NOW,
      skipLinkCheck: true,
    });

    expect(approved.target_status).toBe("live");
    expect(approved.deal.status).toBe("live");
    expect(approved.publish_button).toBe("Publish");
    const events = listDealEvents(store.audit, dealId).map((e) => e.eventType);
    expect(events).toContain("approved");
    expect(events).toContain("published");
    expect(countApprovedManualDeals(store, operatorId)).toBe(1);
  });

  it("approve → scheduled when session is in 5 days", async () => {
    const { store, operatorId } = freshOperatorStore();
    const dealId = await seedCompleteManualDraft(store, operatorId, {
      sessionStart: inFiveDays(),
    });
    await publishDeal(store, dealId, {
      actor: ACTOR,
      attest: true,
      now: NOW,
      skipLinkCheck: true,
    });

    const approved = await approveDeal(store, dealId, {
      actor: ADMIN,
      now: NOW,
      skipLinkCheck: true,
    });

    expect(approved.target_status).toBe("scheduled");
    expect(approved.deal.status).toBe("scheduled");
    expect(approved.publish_button).toBe("Schedule");
  });

  it("4th manual deal goes straight to live after 3 approvals", async () => {
    const { store, operatorId } = freshOperatorStore();

    for (let i = 0; i < 3; i++) {
      const id = await seedCompleteManualDraft(store, operatorId, {
        id: `approved-${i}`,
        sessionStart: tomorrowStart(),
      });
      await publishDeal(store, id, {
        actor: ACTOR,
        attest: true,
        now: NOW,
        skipLinkCheck: true,
      });
      await approveDeal(store, id, {
        actor: ADMIN,
        now: NOW,
        skipLinkCheck: true,
      });
    }

    expect(countApprovedManualDeals(store, operatorId)).toBe(3);
    expect(getPlatformConfig().MANUAL_REVIEW_COUNT).toBe(3);

    const fourthId = await seedCompleteManualDraft(store, operatorId, {
      id: "fourth-deal",
      sessionStart: tomorrowStart(),
    });

    expect(
      getPublishButtonLabel(store, fourthId, {
        now: NOW,
        hasSessionWithinLeadHours: true,
      })
    ).toBe("Publish");

    const result = await publishDeal(store, fourthId, {
      actor: ACTOR,
      attest: true,
      now: NOW,
      skipLinkCheck: true,
    });

    expect(result.target_status).toBe("live");
    expect(result.deal.status).toBe("live");
    expect(result.publish_button).toBe("Publish");
  });

  it("rejects publish without attest for manual deals", async () => {
    const { store, operatorId } = freshOperatorStore();
    const dealId = await seedCompleteManualDraft(store, operatorId);

    await expect(
      publishDeal(store, dealId, {
        actor: ACTOR,
        now: NOW,
        skipLinkCheck: true,
      })
    ).rejects.toMatchObject({ status: 422, name: "DealPublishError" });
  });

  it("returns 422 with checks when validation fails", async () => {
    const { store, operatorId } = freshOperatorStore();
    const deal = createDraftDeal(store, {
      operatorId,
      dealType: "manual_session",
      actor: ACTOR,
      now: NOW,
    });

    await expect(
      publishDeal(store, deal.id, {
        actor: ACTOR,
        attest: true,
        now: NOW,
        skipLinkCheck: true,
      })
    ).rejects.toMatchObject({
      status: 422,
      name: "DealPublishError",
    });
  });

  it("reject returns to draft with pause_detail notes", async () => {
    const { store, operatorId } = freshOperatorStore();
    const dealId = await seedCompleteManualDraft(store, operatorId);
    await publishDeal(store, dealId, {
      actor: ACTOR,
      attest: true,
      now: NOW,
      skipLinkCheck: true,
    });

    const rejected = rejectDeal(store, dealId, {
      actor: ADMIN,
      notes: "Missing insurance certificate",
      now: NOW,
    });

    expect(rejected.status).toBe("draft");
    expect(rejected.pauseDetail).toBe("Missing insurance certificate");
    expect(rejected.pauseReason).toBeNull();
    const events = listDealEvents(store.audit, dealId).map((e) => e.eventType);
    expect(events).toContain("rejected");
  });

  it("admin pause sets pause_reason=admin", async () => {
    const { store, operatorId } = freshOperatorStore();
    // Bypass review count by approving first, then pause
    for (let i = 0; i < 3; i++) {
      const id = await seedCompleteManualDraft(store, operatorId, {
        id: `pre-${i}`,
      });
      await publishDeal(store, id, {
        actor: ACTOR,
        attest: true,
        now: NOW,
        skipLinkCheck: true,
      });
      await approveDeal(store, id, {
        actor: ADMIN,
        now: NOW,
        skipLinkCheck: true,
      });
    }
    const dealId = await seedCompleteManualDraft(store, operatorId, {
      id: "to-pause",
    });
    await publishDeal(store, dealId, {
      actor: ACTOR,
      attest: true,
      now: NOW,
      skipLinkCheck: true,
    });
    expect(store.deals.get(dealId)!.status).toBe("live");

    const paused = adminPauseDeal(store, dealId, {
      actor: ADMIN,
      detail: "Policy violation",
      now: NOW,
    });
    expect(paused.status).toBe("paused");
    expect(paused.pauseReason).toBe("admin");
    expect(paused.pauseDetail).toBe("Policy violation");
  });

  it("manual-review flag forces pending_review even after trust", async () => {
    const { store, operatorId } = freshOperatorStore();
    for (let i = 0; i < 3; i++) {
      const id = await seedCompleteManualDraft(store, operatorId, {
        id: `trust-${i}`,
      });
      await publishDeal(store, id, {
        actor: ACTOR,
        attest: true,
        now: NOW,
        skipLinkCheck: true,
      });
      await approveDeal(store, id, {
        actor: ADMIN,
        now: NOW,
        skipLinkCheck: true,
      });
    }

    setManualReviewFlag(store, operatorId, true, { now: NOW });
    const dealId = await seedCompleteManualDraft(store, operatorId, {
      id: "flagged",
    });
    const result = await publishDeal(store, dealId, {
      actor: ACTOR,
      attest: true,
      now: NOW,
      skipLinkCheck: true,
    });
    expect(result.deal.status).toBe("pending_review");
  });

  it("GET deal detail includes publish_button", async () => {
    const { store, operatorId } = freshOperatorStore();
    const dealId = await seedCompleteManualDraft(store, operatorId);
    const detail = await getDealDetail(store, dealId, {
      now: NOW,
      attested: true,
      refreshStaleLinks: false,
    });
    expect(detail.publish_button).toBe("Submit for review");
    expect(detail.validation.ok).toBe(true);
  });

  it("schedules when publish_at is in the future (trusted operator)", async () => {
    const { store, operatorId } = freshOperatorStore();
    for (let i = 0; i < 3; i++) {
      const id = await seedCompleteManualDraft(store, operatorId, {
        id: `sched-pre-${i}`,
      });
      await publishDeal(store, id, {
        actor: ACTOR,
        attest: true,
        now: NOW,
        skipLinkCheck: true,
      });
      await approveDeal(store, id, {
        actor: ADMIN,
        now: NOW,
        skipLinkCheck: true,
      });
    }

    const dealId = await seedCompleteManualDraft(store, operatorId, {
      id: "future-publish",
      sessionStart: tomorrowStart(),
      publishAt: "2026-10-22T00:00:00.000Z",
    });
    // publish_at may be stripped by client patch — set directly
    store.deals.set(dealId, {
      ...store.deals.get(dealId)!,
      publishAt: "2026-10-22T00:00:00.000Z",
    });

    expect(
      getPublishButtonLabel(store, dealId, {
        now: NOW,
        hasSessionWithinLeadHours: true,
      })
    ).toBe("Schedule");

    const result = await publishDeal(store, dealId, {
      actor: ACTOR,
      attest: true,
      now: NOW,
      skipLinkCheck: true,
    });
    expect(result.deal.status).toBe("scheduled");
  });
});
