/**
 * Chunk 28 — sync engine: upsert products/sessions, DealSession seats,
 * SyncLog success/failure, lock, poll, webhook signature.
 */

import { createHmac } from "crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createDealDraftStore,
  seedDealSession,
} from "@/lib/marketplace/deal-draft";
import { computeSeatsDisplayed } from "@/lib/marketplace/deal-session";
import {
  makeDealFixture,
  seedDeal,
} from "@/lib/marketplace/deal-status";
import type { ExternalSession, Integration } from "@/lib/marketplace/integration";
import {
  connectIntegration,
  ensureIntegrationSecretsConfigured,
  resetIntegrationSecretsBootstrap,
} from "@/lib/marketplace/integration-connect";
import {
  handleIntegrationWebhook,
  isSyncLocked,
  listIntegrationProducts,
  listSyncLogs,
  resetSyncLocks,
  runIntegrationPollJob,
  runSync,
  setProductEnabledForDeals,
  SYNC_SESSION_BUFFER_HOURS,
  syncSessionWindow,
  verifyWebhookSignature,
  withRetry,
} from "@/lib/marketplace/integration-sync";
import {
  createMockAdapter,
  registerAdapterFactory,
  resetAdapterRegistry,
} from "@/lib/marketplace/providers";
import { DEV_SEED_IDS, seedDevMarketplace } from "@/lib/marketplace/seed-dev";
import { storeSecret } from "@/lib/marketplace/secrets";

const NOW = "2026-10-20T04:00:00.000Z";
const NOW_DATE = new Date(NOW);

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

