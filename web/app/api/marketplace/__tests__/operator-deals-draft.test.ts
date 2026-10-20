/**
 * Chunk 12 HTTP smoke: permission gate + shared process store used by routes.
 * Full draft behaviour is covered in web/lib/marketplace/__tests__/deal-draft.test.ts.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import {
  createDealDraftStore,
  createDraftDeal,
  duplicateDeal,
  getDealDetail,
  seedDealSession,
  updateDraftDeal,
} from "@/lib/marketplace/deal-draft";
import {
  getDealDraftHttpStore,
  setDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import { requirePermission } from "@/lib/marketplace/permissions";
import { seedDevMarketplace, DEV_SEED_IDS } from "@/lib/marketplace/seed-dev";
import type { UserRole } from "@/lib/marketplace/enums";
import type { DealSession } from "@/lib/marketplace/deal-session";

const NOW = "2026-10-20T05:00:00.000Z";

function fakeUser(id: string): User {
  return {
    id,
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "",
  } as User;
}

function authAs(role: UserRole) {
  const ids = DEV_SEED_IDS.harbourKayaks;
  const userId =
    role === "owner"
      ? ids.ownerUserId
      : role === "manager"
        ? ids.managerUserId
        : ids.staffUserId;
  return {
    getAuth: async () => ({
      user: fakeUser(userId),
      accessToken: "test-token",
    }),
    lookupRole: async () => role,
    resolvePlatformAdmin: () => false,
  };
}

afterEach(() => {
  setDealDraftHttpStore(null);
  vi.restoreAllMocks();
});

describe("Chunk 12 deal draft API (permissions + store)", () => {
  it("manager create works, staff write 403, defaults pre-filled, PATCH ignores status, duplicate skips sessions", async () => {
    const seeded = seedDevMarketplace({ now: NOW });
    const store = createDealDraftStore(seeded.store);
    setDealDraftHttpStore(store);

    const managerOk = await requirePermission(
      new Request("http://localhost/api/marketplace/operators/x/deals"),
      DEV_SEED_IDS.harbourKayaks.operatorId,
      "inventory.write",
      authAs("manager")
    );
    expect(managerOk.ok).toBe(true);

    const staffDenied = await requirePermission(
      new Request("http://localhost/api/marketplace/operators/x/deals"),
      DEV_SEED_IDS.harbourKayaks.operatorId,
      "inventory.write",
      authAs("staff")
    );
    expect(staffDenied.ok).toBe(false);
    if (!staffDenied.ok) {
      expect(staffDenied.response.status).toBe(403);
    }

    const staffRead = await requirePermission(
      new Request("http://localhost/api/marketplace/operator-deals/x"),
      DEV_SEED_IDS.harbourKayaks.operatorId,
      "inventory.read",
      authAs("staff")
    );
    expect(staffRead.ok).toBe(true);

    const deal = createDraftDeal(getDealDraftHttpStore(), {
      operatorId: DEV_SEED_IDS.harbourKayaks.operatorId,
      dealType: "manual_session",
      actor: { type: "user", id: DEV_SEED_IDS.harbourKayaks.managerUserId },
      now: NOW,
    });

    expect(deal.sourceProvider).toBe("manual");
    expect(deal.capacityMode).toBe("manual_count");
    expect(deal.salesCutoffMinutes).toBe(
      seeded.harbourKayaks.defaults.defaultSalesCutoffMinutes
    );
    expect(deal.discountMechanism).toBe(
      seeded.harbourKayaks.defaults.defaultDiscountMechanism
    );
    expect(deal.bookingDestinationType).toBe(
      seeded.harbourKayaks.defaults.defaultBookingDestinationType
    );

    const patched = updateDraftDeal(
      getDealDraftHttpStore(),
      deal.id,
      { title: "Harbour Sunset Deal", status: "live", pause_reason: "operator" },
      {
        actor: { type: "user", id: DEV_SEED_IDS.harbourKayaks.managerUserId },
        now: NOW,
      }
    );
    expect(patched.status).toBe("draft");
    expect(patched.pauseReason).toBeNull();
    expect(patched.title).toBe("Harbour Sunset Deal");

    seedDealSession(getDealDraftHttpStore(), {
      id: "sess-1",
      dealId: deal.id,
      externalSessionId: null,
      startAt: "2026-10-22T01:00:00.000Z",
      endAt: null,
      providerSeatsAvailable: null,
      manualSeatsAvailable: 4,
      seatCap: null,
      seatsDisplayed: 4,
      status: "live",
      lastSyncedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    } satisfies DealSession);

    const copy = duplicateDeal(getDealDraftHttpStore(), deal.id, {
      actor: { type: "user", id: DEV_SEED_IDS.harbourKayaks.managerUserId },
      now: NOW,
    });
    expect(copy.title).toBe("Copy of Harbour Sunset Deal");
    expect(
      (await getDealDetail(getDealDraftHttpStore(), copy.id)).sessions
    ).toHaveLength(0);
    expect(
      (await getDealDetail(getDealDraftHttpStore(), deal.id)).sessions
    ).toHaveLength(1);
  });

  it("route modules export the Chunk 12 handlers", async () => {
    const createMod = await import(
      "@/app/api/marketplace/operators/[operatorId]/deals/route"
    );
    const dealMod = await import(
      "@/app/api/marketplace/operator-deals/[id]/route"
    );
    const dupMod = await import(
      "@/app/api/marketplace/operator-deals/[id]/duplicate/route"
    );
    expect(createMod.POST).toEqual(expect.any(Function));
    expect(dealMod.GET).toEqual(expect.any(Function));
    expect(dealMod.PATCH).toEqual(expect.any(Function));
    expect(dealMod.DELETE).toEqual(expect.any(Function));
    expect(dupMod.POST).toEqual(expect.any(Function));
  });
});
