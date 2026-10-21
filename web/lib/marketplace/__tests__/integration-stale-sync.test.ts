/**
 * Chunk 29 — stale-sync monitor: degrade + sync_failure auto-pause,
 * notify once per incident, recover on successful sync / fresh monitor tick.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDealDraftStore,
  seedDealSession,
} from "@/lib/marketplace/deal-draft";
import {
  listOperatorDeals,
  permissionUserForList,
} from "@/lib/marketplace/deal-list";
import { computeSeatsDisplayed } from "@/lib/marketplace/deal-session";
import {
  makeDealFixture,
  seedDeal,
} from "@/lib/marketplace/deal-status";
import type { Integration } from "@/lib/marketplace/integration";
import {
  connectIntegration,
  ensureIntegrationSecretsConfigured,
  resetIntegrationSecretsBootstrap,
} from "@/lib/marketplace/integration-connect";
import {
  clearSyncFailureIncident,
  formatSyncLocalDateTime,
  isSyncStale,
  runStaleSyncMonitorJob,
  setSendIntegrationSyncFailing,
  syncFailurePauseDetail,
} from "@/lib/marketplace/integration-stale-sync";
import { runSync, resetSyncLocks } from "@/lib/marketplace/integration-sync";
import {
  createMockAdapter,
  registerAdapterFactory,
  resetAdapterRegistry,
} from "@/lib/marketplace/providers";
import { DEV_SEED_IDS, seedDevMarketplace } from "@/lib/marketplace/seed-dev";

const NOW = "2026-10-20T04:00:00.000Z";
const NOW_DATE = new Date(NOW);
const STALE_AT = "2026-10-20T04:16:00.000Z"; // 16 minutes later

function freshStore() {
  const seeded = seedDevMarketplace({ now: NOW });
  const store = createDealDraftStore(seeded.store);
  store.integrations = new Map(seeded.integrations.map((i) => [i.id, i]));
  store.syncLogs = new Map();
  store.externalProducts = new Map();
  store.externalSessions = new Map();
  store.integrationPollState = new Map();
  store.syncFailureIncidents = new Map();
  return {
    store,
    bayOperatorId: DEV_SEED_IDS.bayCruises.operatorId,
    bayOwnerId: DEV_SEED_IDS.bayCruises.ownerUserId,
  };
}

describe("Chunk 29 stale-sync monitor", () => {
  let mockController: ReturnType<typeof createMockAdapter>;
  const notify = vi.fn();

  beforeEach(() => {
    resetIntegrationSecretsBootstrap();
    resetAdapterRegistry();
    resetSyncLocks();
    notify.mockReset();
    setSendIntegrationSyncFailing(notify);
    mockController = createMockAdapter({ now: NOW_DATE });
    registerAdapterFactory("rezdy", () => mockController.adapter);
  });

  afterEach(() => {
    setSendIntegrationSyncFailing(null);
    resetIntegrationSecretsBootstrap();
    resetAdapterRegistry();
    resetSyncLocks();
  });

  async function connectBay(
    store: ReturnType<typeof createDealDraftStore>,
    bayOperatorId: string,
    bayOwnerId: string
  ) {
    return connectIntegration(
      store,
      bayOperatorId,
      "rezdy",
      { api_key: "stale-key" },
      { actor: { type: "user", id: bayOwnerId }, now: NOW }
    );
  }

  function seedLiveIntegratedDeal(
    store: ReturnType<typeof createDealDraftStore>,
    bayOperatorId: string,
    integrationId: string
  ) {
    const deal = seedDeal(
      store,
      makeDealFixture({
        id: "deal-stale-1",
        operatorId: bayOperatorId,
        dealType: "integrated_session",
        sourceProvider: "rezdy",
        integrationId,
        status: "live",
        capacityMode: "live_provider",
        discountMechanism: "promo_code",
        createdAt: NOW,
        updatedAt: NOW,
      })
    );
    seedDealSession(store, {
      id: "ds-stale-1",
      dealId: deal.id,
      externalSessionId: null,
      startAt: "2026-10-20T20:00:00.000Z",
      endAt: null,
      providerSeatsAvailable: 5,
      manualSeatsAvailable: null,
      seatCap: null,
      seatsDisplayed: computeSeatsDisplayed(
        {
          providerSeatsAvailable: 5,
          manualSeatsAvailable: null,
          seatCap: null,
        },
        deal
      ),
      status: "live",
      lastSyncedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    });
    return deal;
  }

  it("isSyncStale is true after SYNC_STALE_MINUTES", () => {
    const integration = {
      lastSuccessfulSyncAt: NOW,
    } as Integration;
    expect(isSyncStale(integration, "2026-10-20T04:15:00.000Z", 15)).toBe(
      false
    );
    expect(isSyncStale(integration, STALE_AT, 15)).toBe(true);
    expect(
      isSyncStale(
        { lastSuccessfulSyncAt: null } as Integration,
        NOW,
        15
      )
    ).toBe(true);
  });

  it("pause detail uses provider name and operator-local time", () => {
    const detail = syncFailurePauseDetail(
      {
        provider: "rezdy",
        lastSuccessfulSyncAt: NOW,
        lastSyncAt: null,
        connectedAt: null,
        updatedAt: NOW,
      } as Integration,
      "Pacific/Auckland"
    );
    const local = formatSyncLocalDateTime(NOW, "Pacific/Auckland");
    expect(detail).toBe(`Rezdy hasn't synced since ${local}`);
  });

  it("fake clock 16m: degrades, auto-pauses live deals, notifies once; banner in list; sync recovers", async () => {
    const { store, bayOperatorId, bayOwnerId } = freshStore();
    const connected = await connectBay(store, bayOperatorId, bayOwnerId);
    const integrationId = connected.integration.id;

    seedLiveIntegratedDeal(store, bayOperatorId, integrationId);

    // Still fresh at 14 minutes — no action
    const freshTick = await runStaleSyncMonitorJob(store, {
      now: "2026-10-20T04:14:00.000Z",
    });
    expect(freshTick.degradedIntegrationIds).toEqual([]);
    expect(freshTick.syncFailurePausedDealIds).toEqual([]);
    expect(notify).not.toHaveBeenCalled();
    expect(store.deals.get("deal-stale-1")!.status).toBe("live");
    expect(store.integrations!.get(integrationId)!.status).toBe("connected");

    // 16 minutes — stale
    const staleTick = await runStaleSyncMonitorJob(store, { now: STALE_AT });
    expect(staleTick.degradedIntegrationIds).toEqual([integrationId]);
    expect(staleTick.syncFailurePausedDealIds).toEqual(["deal-stale-1"]);
    expect(staleTick.notificationsSent).toHaveLength(1);

    const deal = store.deals.get("deal-stale-1")!;
    expect(deal.status).toBe("auto_paused");
    expect(deal.pauseReason).toBe("sync_failure");
    expect(deal.pauseDetail).toMatch(/^Rezdy hasn't synced since /);

    const integration = store.integrations!.get(integrationId)!;
    expect(integration.status).toBe("degraded");

    expect(notify).toHaveBeenCalledOnce();
    expect(notify.mock.calls[0]![0]).toMatchObject({
      operatorId: bayOperatorId,
      integrationId,
      provider: "rezdy",
      pausedDealIds: ["deal-stale-1"],
    });

    // Idempotent: second tick does not re-notify or duplicate pause events
    const again = await runStaleSyncMonitorJob(store, { now: STALE_AT });
    expect(again.degradedIntegrationIds).toEqual([]);
    expect(again.syncFailurePausedDealIds).toEqual([]);
    expect(again.notificationsSent).toEqual([]);
    expect(notify).toHaveBeenCalledOnce();

    // List banner shows sync failing + hidden deals
    const list = listOperatorDeals(store, bayOperatorId, {
      permissionUser: permissionUserForList(
        bayOwnerId,
        bayOperatorId,
        "owner"
      ),
      now: STALE_AT,
    });
    const banner = list.banners.find((b) => b.type === "integration_unhealthy");
    expect(banner).toBeDefined();
    expect(banner!.message).toMatch(/Rezdy sync failing since /);
    expect(banner!.message).toMatch(/1 deals? hidden/);
    expect(banner!.count).toBe(1);

    // Adapter recovers via successful sync → connected + live
    const recovered = await runSync(store, integrationId, "full", {
      now: "2026-10-20T04:17:00.000Z",
      retry: { maxAttempts: 1, baseBackoffMs: 0, sleepFn: async () => {} },
    });
    expect(recovered.sync_log.status).toBe("success");
    expect(recovered.integration.status).toBe("connected");
    expect(recovered.resumed_deal_ids).toContain("deal-stale-1");

    expect(store.deals.get("deal-stale-1")!.status).toBe("live");
    expect(store.deals.get("deal-stale-1")!.pauseReason).toBeNull();
    expect(store.syncFailureIncidents!.has(integrationId)).toBe(false);
  });

  it("monitor recovers degraded + sync_failure when last sync becomes fresh", async () => {
    const { store, bayOperatorId, bayOwnerId } = freshStore();
    const connected = await connectBay(store, bayOperatorId, bayOwnerId);
    const integrationId = connected.integration.id;
    seedLiveIntegratedDeal(store, bayOperatorId, integrationId);

    await runStaleSyncMonitorJob(store, { now: STALE_AT });
    expect(store.deals.get("deal-stale-1")!.status).toBe("auto_paused");

    // Simulate a successful sync updating lastSuccessfulSyncAt without going
    // through clearSyncFailurePauses (monitor path alone).
    const row = store.integrations!.get(integrationId)!;
    store.integrations!.set(integrationId, {
      ...row,
      status: "degraded",
      lastSuccessfulSyncAt: STALE_AT,
      updatedAt: STALE_AT,
    });

    const recoverAt = "2026-10-20T04:17:00.000Z";
    const result = await runStaleSyncMonitorJob(store, { now: recoverAt });
    expect(result.recoveredIntegrationIds).toEqual([integrationId]);
    expect(result.resumedDealIds).toContain("deal-stale-1");
    expect(store.integrations!.get(integrationId)!.status).toBe("connected");
    expect(store.deals.get("deal-stale-1")!.status).toBe("live");
  });

  it("error/disconnected integrations auto-pause live and scheduled deals", async () => {
    const { store, bayOperatorId, bayOwnerId } = freshStore();
    ensureIntegrationSecretsConfigured();
    const connected = await connectBay(store, bayOperatorId, bayOwnerId);
    const integrationId = connected.integration.id;

    seedLiveIntegratedDeal(store, bayOperatorId, integrationId);
    seedDeal(
      store,
      makeDealFixture({
        id: "deal-sched-1",
        operatorId: bayOperatorId,
        dealType: "integrated_session",
        sourceProvider: "rezdy",
        integrationId,
        status: "scheduled",
        capacityMode: "live_provider",
        discountMechanism: "promo_code",
        createdAt: NOW,
        updatedAt: NOW,
      })
    );

    store.integrations!.set(integrationId, {
      ...store.integrations!.get(integrationId)!,
      status: "error",
      updatedAt: NOW,
    });

    const result = await runStaleSyncMonitorJob(store, { now: NOW });
    expect(result.disconnectedPausedDealIds).toEqual(
      expect.arrayContaining(["deal-stale-1", "deal-sched-1"])
    );
    expect(store.deals.get("deal-stale-1")!.pauseReason).toBe(
      "integration_disconnected"
    );
    expect(store.deals.get("deal-sched-1")!.pauseReason).toBe(
      "integration_disconnected"
    );
  });

  it("clearSyncFailureIncident allows a new notify after recovery then re-stale", async () => {
    const { store, bayOperatorId, bayOwnerId } = freshStore();
    const connected = await connectBay(store, bayOperatorId, bayOwnerId);
    const integrationId = connected.integration.id;
    seedLiveIntegratedDeal(store, bayOperatorId, integrationId);

    await runStaleSyncMonitorJob(store, { now: STALE_AT });
    expect(notify).toHaveBeenCalledOnce();

    // Recover
    await runSync(store, integrationId, "full", {
      now: "2026-10-20T04:17:00.000Z",
      retry: { maxAttempts: 1 },
    });
    expect(store.deals.get("deal-stale-1")!.status).toBe("live");
    clearSyncFailureIncident(store, integrationId); // already cleared by sync

    // Go stale again from the new lastSuccessfulSyncAt
    const againStale = "2026-10-20T04:33:00.000Z";
    await runStaleSyncMonitorJob(store, { now: againStale });
    expect(notify).toHaveBeenCalledTimes(2);
  });
});
