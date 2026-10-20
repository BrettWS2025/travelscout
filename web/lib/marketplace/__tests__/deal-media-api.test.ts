import { afterEach, describe, expect, it } from "vitest";
import {
  createDealDraftStore,
  createDraftDeal,
  getDealDetail,
} from "@/lib/marketplace/deal-draft";
import {
  DEAL_MEDIA_LIMITS,
  addDealMedia,
  listDealImages,
} from "@/lib/marketplace/deal-media";
import {
  ImportProviderImagesStubError,
  MediaUploadBatchError,
  addDealVideoEmbed,
  importProviderImages,
  patchDealMedia,
  removeDealMedia,
  reorderDealMediaItems,
  setCoverMedia,
  uploadDealMedia,
} from "@/lib/marketplace/deal-media-api";
import {
  buildSolidPng,
  readImageDimensions,
} from "@/lib/marketplace/image-dimensions";
import {
  createMemoryMediaStorage,
  setMediaStorage,
} from "@/lib/marketplace/media-storage";
import { transitionDeal } from "@/lib/marketplace/deal-status";
import { seedDevMarketplace, DEV_SEED_IDS } from "@/lib/marketplace/seed-dev";

const NOW = "2026-10-20T05:00:00.000Z";
const ACTOR = {
  type: "user" as const,
  id: DEV_SEED_IDS.harbourKayaks.managerUserId,
};

function harbourDeal() {
  const seeded = seedDevMarketplace({ now: NOW });
  const store = createDealDraftStore(seeded.store);
  const deal = createDraftDeal(store, {
    operatorId: DEV_SEED_IDS.harbourKayaks.operatorId,
    dealType: "manual_session",
    actor: ACTOR,
    now: NOW,
  });
  const storage = createMemoryMediaStorage();
  setMediaStorage(storage);
  return { store, deal, storage };
}

afterEach(() => {
  setMediaStorage(null);
});

describe("image-dimensions", () => {
  it("reads width/height from a generated PNG", () => {
    const bytes = buildSolidPng(1200, 800);
    const dims = readImageDimensions(bytes);
    expect(dims).toEqual({
      width: 1200,
      height: 800,
      mimeType: "image/png",
    });
  });

  it("rejects non-image bytes", () => {
    expect(() => readImageDimensions(new Uint8Array([1, 2, 3, 4]))).toThrow(
      /unrecognised|unsupported/i
    );
  });
});

