import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  DEV_SEED_IDS,
  DEV_SEED_USERS,
  isDevSeedAllowed,
  seedDevMarketplace,
} from "@/lib/marketplace/seed-dev";
import {
  BILLING_ACCOUNT_STATUSES,
  DEFAULT_NOTIFICATION_PREFERENCES,
  MANDATORY_NOTIFICATION_EVENTS,
  NOTIFICATION_EVENT_TYPES,
  PLATFORM_REGIONS,
  buildDefaultNotificationPreferences,
  isPlatformRegion,
  serializeBillingAccount,
  stripBillingSecrets,
  validateBillingAccountFields,
  validateComplianceDocumentFields,
  validateNotificationPreferenceFields,
  type BillingAccount,
} from "@/lib/marketplace/settings";
import { listTeamMembers } from "@/lib/marketplace/operators";

const SETTINGS_MIGRATION_PATH = path.resolve(
  __dirname,
  "../../../../supabase/migrations/20261020000005_create_settings_tables.sql"
);

const SEED_SQL_PATH = path.resolve(
  __dirname,
  "../../../../supabase/seeds/deals_platform_dev.sql"
);

describe("Chunk 8 migration", () => {
  it("defines notification_preferences, compliance_documents and billing_accounts", () => {
    const sql = readFileSync(SETTINGS_MIGRATION_PATH, "utf8");

    expect(sql).toContain("CREATE TABLE marketplace.notification_preferences");
    expect(sql).toContain("CREATE TABLE marketplace.compliance_documents");
    expect(sql).toContain("CREATE TABLE marketplace.billing_accounts");

    expect(sql).toContain("UNIQUE (user_id, operator_id, event_type)");
    expect(sql).toContain("operator_id UUID NOT NULL UNIQUE");
    expect(sql).toContain("review_status TEXT NOT NULL DEFAULT 'pending'");
    expect(sql).toContain("'subscription', 'per_click', 'commission'");
    expect(sql).toContain("payment_method_ref");
    expect(sql).toContain("integration_sync_failing");
    expect(sql).toContain("compliance_expiring");
    expect(sql).toContain("public_liability_insurance");

    expect(sql).toContain("Owners can view billing accounts");
    expect(sql).toContain("Members can view own notification preferences");
  });
});

describe("PLATFORM_REGIONS", () => {
  it("includes the Chunk 8 tourism region list", () => {
    expect(PLATFORM_REGIONS).toEqual([
      "Auckland",
      "Northland",
      "Waikato",
      "Bay of Plenty",
      "Rotorua",
      "Taupō",
      "Hawke's Bay",
      "Wellington",
      "Nelson Tasman",
      "Marlborough",
      "Canterbury",
      "West Coast",
      "Otago",
      "Queenstown",
      "Southland",
    ]);
    expect(isPlatformRegion("Queenstown")).toBe(true);
    expect(isPlatformRegion("Gisborne")).toBe(false);
  });
});

describe("notification preference defaults", () => {
  it("covers every event type with the spec §6.4 channel defaults", () => {
    expect(NOTIFICATION_EVENT_TYPES).toHaveLength(9);
    expect(MANDATORY_NOTIFICATION_EVENTS).toEqual(
      expect.arrayContaining([
        "integration_sync_failing",
        "deal_auto_paused",
        "attestation_due",
        "booking_link_broken",
        "compliance_expiring",
      ])
    );

    const prefs = buildDefaultNotificationPreferences(
      "user-1",
      "op-1",
      { now: "2026-01-01T00:00:00.000Z" }
    );
    expect(prefs).toHaveLength(NOTIFICATION_EVENT_TYPES.length);

    const byType = Object.fromEntries(
      prefs.map((p) => [p.eventType, p])
    );
    expect(byType.integration_sync_failing).toMatchObject({
      email: true,
      sms: true,
      inApp: true,
    });
    expect(byType.deal_lifecycle).toMatchObject({
      email: false,
      sms: false,
      inApp: true,
    });
    expect(byType.compliance_expiring).toMatchObject(
      DEFAULT_NOTIFICATION_PREFERENCES.compliance_expiring
    );
  });

  it("validates event_type and channel booleans", () => {
    expect(
      validateNotificationPreferenceFields({ eventType: "not_a_real_event" })
    ).toEqual([expect.objectContaining({ field: "event_type" })]);
    expect(
      validateNotificationPreferenceFields({ email: "yes" as unknown as boolean })
    ).toEqual([expect.objectContaining({ field: "email" })]);
  });
});

