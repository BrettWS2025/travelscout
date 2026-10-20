import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  DEAL_MEDIA_LIMITS,
  DealMediaLimitError,
  DealMediaValidationError,
  VIDEO_EMBED_URL_REGEX,
  addDealMedia,
  createDealMediaStore,
  deleteDealMedia,
  isAllowedVideoEmbedUrl,
  listDealImages,
  listDealMedia,
  setDealMediaCover,
  validateDealMediaFields,
} from "@/lib/marketplace/deal-media";

const MIGRATION_PATH = path.resolve(
  __dirname,
  "../../../../supabase/migrations/20261020000002_create_deal_media.sql"
);

const DEAL_ID = "11111111-1111-1111-1111-111111111111";

function imageInput(
  overrides: Partial<Parameters<typeof addDealMedia>[1]> = {}
) {
  return {
    dealId: DEAL_ID,
    mediaType: "image" as const,
    source: "upload" as const,
    url: "https://cdn.example.com/photo.jpg",
    altText: "Harbour kayak tour at sunrise",
    ...overrides,
  };
}

describe("Chunk 5 migration", () => {
  it("defines marketplace.deal_media with cover unique index and 12-image trigger", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf8");

    expect(sql).toContain("CREATE TABLE marketplace.deal_media");
    expect(sql).toContain(
      "REFERENCES marketplace.operator_deals(id) ON DELETE CASCADE"
    );
    expect(sql).toContain("'image', 'video_embed'");
    expect(sql).toContain("'upload', 'provider'");
    expect(sql).toContain("idx_marketplace_deal_media_one_cover");
    expect(sql).toContain("enforce_deal_media_image_limit");
    expect(sql).toContain("deal may have at most 12 images");
    expect(sql).toContain("deal_media_video_embed_url");
    expect(sql).toContain("youtube\\.com|youtu\\.be|vimeo\\.com");
    expect(sql).toContain("marketplace.operator_id_for_deal");
    expect(sql).toContain("Child table of marketplace.operator_deals");
  });
});

describe("validateDealMediaFields", () => {
  it("enforces alt_text 5–150 and caption ≤150", () => {
    expect(
      validateDealMediaFields({ altText: "abcd" })
    ).toEqual([expect.objectContaining({ field: "alt_text" })]);
    expect(
      validateDealMediaFields({ altText: "a".repeat(151) })
    ).toEqual([expect.objectContaining({ field: "alt_text" })]);
    expect(validateDealMediaFields({ altText: "abcde" })).toEqual([]);
    expect(
      validateDealMediaFields({ caption: "c".repeat(151) })
    ).toEqual([expect.objectContaining({ field: "caption" })]);
  });

  it("enforces focal_x / focal_y in 0–1", () => {
    expect(
      validateDealMediaFields({ focalX: -0.1 }).map((e) => e.field)
    ).toContain("focal_x");
    expect(
      validateDealMediaFields({ focalY: 1.1 }).map((e) => e.field)
    ).toContain("focal_y");
    expect(validateDealMediaFields({ focalX: 0, focalY: 1 })).toEqual([]);
  });

  it("rejects non-YouTube/Vimeo video_embed URLs", () => {
    expect(
      validateDealMediaFields({
        mediaType: "video_embed",
        url: "https://example.com/watch",
      })
    ).toEqual([expect.objectContaining({ field: "url" })]);

    expect(
      validateDealMediaFields({
        mediaType: "video_embed",
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      })
    ).toEqual([]);
    expect(
      validateDealMediaFields({
        mediaType: "video_embed",
        url: "https://youtu.be/dQw4w9WgXcQ",
      })
    ).toEqual([]);
    expect(
      validateDealMediaFields({
        mediaType: "video_embed",
        url: "https://vimeo.com/123456789",
      })
    ).toEqual([]);
    expect(
      validateDealMediaFields({
        mediaType: "video_embed",
        url: "https://player.vimeo.com/video/123456789",
      })
    ).toEqual([]);
  });

  it("VIDEO_EMBED_URL_REGEX matches DB-allowed hosts only", () => {
    expect(isAllowedVideoEmbedUrl("https://youtube.com/embed/x")).toBe(true);
    expect(isAllowedVideoEmbedUrl("http://www.youtu.be/x")).toBe(true);
    expect(VIDEO_EMBED_URL_REGEX.test("https://evil-youtube.com/x")).toBe(
      false
    );
  });
});

