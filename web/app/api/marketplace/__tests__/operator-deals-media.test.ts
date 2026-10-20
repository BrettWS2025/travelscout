/**
 * Chunk 14 HTTP smoke: permissions + media upload service via shared store.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import {
  createDealDraftStore,
  createDraftDeal,
} from "@/lib/marketplace/deal-draft";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
  setDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import {
  ImportProviderImagesStubError,
  MediaUploadBatchError,
  setCoverMedia,
  uploadDealMedia,
} from "@/lib/marketplace/deal-media-api";
import { buildSolidPng } from "@/lib/marketplace/image-dimensions";
import {
  createMemoryMediaStorage,
  setMediaStorage,
} from "@/lib/marketplace/media-storage";
import { requirePermission } from "@/lib/marketplace/permissions";
import { seedDevMarketplace, DEV_SEED_IDS } from "@/lib/marketplace/seed-dev";
import type { UserRole } from "@/lib/marketplace/enums";
import { listDealImages } from "@/lib/marketplace/deal-media";

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
  setMediaStorage(null);
  vi.restoreAllMocks();
});

describe("Chunk 14 media API (permissions + store)", () => {
  it("manager can upload and set cover; staff write 403; batch errors map to JSON", async () => {
    const seeded = seedDevMarketplace({ now: NOW });
    const store = createDealDraftStore(seeded.store);
    setDealDraftHttpStore(store);
    const storage = createMemoryMediaStorage();
    setMediaStorage(storage);

    const staffDenied = await requirePermission(
      new Request("http://localhost/api/marketplace/operator-deals/x/media"),
      DEV_SEED_IDS.harbourKayaks.operatorId,
      "inventory.write",
      authAs("staff")
    );
    expect(staffDenied.ok).toBe(false);
    if (!staffDenied.ok) {
      expect(staffDenied.response.status).toBe(403);
    }

    const deal = createDraftDeal(getDealDraftHttpStore(), {
      operatorId: DEV_SEED_IDS.harbourKayaks.operatorId,
      dealType: "manual_session",
      actor: { type: "user", id: DEV_SEED_IDS.harbourKayaks.managerUserId },
      now: NOW,
    });

    const png = buildSolidPng(1200, 800);
    const { media } = await uploadDealMedia(
      getDealDraftHttpStore(),
      deal.id,
      [
        {
          filename: "a.png",
          bytes: png,
          altText: "First uploaded cover image",
        },
        {
          filename: "b.png",
          bytes: png,
          altText: "Second uploaded gallery image",
        },
      ],
      {
        actor: { type: "user", id: DEV_SEED_IDS.harbourKayaks.managerUserId },
        now: NOW,
        storage,
      }
    );

    expect(media).toHaveLength(2);
    expect(listDealImages(store.media, deal.id).filter((m) => m.isCover)).toHaveLength(
      1
    );

    await setCoverMedia(
      getDealDraftHttpStore(),
      deal.id,
      media[1]!.id,
      {
        actor: { type: "user", id: DEV_SEED_IDS.harbourKayaks.managerUserId },
        now: NOW,
      }
    );
    await setCoverMedia(
      getDealDraftHttpStore(),
      deal.id,
      media[0]!.id,
      {
        actor: { type: "user", id: DEV_SEED_IDS.harbourKayaks.managerUserId },
        now: NOW,
      }
    );
    const covers = listDealImages(store.media, deal.id).filter((m) => m.isCover);
    expect(covers).toHaveLength(1);
    expect(covers[0]!.id).toBe(media[0]!.id);

    const small = buildSolidPng(50, 50);
    try {
      await uploadDealMedia(
        getDealDraftHttpStore(),
        deal.id,
        [{ filename: "tiny.png", bytes: small }],
        {
          actor: {
            type: "user",
            id: DEV_SEED_IDS.harbourKayaks.managerUserId,
          },
          now: NOW,
          storage,
        }
      );
      expect.fail("expected MediaUploadBatchError");
    } catch (err) {
      expect(err).toBeInstanceOf(MediaUploadBatchError);
      const res = dealDraftErrorResponse(err, "upload");
      expect(res.status).toBe(400);
      const body = (await res.json()) as {
        file_errors: { file: string }[];
      };
      expect(body.file_errors[0]?.file).toBe("tiny.png");
    }

    const stubRes = dealDraftErrorResponse(
      new ImportProviderImagesStubError(),
      "import"
    );
    expect(stubRes.status).toBe(501);
  });
});