describe("compliance + billing validators / serializers", () => {
  it("validates compliance doc fields", () => {
    expect(
      validateComplianceDocumentFields({
        docType: "not_real",
        file: "",
        reviewStatus: "nope",
      }).map((e) => e.field)
    ).toEqual(
      expect.arrayContaining(["doc_type", "file", "review_status"])
    );
  });

  it("validates billing fields and strips payment_method_ref", () => {
    expect(BILLING_ACCOUNT_STATUSES).toContain("active");
    expect(
      validateBillingAccountFields({
        billingModel: "barter",
        commissionPct: 101,
        status: "bogus",
        billingEmail: "not-an-email",
      }).map((e) => e.field)
    ).toEqual(
      expect.arrayContaining([
        "billing_model",
        "commission_pct",
        "status",
        "billing_email",
      ])
    );

    const account: BillingAccount = {
      id: "bill-1",
      operatorId: "op-1",
      plan: "starter",
      billingModel: "subscription",
      commissionPct: null,
      billingEmail: "billing@example.com",
      paymentMethodRef: "pm_secret_ref",
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const publicAccount = serializeBillingAccount(account);
    expect(publicAccount).not.toHaveProperty("paymentMethodRef");
    expect(
      stripBillingSecrets({
        plan: "starter",
        payment_method_ref: "pm_x",
        paymentMethodRef: "pm_y",
      })
    ).toEqual({ plan: "starter" });
  });
});

describe("seedDevMarketplace", () => {
  it("seeds Harbour Kayaks (owner/manager/staff) and Bay Cruises (rezdy not_connected)", () => {
    const seed = seedDevMarketplace();

    expect(seed.harbourKayaks.operator.tradingName).toBe("Harbour Kayaks");
    expect(seed.harbourKayaks.operator.slug).toBe("harbour-kayaks");
    expect(seed.harbourKayaks.defaults.operatorId).toBe(
      seed.harbourKayaks.operator.id
    );
    expect(seed.harbourKayaks.owner.role).toBe("owner");
    expect(seed.harbourKayaks.manager.role).toBe("manager");
    expect(seed.harbourKayaks.staff.role).toBe("staff");

    const harbourTeam = listTeamMembers(
      seed.store,
      seed.harbourKayaks.operator.id
    );
    expect(harbourTeam).toHaveLength(3);
    expect(harbourTeam.every((m) => m.inviteStatus === "accepted")).toBe(true);

    expect(seed.bayCruises.operator.tradingName).toBe("Bay Cruises");
    expect(seed.bayCruises.integration.provider).toBe("rezdy");
    expect(seed.bayCruises.integration.status).toBe("not_connected");
    expect(seed.bayCruises.integration.credentialsRef).toBeNull();

    expect(seed.billingAccounts).toHaveLength(2);
    expect(
      seed.notificationPreferences.length
    ).toBe(DEV_SEED_USERS.length * NOTIFICATION_EVENT_TYPES.length);

    expect(seed.harbourKayaks.operator.id).toBe(
      DEV_SEED_IDS.harbourKayaks.operatorId
    );
    expect(seed.bayCruises.integration.id).toBe(
      DEV_SEED_IDS.bayCruises.integrationId
    );

    for (const user of DEV_SEED_USERS) {
      expect(user.email).toMatch(/@(harbour-kayaks|bay-cruises)\.dev$/);
    }
  });

  it("allows seed in test/development or when DEAL_PLATFORM_SEED=1", () => {
    expect(isDevSeedAllowed({ NODE_ENV: "test" })).toBe(true);
    expect(isDevSeedAllowed({ NODE_ENV: "development" })).toBe(true);
    expect(isDevSeedAllowed({ NODE_ENV: "production" })).toBe(false);
    expect(
      isDevSeedAllowed({ NODE_ENV: "production", DEAL_PLATFORM_SEED: "1" })
    ).toBe(true);
  });
});

describe("dev seed SQL", () => {
  it("documents seeded logins and mirrors TypeScript IDs", () => {
    const sql = readFileSync(SEED_SQL_PATH, "utf8");

    expect(sql).toContain("DEV ONLY");
    expect(sql).toContain("DevSeed123!");
    expect(sql).toContain("owner@harbour-kayaks.dev");
    expect(sql).toContain("manager@harbour-kayaks.dev");
    expect(sql).toContain("staff@harbour-kayaks.dev");
    expect(sql).toContain("owner@bay-cruises.dev");
    expect(sql).toContain("Harbour Kayaks");
    expect(sql).toContain("Bay Cruises");
    expect(sql).toContain("'rezdy'");
    expect(sql).toContain("'not_connected'");
    expect(sql).toContain(DEV_SEED_IDS.harbourKayaks.operatorId);
    expect(sql).toContain(DEV_SEED_IDS.bayCruises.integrationId);
    expect(sql).toContain("marketplace.notification_preferences");
    expect(sql).toContain("marketplace.billing_accounts");
  });
});
