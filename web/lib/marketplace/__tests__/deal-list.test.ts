import { describe, expect, it } from "vitest";
import { createClickEvent, listDealEvents } from "@/lib/marketplace/deal-audit";
import { addDealMedia } from "@/lib/marketplace/deal-media";
import { getPlatformConfig } from "@/lib/marketplace/config";
import {
  createDealDraftStore,
  createDraftDeal,
  seedDealPriceOption,
  seedDealSession,
  updateDraftDeal,
} from "@/lib/marketplace/deal-draft";
import {
  allowedRowActions,
  computeTabCounts,
  dealMatchesTab,
  getOperatorDealsCalendar,
  listOperatorDeals,
  permissionUserForList,
} from "@/lib/marketplace/deal-list";
import {
  approveDeal,
  publishDeal,
} from "@/lib/marketplace/deal-publish";
import { applyAutoPause, makeDealFixture, seedDeal } from "@/lib/marketplace/deal-status";
import type { Integration } from "@/lib/marketplace/integration";
import { seedOperatorWithOwner } from "@/lib/marketplace/operators";
import { seedDevMarketplace, DEV_SEED_IDS } from "@/lib/marketplace/seed-dev";
import type { DealSession, DealPriceOption } from "@/lib/marketplace/deal-session";
import { transitionDeal } from "@/lib/marketplace/deal-status";

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

function hoursFrom(baseIso: string, hours: number): string {
  return new Date(Date.parse(baseIso) + hours * 3600_000).toISOString();
}

function freshStore() {
  const seeded = seedDevMarketplace({ now: NOW });
  const store = createDealDraftStore(seeded.store);
  // Harbour has no integrations; Bay's rezdy not_connected is on seeded.integrations.
  store.integrations = new Map(
    seeded.integrations.map((i) => [i.id, i])
  );
  const { operator } = seedOperatorWithOwner(store.operators, {
    legalName: "List Tours Ltd",
    tradingName: "List Tours",
    slug: `list-tours-${crypto.randomUUID().slice(0, 8)}`,
    ownerUserId: "list-owner-1",
    ownerEmail: "owner@list.example",
    accountStatus: "active",
  });
  store.operators.operators.set(operator.id, {
    ...operator,
    requiresManualReview: false,
    timezone: "Pacific/Auckland",
  });
  return { store, operatorId: operator.id, seeded };
}

