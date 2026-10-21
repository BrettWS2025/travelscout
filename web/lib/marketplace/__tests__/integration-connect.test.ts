/**
 * Chunk 27 — connect / test / disconnect / settings with the mock adapter.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDealDraftStore } from "@/lib/marketplace/deal-draft";
import {
  assertNoSecretRefs,
  type Integration,
} from "@/lib/marketplace/integration";
import {
  connectIntegration,
  countDealsPausedOnDisconnect,
  disconnectIntegration,
  getDisconnectPreview,
  getIntegrationDetail,
  listIntegrationCards,
  resetIntegrationSecretsBootstrap,
  serializeIntegrationPublic,
  testIntegrationBookingLink,
  testIntegrationConnection,
  updateIntegrationSettings,
} from "@/lib/marketplace/integration-connect";
import {
  makeDealFixture,
  seedDeal,
} from "@/lib/marketplace/deal-status";
import {
  createMockAdapter,
  registerAdapterFactory,
  resetAdapterRegistry,
} from "@/lib/marketplace/providers";
import { DEV_SEED_IDS, seedDevMarketplace } from "@/lib/marketplace/seed-dev";
import { readSecret } from "@/lib/marketplace/secrets";

const NOW = "2026-10-20T04:00:00.000Z";
const LATER = "2026-10-20T05:00:00.000Z";

function freshStore() {
  const seeded = seedDevMarketplace({ now: NOW });
  const store = createDealDraftStore(seeded.store);
  store.integrations = new Map(seeded.integrations.map((i) => [i.id, i]));
  store.syncLogs = new Map();
  return {
    store,
    bayOperatorId: DEV_SEED_IDS.bayCruises.operatorId,
    bayOwnerId: DEV_SEED_IDS.bayCruises.ownerUserId,
    harbourOperatorId: DEV_SEED_IDS.harbourKayaks.operatorId,
    harbourOwnerId: DEV_SEED_IDS.harbourKayaks.ownerUserId,
    seeded,
  };
}

function seedLiveIntegratedDeal(
  store: ReturnType<typeof createDealDraftStore>,
  opts: {
    id: string;
    operatorId: string;
    integrationId: string;
    status?: "live" | "scheduled";
  }
) {
  return seedDeal(
    store,
    makeDealFixture({
      id: opts.id,
      operatorId: opts.operatorId,
      dealType: "integrated_session",
      sourceProvider: "rezdy",
      integrationId: opts.integrationId,
      status: opts.status ?? "live",
      title: "Harbour Kayak Deal",
      capacityMode: "live_provider",
      discountMechanism: "promo_code",
      createdAt: NOW,
      updatedAt: NOW,
    })
  );
}

describe("Chunk 27 integration connect / disconnect", () => {
  let mockController: ReturnType<typeof createMockAdapter>;

  beforeEach(() => {
    resetIntegrationSecretsBootstrap();
    resetAdapterRegistry();
    mockController = createMockAdapter({ now: new Date(NOW) });
    registerAdapterFactory("rezdy", () => mockController.adapter);
  });

  afterEach(() => {
    resetIntegrationSecretsBootstrap();
    resetAdapterRegistry();
  });

  it("lists provider cards with available flag and Bay Cruises not_connected rezdy", () => {
    const { store, bayOperatorId } = freshStore();
    const cards = listIntegrationCards(store, bayOperatorId);

    const rezdy = cards.find((c) => c.provider === "rezdy");
    const fh = cards.find((c) => c.provider === "fareharbor");
    expect(rezdy?.available).toBe(true);
    expect(rezdy?.status).toBe("not_connected");
    expect(rezdy?.integration_id).toBe(DEV_SEED_IDS.bayCruises.integrationId);
    expect(fh?.available).toBe(false);
    expect(fh?.status).toBe("not_connected");
  });

  it("connects mock adapter, stores credentials_ref only, and starts a sync", async () => {
    const { store, bayOperatorId, bayOwnerId } = freshStore();

    const result = await connectIntegration(
      store,
      bayOperatorId,
      "rezdy",
      { api_key: "test-key-bay" },
      { actor: { type: "user", id: bayOwnerId }, now: NOW }
    );

    expect(result.integration.status).toBe("connected");
    expect(result.integration.externalAccountName).toBe("Mock Bay Cruises");
    expect(result.integration.credentialsRef).toBeTruthy();
    expect(result.integration.syncMode).toBe("polling");
    expect(result.integration.pollIntervalSeconds).toBeGreaterThanOrEqual(60);
    expect(result.sync_log.status).toBe("success");
    expect(result.sync_log.syncType).toBe("full");
    expect(result.integration.lastSuccessfulSyncAt).toBe(NOW);

    const publicRow = result.public;
    expect(publicRow).not.toHaveProperty("credentials_ref");
    expect(publicRow).not.toHaveProperty("credentialsRef");
    expect(() => assertNoSecretRefs(publicRow)).not.toThrow();

    // Secret is readable server-side
    const secret = await readSecret(result.integration.credentialsRef!);
    expect(secret).toContain("test-key-bay");

    const cards = listIntegrationCards(store, bayOperatorId);
    expect(cards.find((c) => c.provider === "rezdy")?.status).toBe("connected");
    expect(cards.find((c) => c.provider === "rezdy")?.account_name).toBe(
      "Mock Bay Cruises"
    );
  });

  it("rejects connect for coming-soon providers", async () => {
    const { store, bayOperatorId, bayOwnerId } = freshStore();
    await expect(
      connectIntegration(
        store,
        bayOperatorId,
        "fareharbor",
        { api_key: "x" },
        { actor: { type: "user", id: bayOwnerId }, now: NOW }
      )
    ).rejects.toMatchObject({ status: 400, code: "provider_unavailable" });
  });

  it("testConnection succeeds after connect and fails when forced", async () => {
    const { store, bayOperatorId, bayOwnerId } = freshStore();
    await connectIntegration(
      store,
      bayOperatorId,
      "rezdy",
      { api_key: "ok" },
      { actor: { type: "user", id: bayOwnerId }, now: NOW }
    );

    const ok = await testIntegrationConnection(store, bayOperatorId, "rezdy");
    expect(ok).toEqual({ ok: true });

    mockController.setForceError("Rezdy API unreachable");
    const again = await testIntegrationConnection(
      store,
      bayOperatorId,
      "rezdy"
    );
    expect(again).toEqual({ ok: false, error: "Rezdy API unreachable" });
  });

  it("disconnect-preview counts live deals; disconnect auto-pauses them", async () => {
    const { store, bayOperatorId, bayOwnerId } = freshStore();
    const connected = await connectIntegration(
      store,
      bayOperatorId,
      "rezdy",
      { api_key: "key-1" },
      { actor: { type: "user", id: bayOwnerId }, now: NOW }
    );
    const integrationId = connected.integration.id;

    seedLiveIntegratedDeal(store, {
      id: "deal-live-1",
      operatorId: bayOperatorId,
      integrationId,
      status: "live",
    });
    seedLiveIntegratedDeal(store, {
      id: "deal-live-2",
      operatorId: bayOperatorId,
      integrationId,
      status: "live",
    });
    seedLiveIntegratedDeal(store, {
      id: "deal-scheduled-1",
      operatorId: bayOperatorId,
      integrationId,
      status: "scheduled",
    });
    seedLiveIntegratedDeal(store, {
      id: "deal-draft-1",
      operatorId: bayOperatorId,
      integrationId,
      status: "live",
    });
    // Flip draft one to draft so it is not paused
    const draft = store.deals.get("deal-draft-1")!;
    store.deals.set("deal-draft-1", { ...draft, status: "draft" });

    expect(countDealsPausedOnDisconnect(store, integrationId)).toBe(3);
    const preview = getDisconnectPreview(store, bayOperatorId, "rezdy");
    expect(preview.deals_to_pause).toBe(3);

    await expect(
      disconnectIntegration(store, bayOperatorId, "rezdy", {
        confirm: false,
        actor: { type: "user", id: bayOwnerId },
        now: LATER,
      })
    ).rejects.toMatchObject({ code: "confirm_required" });

    const disconnected = await disconnectIntegration(
      store,
      bayOperatorId,
      "rezdy",
      {
        confirm: true,
        actor: { type: "user", id: bayOwnerId },
        now: LATER,
      }
    );

    expect(disconnected.integration.status).toBe("disconnected");
    expect(disconnected.integration.credentialsRef).toBeNull();
    expect(disconnected.paused_deal_ids.sort()).toEqual(
      ["deal-live-1", "deal-live-2", "deal-scheduled-1"].sort()
    );

    expect(store.deals.get("deal-live-1")?.status).toBe("auto_paused");
    expect(store.deals.get("deal-live-1")?.pauseReason).toBe(
      "integration_disconnected"
    );
    expect(store.deals.get("deal-scheduled-1")?.status).toBe("auto_paused");
    expect(store.deals.get("deal-draft-1")?.status).toBe("draft");

    expect(() =>
      assertNoSecretRefs(serializeIntegrationPublic(disconnected.integration))
    ).not.toThrow();
  });

  it("reconnect after disconnect clears integration_disconnected and restores live", async () => {
    const { store, bayOperatorId, bayOwnerId } = freshStore();
    const first = await connectIntegration(
      store,
      bayOperatorId,
      "rezdy",
      { api_key: "key-a" },
      { actor: { type: "user", id: bayOwnerId }, now: NOW }
    );
    const integrationId = first.integration.id;

    seedLiveIntegratedDeal(store, {
      id: "d1",
      operatorId: bayOperatorId,
      integrationId,
    });
    seedLiveIntegratedDeal(store, {
      id: "d2",
      operatorId: bayOperatorId,
      integrationId,
    });

    await disconnectIntegration(store, bayOperatorId, "rezdy", {
      confirm: true,
      actor: { type: "user", id: bayOwnerId },
      now: LATER,
    });
    expect(store.deals.get("d1")?.status).toBe("auto_paused");
    expect(store.deals.get("d2")?.status).toBe("auto_paused");

    const reconnected = await connectIntegration(
      store,
      bayOperatorId,
      "rezdy",
      { api_key: "key-b" },
      { actor: { type: "user", id: bayOwnerId }, now: "2026-10-20T06:00:00.000Z" }
    );

    expect(reconnected.integration.status).toBe("connected");
    expect(reconnected.sync_log.status).toBe("success");
    expect(reconnected.resumed_deal_ids.sort()).toEqual(["d1", "d2"].sort());
    expect(store.deals.get("d1")?.status).toBe("live");
    expect(store.deals.get("d1")?.pauseReason).toBeNull();
    expect(store.deals.get("d2")?.status).toBe("live");
  });

  it("PATCHes settings and clamps poll_interval_seconds to adapter min/max", async () => {
    const { store, bayOperatorId, bayOwnerId } = freshStore();
    await connectIntegration(
      store,
      bayOperatorId,
      "rezdy",
      { api_key: "key" },
      { actor: { type: "user", id: bayOwnerId }, now: NOW }
    );

    const updated = updateIntegrationSettings(
      store,
      bayOperatorId,
      "rezdy",
      {
        sync_mode: "hybrid",
        poll_interval_seconds: 5, // below mock min 60
        booking_base_url: "https://book.bay.example",
        conversion_tracking_method: "promo_code",
        booking_source_label: "TravelScout",
        auto_enable_new_products: true,
        default_booking_destination_type: "provider_booking_page",
      },
      { now: LATER }
    );

    expect(updated.integration.syncMode).toBe("hybrid");
    expect(updated.integration.pollIntervalSeconds).toBe(60); // clamped to min
    expect(updated.integration.bookingBaseUrl).toBe(
      "https://book.bay.example"
    );
    expect(updated.integration.conversionTrackingMethod).toBe("promo_code");
    expect(updated.integration.autoEnableNewProducts).toBe(true);

    const tooHigh = updateIntegrationSettings(store, bayOperatorId, "rezdy", {
      poll_interval_seconds: 999999,
    });
    expect(tooHigh.integration.pollIntervalSeconds).toBe(3600);
  });

  it("connect failure leaves integration in error with readable message", async () => {
    const { store, bayOperatorId, bayOwnerId } = freshStore();
    mockController.setForceError("Supplier API key rejected");

    await expect(
      connectIntegration(
        store,
        bayOperatorId,
        "rezdy",
        { api_key: "bad" },
        { actor: { type: "user", id: bayOwnerId }, now: NOW }
      )
    ).rejects.toMatchObject({
      message: "Supplier API key rejected",
      status: 400,
    });

    const row = store.integrations!.get(
      DEV_SEED_IDS.bayCruises.integrationId
    ) as Integration;
    expect(row.status).toBe("error");
    expect(row.lastErrorMessage).toBe("Supplier API key rejected");
  });

  it("getIntegrationDetail returns card + public integration without secrets", async () => {
    const { store, bayOperatorId, bayOwnerId } = freshStore();
    await connectIntegration(
      store,
      bayOperatorId,
      "rezdy",
      { api_key: "detail-key" },
      { actor: { type: "user", id: bayOwnerId }, now: NOW }
    );

    const detail = getIntegrationDetail(store, bayOperatorId, "rezdy");
    expect(detail.card.status).toBe("connected");
    expect(detail.integration).toBeTruthy();
    expect(detail.integration).not.toHaveProperty("credentials_ref");
    expect(detail.integration).not.toHaveProperty("credentialsRef");
    expect(() => assertNoSecretRefs(detail.integration!)).not.toThrow();
  });

  it("testIntegrationBookingLink checks https booking_base_url", async () => {
    const { store, bayOperatorId, bayOwnerId } = freshStore();
    await connectIntegration(
      store,
      bayOperatorId,
      "rezdy",
      { api_key: "link-key" },
      { actor: { type: "user", id: bayOwnerId }, now: NOW }
    );
    updateIntegrationSettings(store, bayOperatorId, "rezdy", {
      booking_base_url: "https://book.example.test",
    });

    const ok = await testIntegrationBookingLink(
      store,
      bayOperatorId,
      "rezdy",
      {
        fetchFn: async () =>
          new Response(null, { status: 200 }) as Response,
      }
    );
    expect(ok.ok).toBe(true);
    expect(ok.url).toBe("https://book.example.test");

    const bad = await testIntegrationBookingLink(
      store,
      bayOperatorId,
      "rezdy",
      {
        fetchFn: async () =>
          new Response(null, { status: 404 }) as Response,
      }
    );
    expect(bad.ok).toBe(false);
  });
});
