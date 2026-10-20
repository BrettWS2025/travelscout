/**
 * Deal media upload / embed / update API (deals platform Chunk 14).
 *
 * Works against DealDraftStore + MediaStorage. Live-deal media edits apply
 * immediately (no confirm), per spec §5.2.
 *
 * Routes: /api/marketplace/operator-deals/:id/media[...]
 */

import { DealDraftError, type DealDraftStore } from "./deal-draft";
import {
  DEAL_MEDIA_LIMITS,
  DealMediaLimitError,
  DealMediaValidationError,
  addDealMedia,
  deleteDealMedia,
  listDealMedia,
  reorderDealMedia,
  setDealMediaCover,
  updateDealMedia,
  type DealMedia,
  type AllowedImageMimeType,
} from "./deal-media";
import {
  assertUploadDimensions,
  ImageProbeError,
  readImageDimensions,
} from "./image-dimensions";
import {
  buildDealMediaStorageKey,
  extensionForMime,
  getMediaStorage,
  type MediaStorage,
} from "./media-storage";
import {
  DealNotFoundError,
  logDealEvent,
  type DealActor,
} from "./deal-status";
import type { Deal } from "./deal";
import { can, type PermissionUser } from "./permissions";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type FileUploadError = {
  file: string;
  message: string;
  field?: string;
};

export class MediaUploadBatchError extends DealDraftError {
  readonly fileErrors: FileUploadError[];

  constructor(fileErrors: FileUploadError[]) {
    super("One or more files failed validation", 400, [
      ...fileErrors.map((e) => ({
        field: e.field ?? e.file,
        message: e.message,
      })),
    ]);
    this.name = "MediaUploadBatchError";
    this.fileErrors = fileErrors;
  }
}