async function seedCompleteManualDraft(
  store: ReturnType<typeof createDealDraftStore>,
  operatorId: string,
  opts?: {
    sessionStart?: string;
    id?: string;
    seats?: number;
    title?: string;
    category?: string;
  }
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
      title: opts?.title ?? `List Tour ${id.slice(0, 6)}`,
      summary: "Paddle the harbour with a local guide at sunrise.",
      description,
      category: opts?.category ?? "water",
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
      sales_cutoff_minutes: 60,
    },
    { actor: ACTOR, now: NOW }
  );

  addDealMedia(
    store.media,
    {
      dealId: id,
      mediaType: "image",
      source: "upload",
      url: `https://cdn.example.com/${id}.jpg`,
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

async function makeLiveManualDeal(
  store: ReturnType<typeof createDealDraftStore>,
  operatorId: string,
  opts?: {
    sessionStart?: string;
    id?: string;
    seats?: number;
    title?: string;
  }
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
  await publishDeal(store, dealId, {
    actor: ACTOR,
    attest: true,
    now: NOW,
    skipLinkCheck: true,
  });
  return { dealId, sessionId };
}

describe("Chunk 21 deals list API", () => {
  it("tab_counts and tab contents match seeded statuses", async () => {
    const { store, operatorId } = freshStore();
    const manager = permissionUserForList(
      "list-owner-1",
      operatorId,
      "manager"
    );

    // Draft
    await seedCompleteManualDraft(store, operatorId, {
      id: "draft-1",
      title: "Draft Harbour Paddle",
    });

    // Live (tomorrow)
    const { dealId: liveId } = await makeLiveManualDeal(store, operatorId, {
      id: "live-1",
      title: "Live Sunrise Paddle",
      sessionStart: tomorrowStart(),
    });

    // Scheduled (session beyond MAX_LEAD_HOURS)
    const { dealId: schedId } = await makeLiveManualDeal(store, operatorId, {
      id: "sched-1",
      title: "Scheduled Far Paddle",
      sessionStart: inFiveDays(),
    });
    expect(store.deals.get(schedId)!.status).toBe("scheduled");

    // Paused
    const { dealId: pausedId } = await makeLiveManualDeal(store, operatorId, {
      id: "paused-1",
      title: "Paused Paddle",
    });
    transitionDeal(
      { deals: store.deals, audit: store.audit },
      pausedId,
      "paused",
      { actor: ACTOR, reason: "operator", now: NOW }
    );

    // Auto-paused
    const { dealId: autoId } = await makeLiveManualDeal(store, operatorId, {
      id: "auto-1",
      title: "Auto Paused Paddle",
    });
    applyAutoPause(
      { deals: store.deals, audit: store.audit },
      autoId,
      "attestation_expired",
      "Seats not reconfirmed",
      { now: NOW }
    );

    // Sold out (publish with seats, then transition)
    const { dealId: soldId, sessionId: soldSessionId } =
      await makeLiveManualDeal(store, operatorId, {
        id: "sold-1",
        title: "Sold Out Paddle",
        seats: 4,
      });
    const soldSession = store.sessions.get(soldSessionId)!;
    store.sessions.set(soldSessionId, {
      ...soldSession,
      manualSeatsAvailable: 0,
      seatsDisplayed: 0,
    });
    if (store.deals.get(soldId)!.status === "live") {
      transitionDeal(
        { deals: store.deals, audit: store.audit },
        soldId,
        "sold_out",
        { actor: ACTOR, now: NOW }
      );
    }

    // Past (ended)
    const { dealId: endedId } = await makeLiveManualDeal(store, operatorId, {
      id: "ended-1",
      title: "Ended Paddle",
    });
    transitionDeal(
      { deals: store.deals, audit: store.audit },
      endedId,
      "ended",
      { actor: ACTOR, now: NOW }
    );

    // Live with attestation due within 2h → also needs_attention
    const liveDeal = store.deals.get(liveId)!;
    store.deals.set(liveId, {
      ...liveDeal,
      attestationExpiresAt: hoursFrom(NOW, 1),
    });

    const all = listOperatorDeals(store, operatorId, {
      permissionUser: manager,
      now: NOW,
    });

    expect(all.has_any_deals).toBe(true);
    expect(all.tab_counts.drafts).toBeGreaterThanOrEqual(1);
    expect(all.tab_counts.live).toBeGreaterThanOrEqual(1);
    expect(all.tab_counts.paused).toBeGreaterThanOrEqual(1);
    expect(all.tab_counts.needs_attention).toBeGreaterThanOrEqual(2); // auto + attestation due
    expect(all.tab_counts.past).toBeGreaterThanOrEqual(1);
    expect(all.tab_counts.sold_out).toBeGreaterThanOrEqual(1);

    const liveTab = listOperatorDeals(store, operatorId, {
      tab: "live",
      permissionUser: manager,
      now: NOW,
    });
    expect(liveTab.deals.every((d) => d.status === "live")).toBe(true);
    expect(liveTab.deals.some((d) => d.id === liveId)).toBe(true);

    const attention = listOperatorDeals(store, operatorId, {
      tab: "needs_attention",
      permissionUser: manager,
      now: NOW,
    });
    const attentionIds = attention.deals.map((d) => d.id);
    expect(attentionIds).toContain(autoId);
    expect(attentionIds).toContain(liveId);

    const drafts = listOperatorDeals(store, operatorId, {
      tab: "drafts",
      permissionUser: manager,
      now: NOW,
    });
    expect(drafts.deals.every((d) => d.status === "draft")).toBe(true);

    const past = listOperatorDeals(store, operatorId, {
      tab: "past",
      permissionUser: manager,
      now: NOW,
    });
    expect(past.deals.some((d) => d.id === endedId)).toBe(true);

    // Search + sort
    const search = listOperatorDeals(store, operatorId, {
      search: "sunrise",
      permissionUser: manager,
      now: NOW,
    });
    expect(search.deals.every((d) =>
      (d.title ?? "").toLowerCase().includes("sunrise")
    )).toBe(true);

    // Row fields
    const liveRow = liveTab.deals.find((d) => d.id === liveId)!;
    expect(liveRow.cover_thumbnail_url).toContain("cdn.example.com");
    expect(liveRow.original_price_minor).toBe(20000);
    expect(liveRow.deal_price_minor).toBe(9000);
    expect(liveRow.discount_pct).toBe(55);
    expect(liveRow.seats_displayed).toBe(6);
    expect(liveRow.next_session_start_at).toBe(tomorrowStart());
    expect(liveRow.next_session_start_local).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(liveRow.cutoff_at).toBe(
      new Date(Date.parse(tomorrowStart()) - 60 * 60_000).toISOString()
    );
    expect(liveRow.from_rule).toBe(false);

    // Clicks today
    createClickEvent(
      store.audit,
      {
        dealId: liveId,
        clickId: "click-1",
        visitorId: "v1",
      },
      { now: NOW }
    );
    createClickEvent(
      store.audit,
      {
        dealId: liveId,
        clickId: "click-2",
        visitorId: "v2",
      },
      { now: NOW }
    );
    const withClicks = listOperatorDeals(store, operatorId, {
      tab: "live",
      permissionUser: manager,
      now: NOW,
    });
    expect(withClicks.deals.find((d) => d.id === liveId)!.clicks_today).toBe(2);

    // Attestation banner
    expect(
      all.banners.some(
        (b) => b.type === "attestation_due" && (b.count ?? 0) >= 1
      )
    ).toBe(true);

    // Harbour-style operator with no integrations
    expect(
      listOperatorDeals(store, operatorId, {
        permissionUser: manager,
        now: NOW,
        integrations: [],
      }).has_integration
    ).toBe(false);

    const scheduledTab = listOperatorDeals(store, operatorId, {
      tab: "scheduled",
      permissionUser: manager,
      now: NOW,
    });
    expect(scheduledTab.deals.some((d) => d.id === schedId)).toBe(true);
  });

  it("staff sees no write actions; manager sees pause on live", async () => {
    const { store, operatorId } = freshStore();
    const { dealId } = await makeLiveManualDeal(store, operatorId, {
      id: "staff-live-1",
      title: "Staff Read Only Deal",
    });
    const deal = store.deals.get(dealId)!;

    const staff = permissionUserForList("staff-1", operatorId, "staff");
    const manager = permissionUserForList("mgr-1", operatorId, "manager");

    const staffActions = allowedRowActions(deal, staff, operatorId);
    expect(staffActions).toEqual(["preview", "view_stats"]);
    expect(staffActions).not.toContain("pause");
    expect(staffActions).not.toContain("edit");
    expect(staffActions).not.toContain("update_seats");

    const managerActions = allowedRowActions(deal, manager, operatorId);
    expect(managerActions).toContain("preview");
    expect(managerActions).toContain("edit");
    expect(managerActions).toContain("pause");
    expect(managerActions).toContain("update_seats");
    expect(managerActions).toContain("mark_sold_out");
    expect(managerActions).not.toContain("resume");

    const staffList = listOperatorDeals(store, operatorId, {
      tab: "live",
      permissionUser: staff,
      now: NOW,
    });
    const row = staffList.deals.find((d) => d.id === dealId)!;
    expect(row.allowed_actions).toEqual(["preview", "view_stats"]);
  });

  it("integration unhealthy banner and calendar group by local day", async () => {
    const { store, operatorId } = freshStore();
    const manager = permissionUserForList("list-owner-1", operatorId, "manager");

    const integration: Integration = {
      id: "int-rezdy-1",
      operatorId,
      provider: "rezdy",
      status: "error",
      authType: "api_key",
      credentialsRef: "secret-ref",
      webhookSecretRef: null,
      externalAccountId: "ext-1",
      externalAccountName: "Bay",
      syncMode: "polling",
      pollIntervalSeconds: 300,
      webhookLastReceivedAt: null,
      lastSyncAt: hoursFrom(NOW, -1),
      lastSuccessfulSyncAt: "2026-10-20T00:00:00.000Z",
      lastErrorCode: "sync_failed",
      lastErrorMessage: "timeout",
      defaultBookingDestinationType: null,
      bookingBaseUrl: null,
      conversionTrackingMethod: "none",
      bookingSourceLabel: null,
      autoEnableNewProducts: false,
      connectedAt: hoursFrom(NOW, -24),
      connectedBy: "list-owner-1",
      createdAt: NOW,
      updatedAt: NOW,
    };
    store.integrations!.set(integration.id, integration);

    // Hidden auto-paused deal for that integration
    const hidden = makeDealFixture({
      id: "hidden-int-1",
      operatorId,
      dealType: "integrated_session",
      sourceProvider: "rezdy",
      integrationId: integration.id,
      status: "auto_paused",
      pauseReason: "sync_failure",
      title: "Hidden Rezdy Deal",
      createdAt: NOW,
      updatedAt: NOW,
    });
    seedDeal({ deals: store.deals, audit: store.audit }, hidden);

    const list = listOperatorDeals(store, operatorId, {
      permissionUser: manager,
      now: NOW,
    });
    expect(list.has_integration).toBe(true);
    const banner = list.banners.find((b) => b.type === "integration_unhealthy");
    expect(banner).toBeDefined();
    expect(banner!.message).toContain("Rezdy sync failing since");
    expect(banner!.message).toContain("1 deals hidden");
    expect(banner!.fix).toContain("integrations");
    expect(banner!.integration_id).toBe(integration.id);

    // Calendar: two sessions on consecutive Auckland days
    await seedCompleteManualDraft(store, operatorId, {
      id: "cal-1",
      title: "Calendar Day One",
      // 2026-10-21 09:00 NZDT = 2026-10-20T20:00:00.000Z
      sessionStart: "2026-10-20T20:00:00.000Z",
    });
    await seedCompleteManualDraft(store, operatorId, {
      id: "cal-2",
      title: "Calendar Day Two",
      // 2026-10-22 09:00 NZDT = 2026-10-21T20:00:00.000Z
      sessionStart: "2026-10-21T20:00:00.000Z",
    });

    const cal = getOperatorDealsCalendar(store, operatorId, {
      from: "2026-10-21",
      now: NOW,
    });
    expect(cal.days).toHaveLength(3);
    expect(cal.days.map((d) => d.date)).toEqual([
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
    ]);
    expect(cal.timezone).toBe("Pacific/Auckland");
    expect(cal.days[0]!.sessions.some((s) => s.deal_id === "cal-1")).toBe(true);
    expect(cal.days[1]!.sessions.some((s) => s.deal_id === "cal-2")).toBe(true);
    expect(cal.days[0]!.sessions[0]!.deal.title).toBeTruthy();
  });

  it("dealMatchesTab and computeTabCounts pure helpers", () => {
    const liveDue = makeDealFixture({
      id: "a",
      operatorId: "op",
      status: "live",
      dealType: "manual_session",
      attestationExpiresAt: hoursFrom(NOW, 1),
    });
    const draft = makeDealFixture({
      id: "b",
      operatorId: "op",
      status: "draft",
    });
    expect(dealMatchesTab(liveDue, "live", NOW)).toBe(true);
    expect(dealMatchesTab(liveDue, "needs_attention", NOW)).toBe(true);
    expect(dealMatchesTab(draft, "drafts", NOW)).toBe(true);
    expect(dealMatchesTab(draft, "live", NOW)).toBe(false);

    const counts = computeTabCounts([liveDue, draft], NOW);
    expect(counts.live).toBe(1);
    expect(counts.needs_attention).toBe(1);
    expect(counts.drafts).toBe(1);
  });
});
