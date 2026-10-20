import { afterEach, describe, expect, it } from "vitest";
import {
  getDealDraftHttpStore,
  listOperatorsForUser,
  setDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import {
  createDraftDeal,
  updateDraftDeal,
} from "@/lib/marketplace/deal-draft";
import { DEV_SEED_IDS, DEV_SEED_USERS } from "@/lib/marketplace/seed-dev";
import { requirePermission } from "@/lib/marketplace/permissions";
import type { User } from "@supabase/supabase-js";

afterEach(() => {
  setDealDraftHttpStore(null);
});

describe("deal editor HTTP wiring (chunk 22)", () => {
  it("auto-seeds Harbour Kayaks and lists operators by seed email", () => {
    const ops = listOperatorsForUser("unknown-auth-id", "manager@harbour-kayaks.dev");
    expect(ops.some((o) => o.id === DEV_SEED_IDS.harbourKayaks.operatorId)).toBe(
      true
    );
    expect(ops[0]?.role).toBe("manager");
  });

  it("memory role lookup grants inventory.write for seeded manager email", async () => {
    getDealDraftHttpStore(); // ensure seed + lookup installed
    const user = {
      id: "auth-user-not-in-seed",
      email: "manager@harbour-kayaks.dev",
      app_metadata: {},
      user_metadata: {},
      aud: "authenticated",
      created_at: "",
    } as User;

    const result = await requirePermission(
      new Request("http://localhost/api/marketplace/operators/x/deals"),
      DEV_SEED_IDS.harbourKayaks.operatorId,
      "inventory.write",
      {
        getAuth: async () => ({ user, accessToken: "tok" }),
        lookupRole: async () => null,
        resolvePlatformAdmin: () => false,
      }
    );
    expect(result.ok).toBe(true);
  });

  it("PATCH accepts publish_at", () => {
    const store = getDealDraftHttpStore();
    const deal = createDraftDeal(store, {
      operatorId: DEV_SEED_IDS.harbourKayaks.operatorId,
      dealType: "manual_session",
      actor: {
        type: "user",
        id: DEV_SEED_IDS.harbourKayaks.managerUserId,
      },
      now: "2026-10-20T05:00:00.000Z",
    });

    const updated = updateDraftDeal(
      store,
      deal.id,
      { publish_at: "2026-10-22T00:00:00.000Z" },
      {
        actor: {
          type: "user",
          id: DEV_SEED_IDS.harbourKayaks.managerUserId,
        },
      }
    );
    expect(updated.publishAt).toBe("2026-10-22T00:00:00.000Z");
  });

  it("DEV_SEED_USERS includes manager email used by the editor", () => {
    expect(
      DEV_SEED_USERS.some((u) => u.email === "manager@harbour-kayaks.dev")
    ).toBe(true);
  });
});