describe("Chunk 28 sync engine", () => {
  let mockController: ReturnType<typeof createMockAdapter>;

  beforeEach(() => {
    resetIntegrationSecretsBootstrap();
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

  async function connectBay(
    store: ReturnType<typeof createDealDraftStore>,
    bayOperatorId: string,
    bayOwnerId: string
  ) {
    return connectIntegration(
      store,
      bayOperatorId,
      "rezdy",
      { api_key: "sync-key" },
      { actor: { type: "user", id: bayOwnerId }, now: NOW }
    );
  }

  it("syncSessionWindow uses MAX_LEAD_HOURS + 24h buffer", () => {
    const { from, to } = syncSessionWindow(NOW_DATE, 72);
    expect(from.toISOString()).toBe(NOW);
    const hours =
      (to.getTime() - from.getTime()) / (60 * 60 * 1000);
    expect(hours).toBe(72 + SYNC_SESSION_BUFFER_HOURS);
  });

  it("connect sync upserts products; new products disabled unless auto_enable", async () => {
    const { store, bayOperatorId, bayOwnerId } = freshStore();
    const result = await connectBay(store, bayOperatorId, bayOwnerId);

    expect(result.sync_log.status).toBe("success");
    expect(result.sync_log.itemsProcessed).toBeGreaterThan(0);

    const products = [...store.externalProducts!.values()].filter(
      (p) => p.integrationId === result.integration.id
    );
    expect(products.length).toBe(2);
    expect(products.every((p) => p.isEnabledForDeals === false)).toBe(true);
    expect(products.every((p) => p.archivedInProvider === false)).toBe(true);

    // No sessions synced until a product is enabled
    const sessions = [...store.externalSessions!.values()];
    expect(sessions.length).toBe(0);

    const listed = listIntegrationProducts(store, bayOperatorId, "rezdy", {
      now: NOW,
    });
    expect(listed).toHaveLength(2);
    expect(listed[0]!.sessions_next_72h).toBe(0);
  });

  it("enabled product sync upserts sessions and updates DealSession seats", async () => {
    const { store, bayOperatorId, bayOwnerId } = freshStore();
    const connected = await connectBay(store, bayOperatorId, bayOwnerId);
    const integrationId = connected.integration.id;

    const kayak = [...store.externalProducts!.values()].find(
      (p) => p.externalId === "prod-harbour-kayak"
    )!;
    setProductEnabledForDeals(
      store,
      bayOperatorId,
      "rezdy",
      kayak.id,
      true,
      { now: NOW }
    );

    // Seed an ExternalSession placeholder linked to a DealSession (pre-sync id)
    // After sync, upsert keeps/creates by external_id — link deal session after first sync.
    const sync1 = await runSync(store, integrationId, "full", { now: NOW });
    expect(sync1.sync_log.status).toBe("success");

    const extSessions = [...store.externalSessions!.values()].filter(
      (s) => s.externalProductId === kayak.id
    );
    expect(extSessions.length).toBeGreaterThan(0);
    const target = extSessions[0]!;
    expect(target.seatsAvailable).toBe(8);

    const deal = seedDeal(
      store,
      makeDealFixture({
        id: "deal-int-1",
        operatorId: bayOperatorId,
        dealType: "integrated_session",
        sourceProvider: "rezdy",
        integrationId,
        externalProductId: kayak.id,
        status: "live",
        capacityMode: "live_provider",
        discountMechanism: "promo_code",
        seatCap: 4,
        createdAt: NOW,
        updatedAt: NOW,
      })
    );

    seedDealSession(store, {
      id: "ds-1",
      dealId: deal.id,
      externalSessionId: target.id,
      startAt: target.startAt,
      endAt: target.endAt,
      providerSeatsAvailable: 8,
      manualSeatsAvailable: null,
      seatCap: null,
      seatsDisplayed: computeSeatsDisplayed(
        { providerSeatsAvailable: 8, manualSeatsAvailable: null, seatCap: null },
        deal
      ),
      status: "live",
      lastSyncedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    });

    mockController.setSeats(
      "prod-harbour-kayak",
      target.externalId,
      3
    );

    const sync2 = await runSync(store, integrationId, "incremental", {
      now: "2026-10-20T04:05:00.000Z",
    });
    expect(sync2.sync_log.status).toBe("success");
    expect(sync2.affected_deal_ids).toContain("deal-int-1");

    const updatedExt = store.externalSessions!.get(target.id) as ExternalSession;
    expect(updatedExt.seatsAvailable).toBe(3);

    const ds = store.sessions.get("ds-1")!;
    expect(ds.providerSeatsAvailable).toBe(3);
    expect(ds.seatsDisplayed).toBe(3); // min(3, deal.seatCap 4)
    expect(ds.lastSyncedAt).toBe("2026-10-20T04:05:00.000Z");
  });

  it("failing adapter writes SyncLog failed with message", async () => {
    const { store, bayOperatorId, bayOwnerId } = freshStore();
    const connected = await connectBay(store, bayOperatorId, bayOwnerId);

    mockController.setForceError("Provider rate limit exceeded");
    const result = await runSync(store, connected.integration.id, "full", {
      now: "2026-10-20T04:10:00.000Z",
      retry: { maxAttempts: 2, baseBackoffMs: 0, sleepFn: async () => {} },
    });

    expect(result.sync_log.status).toBe("failed");
    expect(result.sync_log.errorMessage).toBe("Provider rate limit exceeded");
    expect(result.sync_log.errorCode).toBe("forced_error");
    expect(result.integration.lastErrorMessage).toBe(
      "Provider rate limit exceeded"
    );
    expect(result.integration.lastSuccessfulSyncAt).toBe(NOW);

    const logs = listSyncLogs(store, bayOperatorId, "rezdy", {
      status: "failed",
    });
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0]!.error_message_readable).toBe(
      "Provider rate limit exceeded"
    );
  });

  it("rejects a second concurrent sync (lock)", async () => {
    const { store, bayOperatorId, bayOwnerId } = freshStore();
    const connected = await connectBay(store, bayOperatorId, bayOwnerId);
    const id = connected.integration.id;

    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });

    const originalList = mockController.adapter.listProducts.bind(
      mockController.adapter
    );
    mockController.adapter.listProducts = async (integration) => {
      await gate;
      return originalList(integration);
    };

    const first = runSync(store, id, "full", {
      now: "2026-10-20T05:00:00.000Z",
      retry: { maxAttempts: 1 },
    });

    // Wait until lock is acquired
    await new Promise((r) => setTimeout(r, 20));
    expect(isSyncLocked(id)).toBe(true);

    await expect(
      runSync(store, id, "manual", { now: "2026-10-20T05:00:01.000Z" })
    ).rejects.toMatchObject({ code: "sync_in_progress", status: 409 });

    release();
    const done = await first;
    expect(done.sync_log.status).toBe("success");
    expect(isSyncLocked(id)).toBe(false);
  });

  it("marks missing in-window sessions cancelled on sync", async () => {
    const { store, bayOperatorId, bayOwnerId } = freshStore();
    const connected = await connectBay(store, bayOperatorId, bayOwnerId);
    const kayak = [...store.externalProducts!.values()].find(
      (p) => p.externalId === "prod-harbour-kayak"
    )!;
    setProductEnabledForDeals(store, bayOperatorId, "rezdy", kayak.id, true);

    await runSync(store, connected.integration.id, "full", { now: NOW });
    const before = [...store.externalSessions!.values()].filter(
      (s) => s.externalProductId === kayak.id && s.status === "live"
    );
    expect(before.length).toBeGreaterThan(0);
    const doomed = before[0]!;

    mockController.cancelSession("prod-harbour-kayak", doomed.externalId);
    // Also remove from mock list by cancelling — listSessions still returns it
    // with cancelled status. For "missing", delete from mock state:
    const sessions = mockController.state.sessionsByProduct.get(
      "prod-harbour-kayak"
    )!;
    mockController.state.sessionsByProduct.set(
      "prod-harbour-kayak",
      sessions.filter((s) => s.external_id !== doomed.externalId)
    );

    await runSync(store, connected.integration.id, "full", {
      now: "2026-10-20T04:30:00.000Z",
    });

    const after = store.externalSessions!.get(doomed.id)!;
    expect(after.status).toBe("cancelled");
    expect(after.seatsAvailable).toBe(0);
  });

  it("withRetry retries then succeeds", async () => {
    let attempts = 0;
    const value = await withRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) throw new Error("transient");
        return "ok";
      },
      { maxAttempts: 3, baseBackoffMs: 0, sleepFn: async () => {} }
    );
    expect(value).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("poll job syncs connected integrations past poll_interval", async () => {
    const { store, bayOperatorId, bayOwnerId } = freshStore();
    const connected = await connectBay(store, bayOperatorId, bayOwnerId);
    // Force a short poll interval
    const row = store.integrations!.get(connected.integration.id)!;
    store.integrations!.set(connected.integration.id, {
      ...row,
      pollIntervalSeconds: 60,
      lastSuccessfulSyncAt: NOW,
    });

    const tooSoon = await runIntegrationPollJob(store, {
      now: "2026-10-20T04:00:30.000Z",
    });
    expect(tooSoon.started).toHaveLength(0);

    const due = await runIntegrationPollJob(store, {
      now: "2026-10-20T04:02:00.000Z",
    });
    expect(due.started).toContain(connected.integration.id);
    expect(due.results[0]?.sync_log.syncType).toBe("incremental");
  });

  it("webhook verifies signature and runs incremental sync", async () => {
    const { store, bayOperatorId, bayOwnerId } = freshStore();
    ensureIntegrationSecretsConfigured();
    const connected = await connectBay(store, bayOperatorId, bayOwnerId);

    const secret = "whsec_test_123";
    const ref = await storeSecret(secret, "webhook");
    const integration = store.integrations!.get(
      connected.integration.id
    ) as Integration;
    store.integrations!.set(integration.id, {
      ...integration,
      webhookSecretRef: ref,
    });

    const body = { product_external_id: "prod-harbour-kayak" };
    const bodyStr = JSON.stringify(body);
    const sig = createHmac("sha256", secret)
      .update(bodyStr, "utf8")
      .digest("hex");

    expect(verifyWebhookSignature(secret, body, sig)).toBe(true);
    expect(verifyWebhookSignature(secret, body, "deadbeef")).toBe(false);

    const result = await handleIntegrationWebhook(
      store,
      "rezdy",
      {
        headers: { "x-webhook-signature": sig },
        body,
      },
      { now: "2026-10-20T04:15:00.000Z" }
    );

    expect(result.ok).toBe(true);
    expect(result.sync?.sync_log.syncType).toBe("webhook");
    expect(
      store.integrations!.get(integration.id)?.webhookLastReceivedAt
    ).toBe("2026-10-20T04:15:00.000Z");

    // silence unused
    void bayOperatorId;
    void bayOwnerId;
  });

  it("S12: rejects webhook when webhookSecretRef is missing", async () => {
    const { store, bayOperatorId, bayOwnerId } = freshStore();
    ensureIntegrationSecretsConfigured();
    const connected = await connectBay(store, bayOperatorId, bayOwnerId);

    const integration = store.integrations!.get(
      connected.integration.id
    ) as Integration;
    expect(integration.webhookSecretRef).toBeNull();

    await expect(
      handleIntegrationWebhook(
        store,
        "rezdy",
        {
          headers: {},
          body: { product_external_id: "prod-harbour-kayak" },
        },
        { now: "2026-10-20T04:15:00.000Z" }
      )
    ).rejects.toMatchObject({
      status: 401,
      code: "webhook_secret_missing",
    });

    expect(
      store.integrations!.get(integration.id)?.webhookLastReceivedAt
    ).toBeNull();

    void bayOperatorId;
    void bayOwnerId;
  });

  it("S12: rejects webhook with invalid HMAC signature", async () => {
    const { store, bayOperatorId, bayOwnerId } = freshStore();
    ensureIntegrationSecretsConfigured();
    const connected = await connectBay(store, bayOperatorId, bayOwnerId);

    const secret = "whsec_test_456";
    const ref = await storeSecret(secret, "webhook");
    const integration = store.integrations!.get(
      connected.integration.id
    ) as Integration;
    store.integrations!.set(integration.id, {
      ...integration,
      webhookSecretRef: ref,
    });

    await expect(
      handleIntegrationWebhook(
        store,
        "rezdy",
        {
          headers: { "x-webhook-signature": "deadbeef".repeat(8) },
          body: { product_external_id: "prod-harbour-kayak" },
        },
        { now: "2026-10-20T04:16:00.000Z" }
      )
    ).rejects.toMatchObject({
      status: 401,
      code: "invalid_signature",
    });

    expect(
      store.integrations!.get(integration.id)?.webhookLastReceivedAt
    ).toBeNull();

    void bayOperatorId;
    void bayOwnerId;
  });

  it("S12: accepts webhook with valid opaque token (Rezdy-style)", async () => {
    const { store, bayOperatorId, bayOwnerId } = freshStore();
    ensureIntegrationSecretsConfigured();
    const connected = await connectBay(store, bayOperatorId, bayOwnerId);

    const secret = "opaque_token_rezdy_abc";
    const ref = await storeSecret(secret, "webhook");
    const integration = store.integrations!.get(
      connected.integration.id
    ) as Integration;
    store.integrations!.set(integration.id, {
      ...integration,
      webhookSecretRef: ref,
    });

    const result = await handleIntegrationWebhook(
      store,
      "rezdy",
      {
        headers: { "x-webhook-token": secret },
        body: { product_external_id: "prod-harbour-kayak" },
      },
      { now: "2026-10-20T04:17:00.000Z" }
    );

    expect(result.ok).toBe(true);
    expect(
      store.integrations!.get(integration.id)?.webhookLastReceivedAt
    ).toBe("2026-10-20T04:17:00.000Z");

    void bayOperatorId;
    void bayOwnerId;
  });

  it("auto_enable_new_products enables newly discovered products", async () => {
    const { store, bayOperatorId, bayOwnerId } = freshStore();
    const connected = await connectBay(store, bayOperatorId, bayOwnerId);
    store.integrations!.set(connected.integration.id, {
      ...store.integrations!.get(connected.integration.id)!,
      autoEnableNewProducts: true,
    });

    // Clear products so next sync recreates them
    store.externalProducts = new Map();
    store.externalSessions = new Map();

    await runSync(store, connected.integration.id, "full", {
      now: "2026-10-20T04:20:00.000Z",
    });

    const products = [...store.externalProducts!.values()];
    expect(products.length).toBe(2);
    expect(products.every((p) => p.isEnabledForDeals)).toBe(true);
    // Sessions should be synced for enabled products
    expect(store.externalSessions!.size).toBeGreaterThan(0);

    void bayOperatorId;
    void bayOwnerId;
  });
});
