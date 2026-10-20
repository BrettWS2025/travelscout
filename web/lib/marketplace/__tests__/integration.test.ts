import { readFileSync } from "fs";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  INTEGRATION_PROVIDERS,
  SYNC_LOG_STATUSES,
  assertNoSecretRefs,
  serializeIntegration,
  stripIntegrationSecrets,
  validateDealRuleFields,
  validateIntegrationFields,
  type Integration,
} from "@/lib/marketplace/integration";
import {
  configureSecrets,
  createMemorySecretBackend,
  createSecretsHelper,
  deleteSecret,
  encryptSecretValue,
  decryptSecretValue,
  readSecret,
  resetSecretsConfig,
  resolveSecretsKey,
  storeSecret,
} from "@/lib/marketplace/secrets";

const MIGRATION_PATH = path.resolve(
  __dirname,
  "../../../../supabase/migrations/20261020000004_create_integration_tables.sql"
);

const TEST_KEY_HEX =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function sampleIntegration(
  overrides: Partial<Integration> = {}
): Integration {
  const now = "2026-10-20T00:00:00.000Z";
  return {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    operatorId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    provider: "rezdy",
    status: "connected",
    authType: "api_key",
    credentialsRef: "secret-ref-credentials-uuid",
    webhookSecretRef: "secret-ref-webhook-uuid",
    externalAccountId: "acct-1",
    externalAccountName: "Bay Cruises Rezdy",
    syncMode: "polling",
    pollIntervalSeconds: 300,
    webhookLastReceivedAt: null,
    lastSyncAt: now,
    lastSuccessfulSyncAt: now,
    lastErrorCode: null,
    lastErrorMessage: null,
    defaultBookingDestinationType: "provider_booking_page",
    bookingBaseUrl: "https://book.example.com",
    conversionTrackingMethod: "none",
    bookingSourceLabel: null,
    autoEnableNewProducts: false,
    connectedAt: now,
    connectedBy: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("Chunk 7 migration", () => {
  it("defines integration, product, session, sync log, deal rule and secrets tables", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf8");

    expect(sql).toContain("CREATE TABLE marketplace.encrypted_secrets");
    expect(sql).toContain("CREATE TABLE marketplace.integrations");
    expect(sql).toContain("CREATE TABLE marketplace.external_products");
    expect(sql).toContain("CREATE TABLE marketplace.external_sessions");
    expect(sql).toContain("CREATE TABLE marketplace.sync_logs");
    expect(sql).toContain("CREATE TABLE marketplace.deal_rules");

    expect(sql).toContain("'rezdy', 'fareharbor', 'bokun', 'checkfront'");
    expect(sql).not.toMatch(
      /provider TEXT NOT NULL[\s\S]*CHECK \(provider IN \([^)]*'manual'/
    );

    expect(sql).toContain("idx_marketplace_integrations_operator_provider_active");
    expect(sql).toContain("WHERE status <> 'disconnected'");
    expect(sql).toContain("UNIQUE (integration_id, external_id)");
    expect(sql).toContain("UNIQUE (external_product_id, external_id)");
    expect(sql).toContain("'running', 'success', 'failed'");
    expect(sql).toContain("'full', 'incremental', 'webhook', 'click_recheck', 'manual'");

    expect(sql).toContain("REFERENCES marketplace.operator_deals(id) ON DELETE RESTRICT");
    expect(sql).toContain("operator_deals_integration_id_fkey");
    expect(sql).toContain("operator_deals_external_product_id_fkey");
    expect(sql).toContain("operator_deals_deal_rule_id_fkey");
    expect(sql).toContain("deal_sessions_external_session_id_fkey");

    expect(sql).toContain("GRANT SELECT, INSERT, UPDATE, DELETE ON marketplace.encrypted_secrets");
    expect(sql).toContain("TO service_role");
    expect(sql).toContain("credentials_ref");
    expect(sql).toContain("webhook_secret_ref");
  });
});

describe("INTEGRATION_PROVIDERS / SYNC_LOG_STATUSES", () => {
  it("excludes manual from connectable providers", () => {
    expect(INTEGRATION_PROVIDERS).toEqual([
      "rezdy",
      "fareharbor",
      "bokun",
      "checkfront",
    ]);
    expect(INTEGRATION_PROVIDERS).not.toContain("manual");
  });

  it("lists sync log statuses", () => {
    expect(SYNC_LOG_STATUSES).toEqual(["running", "success", "failed"]);
  });
});

describe("serializeIntegration — secrets never returned", () => {
  it("omits credentialsRef and webhookSecretRef from the public payload", () => {
    const publicRow = serializeIntegration(sampleIntegration());

    expect(publicRow).not.toHaveProperty("credentialsRef");
    expect(publicRow).not.toHaveProperty("webhookSecretRef");
    expect(publicRow).not.toHaveProperty("credentials_ref");
    expect(publicRow).not.toHaveProperty("webhook_secret_ref");

    expect(publicRow.provider).toBe("rezdy");
    expect(publicRow.externalAccountName).toBe("Bay Cruises Rezdy");
    expect(publicRow.status).toBe("connected");

    expect(() => assertNoSecretRefs(publicRow)).not.toThrow();
  });

  it("stripIntegrationSecrets removes snake_case and camelCase refs", () => {
    const stripped = stripIntegrationSecrets({
      id: "1",
      provider: "rezdy",
      credentials_ref: "should-not-leak",
      webhook_secret_ref: "also-secret",
      credentialsRef: "camel-leak",
      webhookSecretRef: "camel-hook",
      status: "connected",
    });

    expect(stripped).toEqual({ id: "1", provider: "rezdy", status: "connected" });
    expect(() => assertNoSecretRefs(stripped)).not.toThrow();
  });

  it("assertNoSecretRefs throws when a ref sneaks into nested payloads", () => {
    expect(() =>
      assertNoSecretRefs({
        integrations: [{ id: "1", credentials_ref: "x" }],
      })
    ).toThrow(/credentials_ref/);
  });
});

describe("secrets helper", () => {
  afterEach(() => {
    resetSecretsConfig();
  });

  it("round-trips encrypt/decrypt with the env key", () => {
    const key = resolveSecretsKey({ SECRETS_ENCRYPTION_KEY: TEST_KEY_HEX });
    const cipher = encryptSecretValue("rezdy-api-key-abc", key);
    expect(cipher.startsWith("v1:")).toBe(true);
    expect(cipher).not.toContain("rezdy-api-key-abc");
    expect(decryptSecretValue(cipher, key)).toBe("rezdy-api-key-abc");
  });

  it("storeSecret → readSecret → deleteSecret via memory backend", async () => {
    const backend = createMemorySecretBackend();
    const helper = createSecretsHelper({
      backend,
      env: { SECRETS_ENCRYPTION_KEY: TEST_KEY_HEX },
    });
    configureSecrets(helper);

    const ref = await storeSecret("super-secret-token", "rezdy credentials");
    expect(ref).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(backend.records.get(ref)?.ciphertext).not.toContain(
      "super-secret-token"
    );

    expect(await readSecret(ref)).toBe("super-secret-token");
    expect(await deleteSecret(ref)).toBe(true);
    await expect(readSecret(ref)).rejects.toThrow(/not found/i);
  });
});

describe("validateIntegrationFields / validateDealRuleFields", () => {
  it("rejects manual as an integration provider", () => {
    expect(validateIntegrationFields({ provider: "manual" })).toEqual([
      expect.objectContaining({ field: "provider" }),
    ]);
    expect(validateIntegrationFields({ provider: "rezdy" })).toEqual([]);
  });

  it("enforces list_hours_before_start 1–MAX_LEAD_HOURS and session HH:MM", () => {
    expect(
      validateDealRuleFields({ listHoursBeforeStart: 0 })
    ).toEqual([expect.objectContaining({ field: "list_hours_before_start" })]);
    expect(
      validateDealRuleFields({ listHoursBeforeStart: 73 })
    ).toEqual([expect.objectContaining({ field: "list_hours_before_start" })]);
    expect(
      validateDealRuleFields({ listHoursBeforeStart: 48 })
    ).toEqual([]);

    expect(
      validateDealRuleFields({ sessionTimes: ["14:00", "9:00"] })
    ).toEqual([expect.objectContaining({ field: "session_times" })]);
    expect(
      validateDealRuleFields({ sessionTimes: ["14:00", "09:00"] })
    ).toEqual([]);

    expect(
      validateDealRuleFields({ daysOfWeek: [0, 7] })
    ).toEqual([expect.objectContaining({ field: "days_of_week" })]);
    expect(validateDealRuleFields({ minUnsoldSeats: 0 })).toEqual([
      expect.objectContaining({ field: "min_unsold_seats" }),
    ]);
  });
});
