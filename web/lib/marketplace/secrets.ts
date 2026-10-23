/**
 * Encrypted secret store helper (deals platform Chunk 7).
 *
 * Provider credentials and webhook secrets are stored only as opaque refs
 * (`credentials_ref`, `webhook_secret_ref`) pointing at rows in
 * `marketplace.encrypted_secrets`. Never log plaintext or return refs/values
 * to the client — see serializeIntegration in integration.ts.
 *
 * Encryption: AES-256-GCM. Key from SECRETS_ENCRYPTION_KEY (32-byte hex or
 * base64). In tests, an in-memory backend can be injected.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

export type SecretRecord = {
  id: string;
  ciphertext: string;
  label: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Pluggable persistence (DB in production; Map in unit tests). */
export type SecretStoreBackend = {
  insert(record: SecretRecord): void | Promise<void>;
  get(id: string): SecretRecord | null | Promise<SecretRecord | null>;
  delete(id: string): boolean | Promise<boolean>;
};

export class SecretsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretsConfigError";
  }
}

export class SecretNotFoundError extends Error {
  constructor(ref: string) {
    super(`Secret not found: ${ref}`);
    this.name = "SecretNotFoundError";
  }
}

/**
 * Security S11: hardcoded HMAC / encryption fallbacks are allowed only in
 * development, Vitest, or explicit seed mode — never in production.
 */
export function allowsDevSecretFallback(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return (
    env.NODE_ENV === "test" ||
    env.NODE_ENV === "development" ||
    env.DEAL_PLATFORM_SEED === "1"
  );
}

/** Decode SECRETS_ENCRYPTION_KEY (64 hex chars or 32-byte base64). */
export function resolveSecretsKey(
  env: NodeJS.ProcessEnv = process.env
): Buffer {
  const raw = env.SECRETS_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new SecretsConfigError(
      "SECRETS_ENCRYPTION_KEY is required to store or read secrets"
    );
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  const fromB64 = Buffer.from(raw, "base64");
  if (fromB64.length === 32) {
    return fromB64;
  }
  throw new SecretsConfigError(
    "SECRETS_ENCRYPTION_KEY must be 32 bytes (64 hex chars or base64)"
  );
}

/**
 * Pack: base64(iv | authTag | ciphertext). Version prefix "v1:" for future algos.
 */
export function encryptSecretValue(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const packed = Buffer.concat([iv, tag, encrypted]);
  return `v1:${packed.toString("base64")}`;
}

export function decryptSecretValue(ciphertext: string, key: Buffer): string {
  if (!ciphertext.startsWith("v1:")) {
    throw new SecretsConfigError("Unsupported secret ciphertext version");
  }
  const packed = Buffer.from(ciphertext.slice(3), "base64");
  if (packed.length < IV_BYTES + AUTH_TAG_BYTES + 1) {
    throw new SecretsConfigError("Corrupt secret ciphertext");
  }
  const iv = packed.subarray(0, IV_BYTES);
  const tag = packed.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES);
  const data = packed.subarray(IV_BYTES + AUTH_TAG_BYTES);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8"
  );
}

/** In-memory backend for unit tests. */
export function createMemorySecretBackend(): SecretStoreBackend & {
  records: Map<string, SecretRecord>;
} {
  const records = new Map<string, SecretRecord>();
  return {
    records,
    insert(record) {
      records.set(record.id, record);
    },
    get(id) {
      return records.get(id) ?? null;
    },
    delete(id) {
      return records.delete(id);
    },
  };
}

export type SecretsHelperOptions = {
  backend: SecretStoreBackend;
  key?: Buffer;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  id?: () => string;
};

export type SecretsHelper = {
  storeSecret(value: string, label?: string | null): Promise<string>;
  readSecret(ref: string): Promise<string>;
  deleteSecret(ref: string): Promise<boolean>;
};

/**
 * Build storeSecret / readSecret / deleteSecret bound to a backend + key.
 * Returns the opaque ref (UUID string) — never the plaintext.
 */
export function createSecretsHelper(
  options: SecretsHelperOptions
): SecretsHelper {
  const now = options.now ?? (() => new Date());
  const newId = options.id ?? (() => crypto.randomUUID());
  const key =
    options.key ?? resolveSecretsKey(options.env ?? process.env);

  return {
    async storeSecret(value: string, label: string | null = null) {
      if (typeof value !== "string" || value.length === 0) {
        throw new SecretsConfigError("Secret value must be a non-empty string");
      }
      const id = newId();
      const ts = now().toISOString();
      const record: SecretRecord = {
        id,
        ciphertext: encryptSecretValue(value, key),
        label,
        createdAt: ts,
        updatedAt: ts,
      };
      await options.backend.insert(record);
      return id;
    },

    async readSecret(ref: string) {
      const record = await options.backend.get(ref);
      if (!record) {
        throw new SecretNotFoundError(ref);
      }
      return decryptSecretValue(record.ciphertext, key);
    },

    async deleteSecret(ref: string) {
      return Boolean(await options.backend.delete(ref));
    },
  };
}

/**
 * Module-level helpers for app code. Call configureSecrets() once at startup
 * (or in tests) before store/read/delete. Lazy key resolution on first use.
 */
let configured: SecretsHelper | null = null;

export function configureSecrets(helper: SecretsHelper): void {
  configured = helper;
}

export function resetSecretsConfig(): void {
  configured = null;
}

function requireConfigured(): SecretsHelper {
  if (!configured) {
    throw new SecretsConfigError(
      "Secrets helper not configured — call configureSecrets() first"
    );
  }
  return configured;
}

export async function storeSecret(
  value: string,
  label?: string | null
): Promise<string> {
  return requireConfigured().storeSecret(value, label);
}

export async function readSecret(ref: string): Promise<string> {
  return requireConfigured().readSecret(ref);
}

export async function deleteSecret(ref: string): Promise<boolean> {
  return requireConfigured().deleteSecret(ref);
}
