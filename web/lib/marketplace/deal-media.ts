/**
 * DealMedia (deals platform Chunk 5).
 * Table: marketplace.deal_media
 * Parent: marketplace.operator_deals (inventory Deal — not legacy marketplace.deals).
 *
 * Rules (service + DB):
 * - Max 12 images per deal (video_embed does not count).
 * - Exactly one is_cover once any image exists.
 * - Setting a new cover unsets the previous cover in the same transaction.
 * - Deleting the cover promotes the first remaining image by sort_order.
 * - video_embed URLs must be YouTube or Vimeo.
 */

import type { MediaSource, MediaType } from "./enums";
import { isMediaSource, isMediaType } from "./enums";

// ---------------------------------------------------------------------------
// Domain type
// ---------------------------------------------------------------------------

export type DealMedia = {
  id: string;
  dealId: string;
  mediaType: MediaType;
  source: MediaSource;
  storageKey: string | null;
  url: string;
  isCover: boolean;
  sortOrder: number;
  altText: string;
  caption: string | null;
  width: number | null;
  height: number | null;
  focalX: number | null;
  focalY: number | null;
  fileSizeBytes: number | null;
  createdAt: string;
  updatedAt: string;
};

export type DealMediaFieldInput = {
  mediaType?: MediaType | null;
  source?: MediaSource | null;
  storageKey?: string | null;
  url?: string | null;
  isCover?: boolean | null;
  sortOrder?: number | null;
  altText?: string | null;
  caption?: string | null;
  width?: number | null;
  height?: number | null;
  focalX?: number | null;
  focalY?: number | null;
  fileSizeBytes?: number | null;
};

export type CreateDealMediaInput = {
  dealId: string;
  mediaType: MediaType;
  source: MediaSource;
  url: string;
  altText: string;
  storageKey?: string | null;
  isCover?: boolean;
  sortOrder?: number;
  caption?: string | null;
  width?: number | null;
  height?: number | null;
  focalX?: number | null;
  focalY?: number | null;
  fileSizeBytes?: number | null;
};

export type FieldError = { field: string; message: string };

export class DealMediaValidationError extends Error {
  readonly errors: FieldError[];

  constructor(errors: FieldError[]) {
    super(errors.map((e) => `${e.field}: ${e.message}`).join("; "));
    this.name = "DealMediaValidationError";
    this.errors = errors;
  }
}