export class ImportProviderImagesStubError extends DealDraftError {
  constructor() {
    super(
      "importProviderImages is not implemented yet (Chunk 32)",
      501
    );
    this.name = "ImportProviderImagesStubError";
  }
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export type MediaMutationOptions = {
  actor: DealActor;
  now?: string;
  storage?: MediaStorage;
};

export type UploadFileInput = {
  /** Original filename (for per-file errors). */
  filename: string;
  bytes: Uint8Array;
  /** Declared Content-Type; sniffed MIME must still match allowed set. */
  contentType?: string | null;
  altText?: string | null;
  caption?: string | null;
  isCover?: boolean;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireDeal(store: DealDraftStore, dealId: string): Deal {
  const deal = store.deals.get(dealId);
  if (!deal) throw new DealNotFoundError(dealId);
  return deal;
}

export function requireMediaWrite(
  user: PermissionUser,
  operatorId: string
): void {
  if (!can(user, operatorId, "inventory.write")) {
    throw new DealDraftError(
      "You do not have permission to edit inventory for this operator.",
      403
    );
  }
}

function wrapMediaError(err: unknown): never {
  if (err instanceof DealMediaLimitError) {
    throw new DealDraftError(err.message, 400, [
      { field: "images", message: err.message },
    ]);
  }
  if (err instanceof DealMediaValidationError) {
    throw new DealDraftError(err.message, 400, err.errors);
  }
  if (err instanceof ImageProbeError) {
    throw new DealDraftError(err.message, 400, [
      { field: "file", message: err.message },
    ]);
  }
  throw err;
}

function validateUploadBytes(
  file: UploadFileInput
): {
  mime: AllowedImageMimeType;
  width: number;
  height: number;
  sizeBytes: number;
} {
  const L = DEAL_MEDIA_LIMITS;
  const sizeBytes = file.bytes.byteLength;
  if (sizeBytes <= 0) {
    throw new ImageProbeError("file is empty");
  }
  if (sizeBytes > L.maxFileSizeBytes) {
    throw new ImageProbeError(
      `file must be ≤ ${L.maxFileSizeBytes} bytes (10 MB)`
    );
  }

  let dims;
  try {
    dims = readImageDimensions(file.bytes);
  } catch (err) {
    if (err instanceof ImageProbeError) throw err;
    throw new ImageProbeError("could not read image dimensions");
  }

  if (
    !(L.allowedMimeTypes as readonly string[]).includes(dims.mimeType)
  ) {
    throw new ImageProbeError(
      "only jpg, png and webp images are accepted"
    );
  }

  // If client declared a type, it must agree with sniffed type (jpeg aliases ok).
  if (file.contentType) {
    const declared = file.contentType.toLowerCase().split(";")[0]!.trim();
    const aliases: Record<string, string> = {
      "image/jpg": "image/jpeg",
      "image/pjpeg": "image/jpeg",
    };
    const normalised = aliases[declared] ?? declared;
    if (normalised && normalised !== dims.mimeType) {
      throw new ImageProbeError(
        `content type ${declared} does not match file contents (${dims.mimeType})`
      );
    }
  }

  assertUploadDimensions(dims);
  return {
    mime: dims.mimeType,
    width: dims.width,
    height: dims.height,
    sizeBytes,
  };
}

function logMediaUpdated(
  store: DealDraftStore,
  dealId: string,
  actor: DealActor,
  detail: Record<string, unknown>,
  now: string
): void {
  logDealEvent(store.audit, dealId, "updated", actor, {
    fields: ["media"],
    ...detail,
  }, { now });
}

// ---------------------------------------------------------------------------
// Upload (multi-file)
// ---------------------------------------------------------------------------

export type UploadDealMediaResult = {
  media: DealMedia[];
  errors: FileUploadError[];
};

/**
 * Validate and store multiple image uploads. Per-file errors are collected;
 * valid files are still saved. If every file fails, throws MediaUploadBatchError.
 * Live deals: applies immediately (no confirm).
 */
export async function uploadDealMedia(
  store: DealDraftStore,
  dealId: string,
  files: UploadFileInput[],
  options: MediaMutationOptions
): Promise<UploadDealMediaResult> {
  const deal = requireDeal(store, dealId);
  if (!files.length) {
    throw new DealDraftError("At least one file is required", 400, [
      { field: "files", message: "required" },
    ]);
  }

  const storage = options.storage ?? getMediaStorage();
  const now = options.now ?? new Date().toISOString();
  const created: DealMedia[] = [];
  const errors: FileUploadError[] = [];

  for (const file of files) {
    try {
      const probed = validateUploadBytes(file);
      const id = crypto.randomUUID();
      const ext = extensionForMime(probed.mime);
      const key = buildDealMediaStorageKey(
        deal.operatorId,
        dealId,
        id,
        ext
      );
      const stored = await storage.put(key, file.bytes, probed.mime);

      const altText =
        (file.altText && file.altText.trim()) ||
        DEAL_MEDIA_LIMITS.defaultUploadAltText;

      const row = addDealMedia(
        store.media,
        {
          dealId,
          mediaType: "image",
          source: "upload",
          url: stored.url,
          storageKey: stored.key,
          altText,
          caption: file.caption ?? null,
          width: probed.width,
          height: probed.height,
          fileSizeBytes: probed.sizeBytes,
          isCover: file.isCover === true,
        },
        { id, now }
      );
      created.push(row);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "upload failed";
      // Limit / validation from addDealMedia
      if (
        err instanceof DealMediaLimitError ||
        err instanceof DealMediaValidationError ||
        err instanceof ImageProbeError
      ) {
        errors.push({ file: file.filename, message });
      } else if (err instanceof DealDraftError) {
        errors.push({ file: file.filename, message: err.message });
      } else {
        errors.push({ file: file.filename, message });
      }
    }
  }

  if (created.length === 0) {
    throw new MediaUploadBatchError(errors);
  }

  logMediaUpdated(
    store,
    dealId,
    options.actor,
    {
      action: "upload",
      added: created.map((m) => m.id),
      file_errors: errors,
    },
    now
  );

  return { media: created, errors };
}

// ---------------------------------------------------------------------------
// Video embed
// ---------------------------------------------------------------------------

export async function addDealVideoEmbed(
  store: DealDraftStore,
  dealId: string,
  body: Record<string, unknown>,
  options: MediaMutationOptions
): Promise<DealMedia> {
  requireDeal(store, dealId);
  const now = options.now ?? new Date().toISOString();

  const urlRaw = (body.url ?? body.embed_url ?? body.embedUrl) as unknown;
  if (typeof urlRaw !== "string" || !urlRaw.trim()) {
    throw new DealDraftError("url is required", 400, [
      { field: "url", message: "required" },
    ]);
  }

  const altRaw = (body.alt_text ?? body.altText) as unknown;
  const altText =
    typeof altRaw === "string" && altRaw.trim()
      ? altRaw.trim()
      : "Deal video embed";

  const captionRaw = (body.caption ?? null) as unknown;
  const caption =
    captionRaw === null || captionRaw === undefined
      ? null
      : typeof captionRaw === "string"
        ? captionRaw
        : null;

  try {
    const row = addDealMedia(
      store.media,
      {
        dealId,
        mediaType: "video_embed",
        source: "upload",
        url: urlRaw.trim(),
        altText,
        caption,
        isCover: false,
      },
      { now }
    );
    logMediaUpdated(
      store,
      dealId,
      options.actor,
      { action: "video_embed", media_id: row.id },
      now
    );
    return row;
  } catch (err) {
    wrapMediaError(err);
  }
}

// ---------------------------------------------------------------------------
// Update / cover / reorder / delete
// ---------------------------------------------------------------------------

export async function patchDealMedia(
  store: DealDraftStore,
  dealId: string,
  mediaId: string,
  body: Record<string, unknown>,
  options: MediaMutationOptions
): Promise<DealMedia> {
  requireDeal(store, dealId);
  const existing = store.media.media.get(mediaId);
  if (!existing || existing.dealId !== dealId) {
    throw new DealDraftError("Media not found", 404);
  }

  const now = options.now ?? new Date().toISOString();
  const patch: {
    altText?: string | null;
    caption?: string | null;
    focalX?: number | null;
    focalY?: number | null;
    sortOrder?: number | null;
  } = {};

  if ("alt_text" in body || "altText" in body) {
    patch.altText = (body.alt_text ?? body.altText) as string | null;
  }
  if ("caption" in body) {
    patch.caption = body.caption as string | null;
  }
  if ("focal_x" in body || "focalX" in body) {
    const v = body.focal_x ?? body.focalX;
    patch.focalX = v === null || v === undefined ? null : Number(v);
  }
  if ("focal_y" in body || "focalY" in body) {
    const v = body.focal_y ?? body.focalY;
    patch.focalY = v === null || v === undefined ? null : Number(v);
  }
  if ("sort_order" in body || "sortOrder" in body) {
    const v = body.sort_order ?? body.sortOrder;
    patch.sortOrder = v === null || v === undefined ? null : Number(v);
  }

  // set_cover / is_cover on PATCH also supported
  const setCover =
    body.set_cover === true ||
    body.setCover === true ||
    body.is_cover === true ||
    body.isCover === true;

  try {
    let updated = updateDealMedia(store.media, mediaId, patch, { now });
    if (setCover) {
      updated = setDealMediaCover(store.media, mediaId, { now });
    }
    logMediaUpdated(
      store,
      dealId,
      options.actor,
      { action: "patch", media_id: mediaId, set_cover: setCover },
      now
    );
    return updated;
  } catch (err) {
    wrapMediaError(err);
  }
}

export async function setCoverMedia(
  store: DealDraftStore,
  dealId: string,
  mediaId: string,
  options: MediaMutationOptions
): Promise<DealMedia> {
  requireDeal(store, dealId);
  const existing = store.media.media.get(mediaId);
  if (!existing || existing.dealId !== dealId) {
    throw new DealDraftError("Media not found", 404);
  }
  const now = options.now ?? new Date().toISOString();
  try {
    const updated = setDealMediaCover(store.media, mediaId, { now });
    logMediaUpdated(
      store,
      dealId,
      options.actor,
      { action: "set_cover", media_id: mediaId },
      now
    );
    return updated;
  } catch (err) {
    wrapMediaError(err);
  }
}

export async function reorderDealMediaItems(
  store: DealDraftStore,
  dealId: string,
  orderedIds: string[],
  options: MediaMutationOptions
): Promise<DealMedia[]> {
  requireDeal(store, dealId);
  const now = options.now ?? new Date().toISOString();
  try {
    const media = reorderDealMedia(store.media, dealId, orderedIds, { now });
    logMediaUpdated(
      store,
      dealId,
      options.actor,
      { action: "reorder", ordered_ids: orderedIds },
      now
    );
    return media;
  } catch (err) {
    wrapMediaError(err);
  }
}

export async function removeDealMedia(
  store: DealDraftStore,
  dealId: string,
  mediaId: string,
  options: MediaMutationOptions
): Promise<{ deleted: DealMedia; newCover: DealMedia | null }> {
  requireDeal(store, dealId);
  const existing = store.media.media.get(mediaId);
  if (!existing || existing.dealId !== dealId) {
    throw new DealDraftError("Media not found", 404);
  }

  const storage = options.storage ?? getMediaStorage();
  const now = options.now ?? new Date().toISOString();

  try {
    const result = deleteDealMedia(store.media, mediaId, { now });
    if (result.deleted.storageKey) {
      try {
        await storage.delete(result.deleted.storageKey);
      } catch {
        // Soft-fail storage cleanup; row already removed.
      }
    }
    logMediaUpdated(
      store,
      dealId,
      options.actor,
      {
        action: "delete",
        media_id: mediaId,
        new_cover_id: result.newCover?.id ?? null,
      },
      now
    );
    return result;
  } catch (err) {
    wrapMediaError(err);
  }
}

export function listDealMediaForDeal(
  store: DealDraftStore,
  dealId: string
): DealMedia[] {
  requireDeal(store, dealId);
  return listDealMedia(store.media, dealId);
}

/**
 * Stub for Chunk 32 — import images from the linked ExternalProduct.
 * Exists so the editor can call it; always returns 501 until implemented.
 */
export async function importProviderImages(
  _store: DealDraftStore,
  _dealId: string,
  _options: MediaMutationOptions
): Promise<{ imported: number; media: DealMedia[] }> {
  throw new ImportProviderImagesStubError();
}
