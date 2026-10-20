/**
 * Deal media file storage (Chunk 14).
 *
 * Default: in-memory store (same pattern as DealDraftStore until Supabase
 * persistence is wired). When SUPABASE env + service role are present, routes
 * may swap in createSupabaseMediaStorage.
 */

export type StoredMediaObject = {
  key: string;
  url: string;
  contentType: string;
  sizeBytes: number;
};

export type MediaStorage = {
  put(
    key: string,
    bytes: Uint8Array,
    contentType: string
  ): Promise<StoredMediaObject>;
  delete(key: string): Promise<void>;
  getPublicUrl(key: string): string;
};

export type MemoryMediaStorage = MediaStorage & {
  files: Map<string, { bytes: Uint8Array; contentType: string; url: string }>;
};

/** In-memory object store for unit tests and local API without Supabase. */
export function createMemoryMediaStorage(
  baseUrl = "https://media.local/deal-media"
): MemoryMediaStorage {
  const files = new Map<
    string,
    { bytes: Uint8Array; contentType: string; url: string }
  >();

  return {
    files,
    getPublicUrl(key: string): string {
      return `${baseUrl.replace(/\/$/, "")}/${key.replace(/^\//, "")}`;
    },
    async put(key, bytes, contentType) {
      const url = this.getPublicUrl(key);
      files.set(key, {
        bytes: new Uint8Array(bytes),
        contentType,
        url,
      });
      return { key, url, contentType, sizeBytes: bytes.byteLength };
    },
    async delete(key) {
      files.delete(key);
    },
  };
}

let processStorage: MediaStorage | null = null;

export function getMediaStorage(): MediaStorage {
  if (!processStorage) {
    processStorage = createMemoryMediaStorage();
  }
  return processStorage;
}

export function setMediaStorage(storage: MediaStorage | null): void {
  processStorage = storage;
}

/**
 * Supabase Storage adapter. Bucket default `deal-media`.
 * Callers must pass a client that can write to the bucket (service role).
 */
export function createSupabaseMediaStorage(options: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: { storage: { from: (bucket: string) => any } };
  bucket?: string;
  publicBaseUrl?: string;
}): MediaStorage {
  const bucket = options.bucket ?? "deal-media";
  const from = () => options.client.storage.from(bucket);

  return {
    getPublicUrl(key: string): string {
      if (options.publicBaseUrl) {
        return `${options.publicBaseUrl.replace(/\/$/, "")}/${key}`;
      }
      const { data } = from().getPublicUrl(key);
      return data.publicUrl as string;
    },
    async put(key, bytes, contentType) {
      const { error } = await from().upload(key, bytes, {
        contentType,
        upsert: true,
      });
      if (error) {
        throw new Error(`storage upload failed: ${error.message}`);
      }
      return {
        key,
        url: this.getPublicUrl(key),
        contentType,
        sizeBytes: bytes.byteLength,
      };
    },
    async delete(key) {
      const { error } = await from().remove([key]);
      if (error) {
        throw new Error(`storage delete failed: ${error.message}`);
      }
    },
  };
}

export function buildDealMediaStorageKey(
  operatorId: string,
  dealId: string,
  fileId: string,
  ext: string
): string {
  return `operators/${operatorId}/deals/${dealId}/${fileId}.${ext}`;
}

export function extensionForMime(
  mime: "image/jpeg" | "image/png" | "image/webp"
): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  return "webp";
}
