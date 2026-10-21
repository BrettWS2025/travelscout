/**
 * Chunk 34 — integrated availability and capacity.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createDealDraftStore,
  createDraftDeal,
  updateDraftDeal,
} from "@/lib/marketplace/deal-draft";
import {
  CAPACITY_CAP_NOTE,
  listAvailableSessionsForDeal,
  selectIntegratedSessions,
} from "@/lib/marketplace/deal-integrated-availability";
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
import { transitionDeal } from "@/lib/marketplace/deal-status";

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

describe("Chunk 34 integrated availability and capacity", () => {
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

  async function connectEnableAndCreateMultiDeal() {
    const { store, bayOperatorId, bayOwnerId } = freshStore();
    const connected = await connectIntegration(
      store,
      bayOperatorId,
      "rezdy",
      { api_key: "chunk34-key" },
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
      dealType: "integrated_multi_session",
      externalProductId: kayak.id,
      actor: ACTOR,
      now: NOW,
    });

    return {
      store,
      dealId: deal.id,
      kayak,
      integration: connected.integration,
    };
  }

  it("lists available sessions within MAX_LEAD_HOURS with note", async () => {
    const { store, dealId } = await connectEnableAndCreateMultiDeal();
    const listed = listAvailableSessionsForDeal(store, dealId, { now: NOW });
    expect(listed.note).toBe(CAPACITY_CAP_NOTE);
    expect(listed.max_lead_hours).toBe(72);
    expect(listed.sessions.length).toBeGreaterThanOrEqual(3);
    expect(listed.sessions.every((s) => s.selected === false)).toBe(true);
    expect(listed.sessions[0]).toMatchObject({
      seats_available: expect.any(Number),
      status: expect.any(String),
    });
  });

  it("multi-session with 3 sessions, cap 4 on one with 10 seats → shows 4", async () => {
    const { store, dealId, kayak } = await connectEnableAndCreateMultiDeal();

    const extSessions = [...store.externalSessions!.values()]
      .filter((s) => s.externalProductId === kayak.id)
      .sort((a, b) => a.startAt.localeCompare(b.startAt));
    expect(extSessions.length).toBeGreaterThanOrEqual(3);

    const three = extSessions.slice(0, 3);
    // Give the first session 10 provider seats
    store.externalSessions!.set(three[0]!.id, {
      ...three[0]!,
      seatsAvailable: 10,
      status: "live",
    });

    const result = await selectIntegratedSessions(
      store,
      dealId,
      {
        external_session_ids: three.map((s) => s.id),
        capacity_mode: "live_provider_capped",
        seat_cap: 8,
        session_seat_caps: { [three[0]!.id]: 4 },
      },
      { actor: ACTOR, now: NOW }
    );

    expect(result.note).toBe(CAPACITY_CAP_NOTE);
    expect(result.sessions).toHaveLength(3);
    expect(result.deal.capacityMode).toBe("live_provider_capped");
    expect(result.deal.seatCap).toBe(8);

    const capped = result.sessions.find(
      (s) => s.externalSessionId === three[0]!.id
    )!;
    expect(capped.providerSeatsAvailable).toBe(10);
    expect(capped.seatCap).toBe(4);
    expect(capped.seatsDisplayed).toBe(4);

    const listed = listAvailableSessionsForDeal(store, dealId, { now: NOW });
    expect(listed.sessions.filter((s) => s.selected)).toHaveLength(3);
  });

  it("integrated_session rejects more than one selection", async () => {
    const { store, bayOperatorId, bayOwnerId } = freshStore();
    const connected = await connectIntegration(
      store,
      bayOperatorId,
      "rezdy",
      { api_key: "chunk34-single" },
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

    const ext = [...store.externalSessions!.values()]
      .filter((s) => s.externalProductId === kayak.id)
      .slice(0, 2);

    await expect(
      selectIntegratedSessions(
        store,
        deal.id,
        { external_session_ids: ext.map((s) => s.id) },
        { actor: ACTOR, now: NOW }
      )
    ).rejects.toThrow(/exactly one/i);
  });

  it("mock sells out one session → that session sold_out, deal stays live", async () => {
    const { store, dealId, kayak, integration } =
      await connectEnableAndCreateMultiDeal();

    const extSessions = [...store.externalSessions!.values()]
      .filter((s) => s.externalProductId === kayak.id)
      .sort((a, b) => a.startAt.localeCompare(b.startAt))
      .slice(0, 3);

    await selectIntegratedSessions(
      store,
      dealId,
      {
        external_session_ids: extSessions.map((s) => s.id),
        capacity_mode: "live_provider",
      },
      { actor: ACTOR, now: NOW }
    );

    // draft → live is an allowed transition (publish validation is separate)
    transitionDeal(store, dealId, "live", {
      actor: { type: "system", id: null },
      now: NOW,
    });
    expect(store.deals.get(dealId)!.status).toBe("live");

    const target = extSessions[0]!;
    mockController.setSeats("prod-harbour-kayak", target.externalId, 0);

    await runSync(store, integration.id, "incremental", {
      now: "2026-10-20T04:10:00.000Z",
    });

    const dealSessions = [...store.sessions.values()].filter(
      (s) => s.dealId === dealId
    );
    const soldOut = dealSessions.find(
      (s) => s.externalSessionId === target.id
    )!;
    expect(soldOut.status).toBe("sold_out");
    expect(soldOut.providerSeatsAvailable).toBe(0);
    expect(soldOut.seatsDisplayed).toBe(0);

    const others = dealSessions.filter((s) => s.externalSessionId !== target.id);
    expect(others.every((s) => s.status === "live")).toBe(true);
    expect(others.some((s) => (s.seatsDisplayed ?? 0) > 0)).toBe(true);

    expect(store.deals.get(dealId)!.status).toBe("live");
  });

  it("PATCH capacity_mode to capped recomputes seats_displayed via deal update", async () => {
    const { store, dealId, kayak } = await connectEnableAndCreateMultiDeal();
    const ext = [...store.externalSessions!.values()]
      .filter((s) => s.externalProductId === kayak.id)
      .slice(0, 1);

    store.externalSessions!.set(ext[0]!.id, {
      ...ext[0]!,
      seatsAvailable: 10,
    });

    await selectIntegratedSessions(
      store,
      dealId,
      { external_session_ids: [ext[0]!.id], capacity_mode: "live_provider" },
      { actor: ACTOR, now: NOW }
    );

    let session = [...store.sessions.values()].find((s) => s.dealId === dealId)!;
    expect(session.seatsDisplayed).toBe(10);

    updateDraftDeal(
      store,
      dealId,
      { capacity_mode: "live_provider_capped", seat_cap: 4 },
      { actor: ACTOR, now: NOW }
    );

    session = store.sessions.get(session.id)!;
    expect(session.seatsDisplayed).toBe(4);
  });
});
