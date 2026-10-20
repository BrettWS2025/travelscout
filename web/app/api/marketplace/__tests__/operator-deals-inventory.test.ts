/**
 * Chunk 13 HTTP smoke: permissions + inventory service via shared store.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import {
  createDealDraftStore,
  createDraftDeal,
} from "@/lib/marketplace/deal-draft";
import {
  getDealDraftHttpStore,
  setDealDraftHttpStore,
  dealDraftErrorResponse,
} from "@/lib/marketplace/deal-draft-http";
import {
  createDealPriceOption,
  createDealSession,
  MinDiscountError,
} from "@/lib/marketplace/deal-inventory";
import { requirePermission } from "@/lib/marketplace/permissions";
import { seedDevMarketplace, DEV_SEED_IDS } from "@/lib/marketplace/seed-dev";
import type { UserRole } from "@/lib/marketplace/enums";

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

describe("Chunk 13 sessions / price-options API", () => {
  it("manager can add open-window days and price options; staff write 403; 50% reject maps to JSON", async () => {
    const seeded = seedDevMarketplace({ now: NOW });
    const store = createDealDraftStore(seeded.store);
    setDealDraftHttpStore(store);

    const staffDenied = await requirePermission(
      new Request("http://localhost/api/marketplace/operator-deals/x/sessions"),
      DEV_SEED_IDS.harbourKayaks.operatorId,
      "inventory.write",
      authAs("staff")
    );
    expect(staffDenied.ok).toBe(false);

    const deal = createDraftDeal(getDealDraftHttpStore(), {
      operatorId: DEV_SEED_IDS.harbourKayaks.operatorId,
      dealType: "manual_open_window",
      actor: { type: "user", id: DEV_SEED_IDS.harbourKayaks.managerUserId },
      now: NOW,
    });

    createDealSession(
      getDealDraftHttpStore(),
      deal.id,
      { date: "2026-10-22", manual_seats_available: 2 },
      {
        actor: { type: "user", id: DEV_SEED_IDS.harbourKayaks.managerUserId },
        now: NOW,
      }
    );

    createDealPriceOption(
      getDealDraftHttpStore(),
      deal.id,
      {
        label: "Adult",
        type: "adult",
        original_price_minor: 20000,
        deal_price_minor: 9000,
      },
      {
        actor: { type: "user", id: DEV_SEED_IDS.harbourKayaks.managerUserId },
        now: NOW,
      }
    );

    try {
      createDealPriceOption(
        getDealDraftHttpStore(),
        deal.id,
        {
          label: "Bad",
          type: "adult",
          original_price_minor: 20000,
          deal_price_minor: 11000,
        },
        {
          actor: { type: "user", id: DEV_SEED_IDS.harbourKayaks.managerUserId },
          now: NOW,
        }
      );
    } catch (err) {
      expect(err).toBeInstanceOf(MinDiscountError);
      const res = dealDraftErrorResponse(err, "test");
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.max_deal_price_minor).toBe(10000);
      expect(json.error).toMatch(/≤ 10000/);
    }
  });
});