describe("Chunk 14 media upload API", () => {
  it("rejects a small image, accepts a large one, rejects a 13th", async () => {
    const { store, deal, storage } = harbourDeal();

    const small = buildSolidPng(100, 80);
    await expect(
      uploadDealMedia(
        store,
        deal.id,
        [
          {
            filename: "tiny.png",
            bytes: small,
            contentType: "image/png",
          },
        ],
        { actor: ACTOR, now: NOW, storage }
      )
    ).rejects.toBeInstanceOf(MediaUploadBatchError);

    try {
      await uploadDealMedia(
        store,
        deal.id,
        [{ filename: "tiny.png", bytes: small, contentType: "image/png" }],
        { actor: ACTOR, now: NOW, storage }
      );
    } catch (err) {
      expect(err).toBeInstanceOf(MediaUploadBatchError);
      if (err instanceof MediaUploadBatchError) {
        expect(err.fileErrors[0]?.file).toBe("tiny.png");
        expect(err.fileErrors[0]?.message).toMatch(/1200×800|1200x800/i);
      }
    }

    expect(listDealImages(store.media, deal.id)).toHaveLength(0);

    const large = buildSolidPng(
      DEAL_MEDIA_LIMITS.minWidthPx,
      DEAL_MEDIA_LIMITS.minHeightPx
    );
    const { media, errors } = await uploadDealMedia(
      store,
      deal.id,
      [
        {
          filename: "hero.png",
          bytes: large,
          contentType: "image/png",
          altText: "Harbour kayak at dawn light",
        },
      ],
      { actor: ACTOR, now: NOW, storage }
    );

    expect(errors).toHaveLength(0);
    expect(media).toHaveLength(1);
    expect(media[0]!.width).toBe(1200);
    expect(media[0]!.height).toBe(800);
    expect(media[0]!.isCover).toBe(true);
    expect(media[0]!.source).toBe("upload");
    expect(media[0]!.storageKey).toBeTruthy();
    expect(storage.files.has(media[0]!.storageKey!)).toBe(true);
    expect(media[0]!.fileSizeBytes).toBe(large.byteLength);

    // Seed 11 more images so the next upload is the 13th
    for (let i = 1; i < DEAL_MEDIA_LIMITS.maxImagesPerDeal; i++) {
      addDealMedia(store.media, {
        dealId: deal.id,
        mediaType: "image",
        source: "upload",
        url: `https://cdn.example.com/seed-${i}.jpg`,
        altText: `Seeded gallery image ${i} xx`,
        width: 1200,
        height: 800,
        sortOrder: i,
      });
    }
    expect(listDealImages(store.media, deal.id)).toHaveLength(12);

    await expect(
      uploadDealMedia(
        store,
        deal.id,
        [
          {
            filename: "thirteenth.png",
            bytes: large,
            contentType: "image/png",
          },
        ],
        { actor: ACTOR, now: NOW, storage }
      )
    ).rejects.toBeInstanceOf(MediaUploadBatchError);

    expect(listDealImages(store.media, deal.id)).toHaveLength(12);
  });

  it("set cover twice leaves exactly one cover", async () => {
    const { store, deal, storage } = harbourDeal();
    const png = buildSolidPng(1200, 800);

    const first = await uploadDealMedia(
      store,
      deal.id,
      [{ filename: "a.png", bytes: png, altText: "First cover image here" }],
      { actor: ACTOR, now: NOW, storage }
    );
    const second = await uploadDealMedia(
      store,
      deal.id,
      [{ filename: "b.png", bytes: png, altText: "Second cover image here" }],
      { actor: ACTOR, now: NOW, storage }
    );

    expect(first.media[0]!.isCover).toBe(true);
    expect(second.media[0]!.isCover).toBe(false);

    const covered = await setCoverMedia(
      store,
      deal.id,
      second.media[0]!.id,
      { actor: ACTOR, now: NOW }
    );
    expect(covered.isCover).toBe(true);

    const again = await setCoverMedia(
      store,
      deal.id,
      first.media[0]!.id,
      { actor: ACTOR, now: NOW }
    );
    expect(again.isCover).toBe(true);

    const covers = listDealImages(store.media, deal.id).filter((m) => m.isCover);
    expect(covers).toHaveLength(1);
    expect(covers[0]!.id).toBe(first.media[0]!.id);
    expect(
      store.media.media.get(second.media[0]!.id)!.isCover
    ).toBe(false);
  });

  it("adds YouTube embed, patches metadata, reorders, deletes with cover promotion", async () => {
    const { store, deal, storage } = harbourDeal();
    const png = buildSolidPng(1200, 800);

    const { media: uploaded } = await uploadDealMedia(
      store,
      deal.id,
      [
        { filename: "a.png", bytes: png, altText: "Alpha kayak photo xx" },
        { filename: "b.png", bytes: png, altText: "Bravo kayak photo xx" },
      ],
      { actor: ACTOR, now: NOW, storage }
    );

    const video = await addDealVideoEmbed(
      store,
      deal.id,
      {
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        alt_text: "Tour promo video embed",
      },
      { actor: ACTOR, now: NOW }
    );
    expect(video.mediaType).toBe("video_embed");
    expect(video.isCover).toBe(false);

    await expect(
      addDealVideoEmbed(
        store,
        deal.id,
        { url: "https://example.com/not-allowed" },
        { actor: ACTOR, now: NOW }
      )
    ).rejects.toThrow(/YouTube or Vimeo/i);

    const patched = await patchDealMedia(
      store,
      deal.id,
      uploaded[1]!.id,
      { alt_text: "Updated bravo caption text", focal_x: 0.4, focal_y: 0.6 },
      { actor: ACTOR, now: NOW }
    );
    expect(patched.altText).toBe("Updated bravo caption text");
    expect(patched.focalX).toBe(0.4);
    expect(patched.focalY).toBe(0.6);

    const reordered = await reorderDealMediaItems(
      store,
      deal.id,
      [uploaded[1]!.id, video.id, uploaded[0]!.id],
      { actor: ACTOR, now: NOW }
    );
    expect(reordered.map((m) => m.id)).toEqual([
      uploaded[1]!.id,
      video.id,
      uploaded[0]!.id,
    ]);
    expect(reordered.map((m) => m.sortOrder)).toEqual([0, 1, 2]);

    // Cover is still first uploaded image; delete it → promote next image by sort
    await setCoverMedia(store, deal.id, uploaded[0]!.id, {
      actor: ACTOR,
      now: NOW,
    });
    const { newCover } = await removeDealMedia(
      store,
      deal.id,
      uploaded[0]!.id,
      { actor: ACTOR, now: NOW, storage }
    );
    // Remaining images ordered by sort_order: uploaded[1] (0), then none else image
    // After reorder: uploaded[1]=0, video=1, uploaded[0]=2. Delete uploaded[0].
    // Images left: uploaded[1] only → becomes cover.
    expect(newCover?.id).toBe(uploaded[1]!.id);
    expect((await getDealDetail(store, deal.id)).media).toHaveLength(2);
  });

  it("applies media edits on a live deal without confirm", async () => {
    const { store, deal, storage } = harbourDeal();
    // Make deal live via status transition (content incomplete is ok for this unit test)
    transitionDeal(
      { deals: store.deals, audit: store.audit },
      deal.id,
      "live",
      { actor: ACTOR, now: NOW }
    );
    expect(store.deals.get(deal.id)!.status).toBe("live");

    const png = buildSolidPng(1200, 800);
    const { media } = await uploadDealMedia(
      store,
      deal.id,
      [{ filename: "live.png", bytes: png, altText: "Live deal cover image" }],
      { actor: ACTOR, now: NOW, storage }
    );
    expect(media[0]!.isCover).toBe(true);

    const patched = await patchDealMedia(
      store,
      deal.id,
      media[0]!.id,
      { caption: "Applies immediately" },
      { actor: ACTOR, now: NOW }
    );
    expect(patched.caption).toBe("Applies immediately");
  });

  it("importProviderImages is a Chunk 32 stub", async () => {
    const { store, deal } = harbourDeal();
    await expect(
      importProviderImages(store, deal.id, { actor: ACTOR, now: NOW })
    ).rejects.toBeInstanceOf(ImportProviderImagesStubError);
  });

  it("rejects oversize files with a per-file error", async () => {
    const { store, deal, storage } = harbourDeal();
    // Valid dimensions header but claim huge size via oversized buffer:
    // build a min-size PNG then pad — probe still reads IHDR; size check fires first.
    const png = buildSolidPng(1200, 800);
    const huge = new Uint8Array(DEAL_MEDIA_LIMITS.maxFileSizeBytes + 1);
    huge.set(png.subarray(0, Math.min(png.length, huge.length)));

    await expect(
      uploadDealMedia(
        store,
        deal.id,
        [{ filename: "huge.png", bytes: huge, contentType: "image/png" }],
        { actor: ACTOR, now: NOW, storage }
      )
    ).rejects.toBeInstanceOf(MediaUploadBatchError);
  });
});
