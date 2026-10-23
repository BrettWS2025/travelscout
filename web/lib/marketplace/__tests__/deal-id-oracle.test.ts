/**
 * Security S19: unauthenticated callers must not learn whether a deal id exists
 * via operator/admin deal routes (auth before existence).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import {
  createDealDraftStore,
  createDraftDeal,
} from "@/lib/marketplace/deal-draft";
import {
  requirePermissionForDeal,
  setDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import { GET as getOperatorDeal } from "@/app/api/marketplace/operator-deals/[id]/route";
import { POST as approveDealRoute } from "@/app/api/marketplace/admin/deals/[id]/approve/route";
import { seedDevMarketplace, DEV_SEED_IDS } from "@/lib/marketplace/seed-dev";

const NOW = "2026-10-20T05:00:00.000Z";
const MISSING_ID = "00000000-0000-4000-8000-000000000099";

function fakeUser(id: string): User {
  return {
    id,
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "",
  } as User;
}

afterEach(() => {
  setDealDraftHttpStore(null);
  vi.restoreAllMocks();
});

describe("requirePermissionForDeal (S19 deal id oracle)", () => {
  it("returns the same 401 for missing and existing deals when unauthenticated", async () => {
    const seeded = seedDevMarketplace({ now: NOW });
    const store = createDealDraftStore(seeded.store);
    setDealDraftHttpStore(store);

    const deal = createDraftDeal(store, {
      operatorId: DEV_SEED_IDS.harbourKayaks.operatorId,
      dealType: "manual_session",
      actor: { type: "user", id: DEV_SEED_IDS.harbourKayaks.ownerUserId },
      now: NOW,
    });

    const unauth = {
      getAuth: async () => ({ user: null as User | null }),
    };

    const missing = await requirePermissionForDeal(
      new Request("http://localhost/api/marketplace/operator-deals/x"),
      MISSING_ID,
      "inventory.read",
      unauth
    );
    const existing = await requirePermissionForDeal(
      new Request("http://localhost/api/marketplace/operator-deals/x"),
      deal.id,
      "inventory.read",
      unauth
    );

    expect(missing.ok).toBe(false);
    expect(existing.ok).toBe(false);
    if (missing.ok || existing.ok) return;
    expect(missing.response.status).toBe(401);
    expect(existing.response.status).toBe(401);
    const missingBody = await missing.response.json();
    const existingBody = await existing.response.json();
    expect(missingBody).toEqual(existingBody);
  });

  it("returns 404 for missing deals only after authentication", async () => {
    const seeded = seedDevMarketplace({ now: NOW });
    setDealDraftHttpStore(createDealDraftStore(seeded.store));

    const result = await requirePermissionForDeal(
      new Request("http://localhost/api/marketplace/operator-deals/x"),
      MISSING_ID,
      "inventory.read",
      {
        getAuth: async () => ({
          user: fakeUser(DEV_SEED_IDS.harbourKayaks.ownerUserId),
          accessToken: "test-token",
        }),
        lookupRole: async () => "owner",
        resolvePlatformAdmin: () => false,
      }
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(404);
    const body = await result.response.json();
    expect(body.error).toBe("Deal not found.");
  });

  it("allows authenticated owners and still returns 403 for wrong operator", async () => {
    const seeded = seedDevMarketplace({ now: NOW });
    const store = createDealDraftStore(seeded.store);
    setDealDraftHttpStore(store);

    const deal = createDraftDeal(store, {
      operatorId: DEV_SEED_IDS.harbourKayaks.operatorId,
      dealType: "manual_session",
      actor: { type: "user", id: DEV_SEED_IDS.harbourKayaks.ownerUserId },
      now: NOW,
    });

    const ownerOk = await requirePermissionForDeal(
      new Request("http://localhost/api/marketplace/operator-deals/x"),
      deal.id,
      "inventory.read",
      {
        getAuth: async () => ({
          user: fakeUser(DEV_SEED_IDS.harbourKayaks.ownerUserId),
          accessToken: "test-token",
        }),
        lookupRole: async () => "owner",
        resolvePlatformAdmin: () => false,
      }
    );
    expect(ownerOk.ok).toBe(true);
    if (!ownerOk.ok) return;
    expect(ownerOk.operatorId).toBe(DEV_SEED_IDS.harbourKayaks.operatorId);

    const stranger = await requirePermissionForDeal(
      new Request("http://localhost/api/marketplace/operator-deals/x"),
      deal.id,
      "inventory.read",
      {
        getAuth: async () => ({
          user: fakeUser("stranger-user"),
          accessToken: "test-token",
        }),
        lookupRole: async () => null,
        resolvePlatformAdmin: () => false,
      }
    );
    expect(stranger.ok).toBe(false);
    if (stranger.ok) return;
    expect(stranger.response.status).toBe(403);
  });
});

describe("operator/admin deal routes (S19)", () => {
  it("GET operator-deals/:id returns 401 for both missing and existing ids without auth", async () => {
    const seeded = seedDevMarketplace({ now: NOW });
    const store = createDealDraftStore(seeded.store);
    setDealDraftHttpStore(store);

    const deal = createDraftDeal(store, {
      operatorId: DEV_SEED_IDS.harbourKayaks.operatorId,
      dealType: "manual_session",
      actor: { type: "user", id: DEV_SEED_IDS.harbourKayaks.ownerUserId },
      now: NOW,
    });

    const missing = await getOperatorDeal(
      new Request("http://localhost/api/marketplace/operator-deals/" + MISSING_ID),
      { params: { id: MISSING_ID } }
    );
    const existing = await getOperatorDeal(
      new Request("http://localhost/api/marketplace/operator-deals/" + deal.id),
      { params: { id: deal.id } }
    );

    expect(missing.status).toBe(401);
    expect(existing.status).toBe(401);
    expect(await missing.json()).toEqual(await existing.json());
  });

  it("POST admin approve returns 401 for both missing and existing ids without auth", async () => {
    const seeded = seedDevMarketplace({ now: NOW });
    const store = createDealDraftStore(seeded.store);
    setDealDraftHttpStore(store);

    const deal = createDraftDeal(store, {
      operatorId: DEV_SEED_IDS.harbourKayaks.operatorId,
      dealType: "manual_session",
      actor: { type: "user", id: DEV_SEED_IDS.harbourKayaks.ownerUserId },
      now: NOW,
    });

    const missing = await approveDealRoute(
      new Request(
        "http://localhost/api/marketplace/admin/deals/" + MISSING_ID + "/approve",
        { method: "POST" }
      ),
      { params: { id: MISSING_ID } }
    );
    const existing = await approveDealRoute(
      new Request(
        "http://localhost/api/marketplace/admin/deals/" + deal.id + "/approve",
        { method: "POST" }
      ),
      { params: { id: deal.id } }
    );

    expect(missing.status).toBe(401);
    expect(existing.status).toBe(401);
    expect(await missing.json()).toEqual(await existing.json());
  });
});