describe("cover swap", () => {
  it("setting a new cover unsets the old one in the same operation", () => {
    const store = createDealMediaStore();
    const first = addDealMedia(store, imageInput({ sortOrder: 0 }));
    const second = addDealMedia(
      store,
      imageInput({
        sortOrder: 1,
        url: "https://cdn.example.com/b.jpg",
        altText: "Second kayak photo here",
      })
    );

    expect(first.isCover).toBe(true);
    expect(store.media.get(first.id)!.isCover).toBe(true);
    expect(second.isCover).toBe(false);

    const updated = setDealMediaCover(store, second.id);
    expect(updated.isCover).toBe(true);
    expect(store.media.get(second.id)!.isCover).toBe(true);
    expect(store.media.get(first.id)!.isCover).toBe(false);

    const covers = listDealImages(store, DEAL_ID).filter((m) => m.isCover);
    expect(covers).toHaveLength(1);
    expect(covers[0].id).toBe(second.id);
  });

  it("addDealMedia with isCover=true swaps cover atomically", () => {
    const store = createDealMediaStore();
    const first = addDealMedia(store, imageInput({ sortOrder: 0 }));
    const third = addDealMedia(
      store,
      imageInput({
        sortOrder: 2,
        isCover: true,
        url: "https://cdn.example.com/cover.jpg",
        altText: "New cover image for deal",
      })
    );

    expect(third.isCover).toBe(true);
    expect(store.media.get(first.id)!.isCover).toBe(false);
    expect(
      listDealImages(store, DEAL_ID).filter((m) => m.isCover)
    ).toHaveLength(1);
  });
});

describe("cover promotion on delete", () => {
  it("deleting the cover promotes the first remaining image by sort_order", () => {
    const store = createDealMediaStore();
    const a = addDealMedia(
      store,
      imageInput({ sortOrder: 10, altText: "Alpha photo of kayaks" })
    );
    const b = addDealMedia(
      store,
      imageInput({
        sortOrder: 5,
        url: "https://cdn.example.com/b.jpg",
        altText: "Bravo photo of kayaks",
      })
    );
    const c = addDealMedia(
      store,
      imageInput({
        sortOrder: 7,
        url: "https://cdn.example.com/c.jpg",
        altText: "Charlie photo of kayaks",
      })
    );

    // First added became cover; swap to a so we delete a known cover
    setDealMediaCover(store, a.id);
    expect(store.media.get(a.id)!.isCover).toBe(true);

    const { newCover } = deleteDealMedia(store, a.id);
    expect(store.media.has(a.id)).toBe(false);
    // Lowest sort_order among remaining is b (5), then c (7)
    expect(newCover?.id).toBe(b.id);
    expect(store.media.get(b.id)!.isCover).toBe(true);
    expect(store.media.get(c.id)!.isCover).toBe(false);
  });

  it("deleting a non-cover leaves the cover unchanged", () => {
    const store = createDealMediaStore();
    const cover = addDealMedia(store, imageInput({ sortOrder: 0 }));
    const other = addDealMedia(
      store,
      imageInput({
        sortOrder: 1,
        url: "https://cdn.example.com/other.jpg",
        altText: "Other gallery image here",
      })
    );

    const { newCover } = deleteDealMedia(store, other.id);
    expect(newCover).toBeNull();
    expect(store.media.get(cover.id)!.isCover).toBe(true);
  });

  it("deleting the last image leaves no cover", () => {
    const store = createDealMediaStore();
    const only = addDealMedia(store, imageInput());
    const { newCover } = deleteDealMedia(store, only.id);
    expect(newCover).toBeNull();
    expect(listDealImages(store, DEAL_ID)).toHaveLength(0);
  });
});

describe("12-image limit", () => {
  it("allows 12 images and rejects the 13th", () => {
    const store = createDealMediaStore();
    for (let i = 0; i < DEAL_MEDIA_LIMITS.maxImagesPerDeal; i++) {
      addDealMedia(
        store,
        imageInput({
          sortOrder: i,
          url: `https://cdn.example.com/img-${i}.jpg`,
          altText: `Gallery image number ${i} xx`,
        })
      );
    }
    expect(listDealImages(store, DEAL_ID)).toHaveLength(12);

    expect(() =>
      addDealMedia(
        store,
        imageInput({
          sortOrder: 12,
          url: "https://cdn.example.com/img-12.jpg",
          altText: "Thirteenth image should fail",
        })
      )
    ).toThrow(DealMediaLimitError);

    expect(listDealImages(store, DEAL_ID)).toHaveLength(12);
  });

  it("video_embed does not count toward the 12-image limit", () => {
    const store = createDealMediaStore();
    for (let i = 0; i < 12; i++) {
      addDealMedia(
        store,
        imageInput({
          sortOrder: i,
          url: `https://cdn.example.com/img-${i}.jpg`,
          altText: `Gallery image number ${i} xx`,
        })
      );
    }

    const video = addDealMedia(store, {
      dealId: DEAL_ID,
      mediaType: "video_embed",
      source: "upload",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      altText: "Tour promo video embed",
      sortOrder: 100,
    });

    expect(video.mediaType).toBe("video_embed");
    expect(video.isCover).toBe(false);
    expect(listDealImages(store, DEAL_ID)).toHaveLength(12);
    expect(listDealMedia(store, DEAL_ID)).toHaveLength(13);
  });

  it("rejects video_embed as cover", () => {
    const store = createDealMediaStore();
    expect(() =>
      addDealMedia(store, {
        dealId: DEAL_ID,
        mediaType: "video_embed",
        source: "provider",
        url: "https://vimeo.com/123",
        altText: "Provider video cannot cover",
        isCover: true,
      })
    ).toThrow(DealMediaValidationError);
  });
});
