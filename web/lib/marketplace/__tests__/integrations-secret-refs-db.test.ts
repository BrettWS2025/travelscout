/**
 * Security S13: strip credentials_ref / webhook_secret_ref from client surfaces.
 */
import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  INTEGRATION_MEMBER_COLUMNS,
  INTEGRATION_SECRET_FIELDS,
  INTEGRATION_SECRET_REF_COLUMNS,
  assertNoSecretRefs,
  serializeIntegration,
  stripIntegrationSecrets,
  type Integration,
} from "@/lib/marketplace/integration";
import { serializeIntegrationPublic } from "@/lib/marketplace/integration-connect";

const S13_MIGRATION_PATH = path.resolve(
  __dirname,
  "../../../../supabase/migrations/20261034000001_strip_integration_secret_refs.sql"
);

const CREATE_MIGRATION_PATH = path.resolve(
  __dirname,
  "../../../../supabase/migrations/20261020000004_create_integration_tables.sql"
);

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

describe("S13 migration — strip integration secret refs", () => {
  const sql = readFileSync(S13_MIGRATION_PATH, "utf8");
  const createSql = readFileSync(CREATE_MIGRATION_PATH, "utf8");

  it("documents Security S13 and integrations_member view", () => {
    expect(sql).toContain(
      "Security S13: Strip secret refs from client-visible surfaces"
    );
    expect(sql).toContain("marketplace.integrations_member");
    expect(sql).toMatch(/security_invoker\s*=\s*true/);
  });

  it("creates integrations_member with only INTEGRATION_MEMBER_COLUMNS", () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE VIEW marketplace\.integrations_member AS/
    );

    const selectBlock = sql.match(
      /CREATE OR REPLACE VIEW marketplace\.integrations_member AS([\s\S]*?)FROM marketplace\.integrations/
    )?.[1];
    expect(selectBlock).toBeDefined();

    for (const col of INTEGRATION_MEMBER_COLUMNS) {
      expect(selectBlock).toContain(col);
    }
    for (const col of INTEGRATION_SECRET_REF_COLUMNS) {
      expect(selectBlock).not.toMatch(new RegExp(`\\b${col}\\b`));
    }
  });

  it("grants SELECT on the member view to authenticated and service_role", () => {
    expect(sql).toMatch(
      /GRANT SELECT ON marketplace\.integrations_member TO authenticated, service_role/
    );
    expect(sql).not.toMatch(
      /GRANT SELECT ON marketplace\.integrations_member TO[^;]*\banon\b/
    );
  });

  it("revokes SELECT/INSERT/UPDATE on secret ref columns from clients", () => {
    for (const privilege of ["SELECT", "INSERT", "UPDATE"] as const) {
      expect(sql).toMatch(
        new RegExp(
          `REVOKE ${privilege} \\(credentials_ref, webhook_secret_ref\\)\\s+ON TABLE marketplace\\.integrations\\s+FROM PUBLIC, anon, authenticated`,
          "s"
        )
      );
    }
  });

  it("keeps service_role full access on integrations", () => {
    expect(sql).toMatch(
      /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE marketplace\.integrations\s+TO service_role/
    );
  });

  it("re-asserts encrypted_secrets is service_role only", () => {
    expect(sql).toContain(
      "ALTER TABLE marketplace.encrypted_secrets ENABLE ROW LEVEL SECURITY"
    );
    expect(sql).toMatch(
      /REVOKE ALL ON TABLE marketplace\.encrypted_secrets\s+FROM PUBLIC, anon, authenticated/
    );
    expect(sql).toContain(
      "GRANT ALL ON TABLE marketplace.encrypted_secrets TO service_role"
    );
    expect(sql).not.toMatch(
      /GRANT .+ ON TABLE marketplace\.encrypted_secrets TO[^;]*\b(authenticated|anon)\b/
    );
  });

  it("create migration originally granted full-row SELECT including refs to authenticated", () => {
    expect(createSql).toContain("credentials_ref");
    expect(createSql).toContain("webhook_secret_ref");
    expect(createSql).toContain(
      'CREATE POLICY "Members can view integrations"'
    );
    expect(createSql).toMatch(
      /GRANT SELECT, INSERT, UPDATE, DELETE ON marketplace\.integrations\s+TO authenticated, service_role/
    );
  });
});

describe("S13 serializers — secret refs never reach clients", () => {
  it("INTEGRATION_MEMBER_COLUMNS excludes secret refs and matches public serializer keys", () => {
    for (const col of INTEGRATION_SECRET_REF_COLUMNS) {
      expect(INTEGRATION_MEMBER_COLUMNS).not.toContain(col);
    }

    const publicRow = serializeIntegrationPublic(sampleIntegration());
    expect(Object.keys(publicRow).sort()).toEqual(
      [...INTEGRATION_MEMBER_COLUMNS].sort()
    );
    expect(() => assertNoSecretRefs(publicRow)).not.toThrow();
  });

  it("serializeIntegration and stripIntegrationSecrets omit all INTEGRATION_SECRET_FIELDS", () => {
    const domain = serializeIntegration(sampleIntegration());
    for (const field of INTEGRATION_SECRET_FIELDS) {
      expect(domain).not.toHaveProperty(field);
    }

    const stripped = stripIntegrationSecrets({
      id: "1",
      status: "connected",
      credentials_ref: "leak",
      webhook_secret_ref: "leak2",
      credentialsRef: "leak3",
      webhookSecretRef: "leak4",
    });
    for (const field of INTEGRATION_SECRET_FIELDS) {
      expect(stripped).not.toHaveProperty(field);
    }
    expect(stripped).toEqual({ id: "1", status: "connected" });
  });

  it("assertNoSecretRefs rejects nested credentials_ref / webhook_secret_ref", () => {
    expect(() =>
      assertNoSecretRefs({
        card: { provider: "rezdy" },
        integration: { id: "1", webhook_secret_ref: "x" },
      })
    ).toThrow(/webhook_secret_ref/);
  });
});