export class DealMediaLimitError extends Error {
  constructor(message = "deal may have at most 12 images") {
    super(message);
    this.name = "DealMediaLimitError";
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEAL_MEDIA_LIMITS = {
  maxImagesPerDeal: 12,
  altTextMin: 5,
  altTextMax: 150,
  captionMax: 150,
  focalMin: 0,
  focalMax: 1,
} as const;

/**
 * YouTube or Vimeo only (http/https). Matches DB CHECK on deal_media.
 * Accepts youtube.com, youtu.be, vimeo.com, player.vimeo.com (with optional www/m subdomains).
 */
export const VIDEO_EMBED_URL_REGEX =
  /^https?:\/\/([a-z0-9-]+\.)*(youtube\.com|youtu\.be|vimeo\.com|player\.vimeo\.com)(\/|$|\?)/i;

export function isAllowedVideoEmbedUrl(url: string): boolean {
  return VIDEO_EMBED_URL_REGEX.test(url.trim());
}

// ---------------------------------------------------------------------------
// Field-level validator
// ---------------------------------------------------------------------------

export function validateDealMediaFields(
  input: DealMediaFieldInput
): FieldError[] {
  const errors: FieldError[] = [];
  const L = DEAL_MEDIA_LIMITS;

  if (input.mediaType !== undefined && input.mediaType !== null) {
    if (!isMediaType(input.mediaType)) {
      errors.push({ field: "media_type", message: "invalid value" });
    }
  }
  if (input.source !== undefined && input.source !== null) {
    if (!isMediaSource(input.source)) {
      errors.push({ field: "source", message: "invalid value" });
    }
  }

  if (input.url != null) {
    const url = input.url.trim();
    if (url === "") {
      errors.push({ field: "url", message: "url is required" });
    } else if (
      input.mediaType === "video_embed" &&
      !isAllowedVideoEmbedUrl(url)
    ) {
      errors.push({
        field: "url",
        message: "video_embed url must be a YouTube or Vimeo URL",
      });
    }
  }

  if (input.altText != null) {
    if (
      input.altText.length < L.altTextMin ||
      input.altText.length > L.altTextMax
    ) {
      errors.push({
        field: "alt_text",
        message: `must be ${L.altTextMin}–${L.altTextMax} characters`,
      });
    }
  }

  if (input.caption != null && input.caption.length > L.captionMax) {
    errors.push({
      field: "caption",
      message: `must be ≤ ${L.captionMax} characters`,
    });
  }

  if (input.sortOrder != null && !Number.isInteger(input.sortOrder)) {
    errors.push({ field: "sort_order", message: "sort_order must be an integer" });
  }

  for (const [field, value] of [
    ["width", input.width],
    ["height", input.height],
  ] as const) {
    if (value != null) {
      if (!Number.isInteger(value) || value <= 0) {
        errors.push({
          field,
          message: `${field} must be a positive integer`,
        });
      }
    }
  }

  for (const [field, value] of [
    ["focal_x", input.focalX],
    ["focal_y", input.focalY],
  ] as const) {
    if (value != null) {
      if (
        typeof value !== "number" ||
        Number.isNaN(value) ||
        value < L.focalMin ||
        value > L.focalMax
      ) {
        errors.push({
          field,
          message: `${field} must be between ${L.focalMin} and ${L.focalMax}`,
        });
      }
    }
  }

  if (input.fileSizeBytes != null) {
    if (!Number.isInteger(input.fileSizeBytes) || input.fileSizeBytes < 0) {
      errors.push({
        field: "file_size_bytes",
        message: "file_size_bytes must be an integer ≥ 0",
      });
    }
  }

  if (input.isCover === true && input.mediaType === "video_embed") {
    errors.push({
      field: "is_cover",
      message: "only images can be the cover",
    });
  }

  return errors;
}

export function assertValidDealMediaFields(
  input: DealMediaFieldInput
): DealMediaFieldInput {
  const errors = validateDealMediaFields(input);
  if (errors.length) throw new DealMediaValidationError(errors);
  return input;
}

// ---------------------------------------------------------------------------
// In-memory store (unit tests; DB path comes with Chunk 14 upload API)
// ---------------------------------------------------------------------------

export type DealMediaStore = {
  media: Map<string, DealMedia>;
};

export function createDealMediaStore(): DealMediaStore {
  return { media: new Map() };
}

function listByDeal(store: DealMediaStore, dealId: string): DealMedia[] {
  return [...store.media.values()].filter((m) => m.dealId === dealId);
}

function listImagesByDeal(store: DealMediaStore, dealId: string): DealMedia[] {
  return listByDeal(store, dealId)
    .filter((m) => m.mediaType === "image")
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
}

function countImages(store: DealMediaStore, dealId: string): number {
  return listImagesByDeal(store, dealId).length;
}

function getCover(
  store: DealMediaStore,
  dealId: string
): DealMedia | undefined {
  return listImagesByDeal(store, dealId).find((m) => m.isCover);
}

/**
 * After any image mutation: ensure exactly one cover when ≥1 image exists.
 * Prefer existing cover; otherwise promote first by sort_order.
 */
function ensureCoverInvariant(
  store: DealMediaStore,
  dealId: string,
  now: string
): void {
  const images = listImagesByDeal(store, dealId);
  if (images.length === 0) return;

  const covers = images.filter((m) => m.isCover);
  if (covers.length === 1) return;

  // Clear extras / missing → promote first by sort_order
  for (const img of images) {
    if (img.isCover) {
      store.media.set(img.id, { ...img, isCover: false, updatedAt: now });
    }
  }
  const first = images[0];
  store.media.set(first.id, {
    ...store.media.get(first.id)!,
    isCover: true,
    updatedAt: now,
  });
}

/**
 * Create media. First image becomes cover if none set / isCover requested.
 * Setting isCover=true unsets any previous cover in the same operation.
 * Rejects a 13th image.
 */
export function addDealMedia(
  store: DealMediaStore,
  input: CreateDealMediaInput,
  options?: { id?: string; now?: string }
): DealMedia {
  assertValidDealMediaFields({
    mediaType: input.mediaType,
    source: input.source,
    url: input.url,
    altText: input.altText,
    caption: input.caption,
    storageKey: input.storageKey,
    isCover: input.isCover,
    sortOrder: input.sortOrder,
    width: input.width,
    height: input.height,
    focalX: input.focalX,
    focalY: input.focalY,
    fileSizeBytes: input.fileSizeBytes,
  });

  if (input.mediaType === "image") {
    if (countImages(store, input.dealId) >= DEAL_MEDIA_LIMITS.maxImagesPerDeal) {
      throw new DealMediaLimitError();
    }
  }

  if (input.mediaType === "video_embed" && input.isCover) {
    throw new DealMediaValidationError([
      { field: "is_cover", message: "only images can be the cover" },
    ]);
  }

  const now = options?.now ?? new Date().toISOString();
  const id = options?.id ?? crypto.randomUUID();
  const images = listImagesByDeal(store, input.dealId);
  const wantCover =
    input.mediaType === "image" &&
    (input.isCover === true || images.length === 0);

  // Same-transaction cover swap: unset previous cover first
  if (wantCover && input.isCover === true) {
    const existing = getCover(store, input.dealId);
    if (existing) {
      store.media.set(existing.id, {
        ...existing,
        isCover: false,
        updatedAt: now,
      });
    }
  }

  const row: DealMedia = {
    id,
    dealId: input.dealId,
    mediaType: input.mediaType,
    source: input.source,
    storageKey: input.storageKey ?? null,
    url: input.url.trim(),
    isCover: wantCover,
    sortOrder: input.sortOrder ?? images.length,
    altText: input.altText,
    caption: input.caption ?? null,
    width: input.width ?? null,
    height: input.height ?? null,
    focalX: input.focalX ?? null,
    focalY: input.focalY ?? null,
    fileSizeBytes: input.fileSizeBytes ?? null,
    createdAt: now,
    updatedAt: now,
  };

  store.media.set(id, row);
  ensureCoverInvariant(store, input.dealId, now);
  return store.media.get(id)!;
}

/**
 * Set cover on an existing image. Unsets the previous cover in the same
 * transaction (in-memory: both writes before return).
 */
export function setDealMediaCover(
  store: DealMediaStore,
  mediaId: string,
  options?: { now?: string }
): DealMedia {
  const target = store.media.get(mediaId);
  if (!target) {
    throw new DealMediaValidationError([
      { field: "id", message: "media not found" },
    ]);
  }
  if (target.mediaType !== "image") {
    throw new DealMediaValidationError([
      { field: "is_cover", message: "only images can be the cover" },
    ]);
  }

  const now = options?.now ?? new Date().toISOString();
  const previous = getCover(store, target.dealId);

  if (previous && previous.id !== target.id) {
    store.media.set(previous.id, {
      ...previous,
      isCover: false,
      updatedAt: now,
    });
  }

  const updated: DealMedia = {
    ...target,
    isCover: true,
    updatedAt: now,
  };
  store.media.set(target.id, updated);
  return updated;
}

/**
 * Delete media. If the deleted row was the cover, promote the first remaining
 * image by sort_order (lowest sort_order, then createdAt).
 */
export function deleteDealMedia(
  store: DealMediaStore,
  mediaId: string,
  options?: { now?: string }
): { deleted: DealMedia; newCover: DealMedia | null } {
  const target = store.media.get(mediaId);
  if (!target) {
    throw new DealMediaValidationError([
      { field: "id", message: "media not found" },
    ]);
  }

  const wasCover = target.isCover;
  store.media.delete(mediaId);

  let newCover: DealMedia | null = null;
  if (wasCover && target.mediaType === "image") {
    const now = options?.now ?? new Date().toISOString();
    const next = listImagesByDeal(store, target.dealId)[0];
    if (next) {
      newCover = { ...next, isCover: true, updatedAt: now };
      store.media.set(next.id, newCover);
    }
  }

  return { deleted: target, newCover };
}

export function listDealMedia(
  store: DealMediaStore,
  dealId: string
): DealMedia[] {
  return listByDeal(store, dealId).sort(
    (a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt)
  );
}

export function listDealImages(
  store: DealMediaStore,
  dealId: string
): DealMedia[] {
  return listImagesByDeal(store, dealId);
}
