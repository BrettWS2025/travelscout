import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  ATTESTATION_REMINDER_HOURS,
  DEFAULT_CURRENCY,
  DEFAULT_TIMEZONE,
  MIN_DISCOUNT_PCT,
} from "@/lib/marketplace/config";
import {
  LastOwnerError,
  OperatorValidationError,
  applyTeamMemberChange,
  createOperator,
  createOperatorStore,
  ensureAcceptedOwner,
  getBookingDefaults,
  hasAcceptedOwner,
  listTeamMembers,
  removeTeamMember,
  seedOperatorWithOwner,
  validateBookingDefaultsPatch,
  validateOperatorFields,
} from "@/lib/marketplace/operators";

const MIGRATION_PATH = path.resolve(
  __dirname,
  "../../../../supabase/migrations/20261019000001_create_operators_tables.sql"
);

describe("Chunk 2 migration", () => {
  it("defines operators, operator_booking_defaults and team_members with auto-defaults trigger", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf8");

    expect(sql).toContain("CREATE TABLE marketplace.operators");
    expect(sql).toContain("CREATE TABLE marketplace.operator_booking_defaults");
    expect(sql).toContain("CREATE TABLE marketplace.team_members");
    expect(sql).toContain("UNIQUE (operator_id, user_id)");
    expect(sql).toContain("marketplace.create_operator_booking_defaults");
    expect(sql).toContain(
      "marketplace_operators_create_booking_defaults"
    );
    expect(sql).toMatch(/short_description[\s\S]*<= 160/);
    expect(sql).toMatch(/long_description[\s\S]*<= 3000/);
    expect(sql).toContain("pending_verification");
    expect(sql).toContain("'owner', 'manager', 'staff'");
    expect(sql).toContain("'pending', 'accepted', 'revoked'");
  });
});

describe("createOperator + booking defaults", () => {
  it("creates booking defaults automatically with platform defaults", () => {
    const store = createOperatorStore();
    const { operator, defaults } = createOperator(store, {
      legalName: "Harbour Kayaks Limited",
      tradingName: "Harbour Kayaks",
      slug: "harbour-kayaks",
    });

    expect(operator.id).toBeTruthy();
    expect(operator.timezone).toBe(DEFAULT_TIMEZONE);
    expect(operator.currency).toBe(DEFAULT_CURRENCY);
    expect(operator.accountStatus).toBe("pending_verification");
    expect(operator.requiresManualReview).toBe(false);

    expect(defaults.operatorId).toBe(operator.id);
    expect(defaults.defaultDiscountPct).toBe(MIN_DISCOUNT_PCT);
    expect(defaults.defaultAttestationReminderHours).toBe(
      ATTESTATION_REMINDER_HOURS
    );
    expect(defaults.defaultDiscountMechanism).toBe("manual_price");
    expect(defaults.defaultBookingDestinationType).toBe("operator_website");
    expect(defaults.defaultCancellationPolicyType).toBe("operator_standard");
    expect(defaults.defaultSalesCutoffMinutes).toBe(0);
    expect(defaults.defaultSeatCap).toBeNull();

    expect(getBookingDefaults(store, operator.id)).toEqual(defaults);
  });

  it("rejects duplicate slugs and overlong descriptions", () => {
    const store = createOperatorStore();
    createOperator(store, {
      legalName: "A Ltd",
      tradingName: "A",
      slug: "same-slug",
    });

    expect(() =>
      createOperator(store, {
        legalName: "B Ltd",
        tradingName: "B",
        slug: "same-slug",
      })
    ).toThrow(OperatorValidationError);

    const errors = validateOperatorFields({
      legalName: "C Ltd",
      tradingName: "C",
      slug: "c",
      shortDescription: "x".repeat(161),
      longDescription: "y".repeat(3001),
    });
    expect(errors.map((e) => e.field)).toEqual(
      expect.arrayContaining(["short_description", "long_description"])
    );
  });
});

describe("seedOperatorWithOwner", () => {
  it("seeds one operator with an accepted owner and auto defaults", () => {
    const store = createOperatorStore();
    const { operator, defaults, owner } = seedOperatorWithOwner(store, {
      legalName: "Harbour Kayaks Limited",
      tradingName: "Harbour Kayaks",
      slug: "harbour-kayaks",
      ownerUserId: "11111111-1111-1111-1111-111111111111",
      ownerEmail: "owner@harbour.example",
    });

    expect(defaults.operatorId).toBe(operator.id);
    expect(owner.role).toBe("owner");
    expect(owner.inviteStatus).toBe("accepted");
    expect(owner.userId).toBe("11111111-1111-1111-1111-111111111111");
    expect(hasAcceptedOwner(listTeamMembers(store, operator.id))).toBe(true);
    ensureAcceptedOwner(listTeamMembers(store, operator.id));
  });
});

describe("ensureAcceptedOwner", () => {
  it("allows changes that leave an accepted owner", () => {
    const store = createOperatorStore();
    const { owner } = seedOperatorWithOwner(store, {
      legalName: "Bay Cruises Ltd",
      tradingName: "Bay Cruises",
      slug: "bay-cruises",
      ownerUserId: "22222222-2222-2222-2222-222222222222",
      ownerEmail: "owner@bay.example",
    });

    const staffId = crypto.randomUUID();
    store.teamMembers.set(staffId, {
      id: staffId,
      operatorId: owner.operatorId,
      userId: "33333333-3333-3333-3333-333333333333",
      role: "staff",
      invitedEmail: "staff@bay.example",
      inviteStatus: "accepted",
      invitedAt: owner.invitedAt,
      lastActiveAt: null,
      createdAt: owner.createdAt,
      updatedAt: owner.updatedAt,
    });

    const members = listTeamMembers(store, owner.operatorId);
    const afterStaffGone = removeTeamMember(members, staffId);
    expect(hasAcceptedOwner(afterStaffGone)).toBe(true);
  });

  it("blocks removing or demoting the last accepted owner", () => {
    const store = createOperatorStore();
    const { owner } = seedOperatorWithOwner(store, {
      legalName: "Solo Ltd",
      tradingName: "Solo",
      slug: "solo-op",
      ownerUserId: "44444444-4444-4444-4444-444444444444",
      ownerEmail: "solo@example.com",
    });
    const members = listTeamMembers(store, owner.operatorId);

    expect(() => removeTeamMember(members, owner.id)).toThrow(LastOwnerError);
    expect(() =>
      applyTeamMemberChange(members, owner.id, { role: "manager" })
    ).toThrow(LastOwnerError);
    expect(() =>
      applyTeamMemberChange(members, owner.id, { inviteStatus: "revoked" })
    ).toThrow(LastOwnerError);
  });
});

describe("validateBookingDefaultsPatch", () => {
  it("enforces MIN_DISCOUNT_PCT and range checks", () => {
    expect(
      validateBookingDefaultsPatch({
        defaultDiscountPct: MIN_DISCOUNT_PCT - 1,
      })
    ).toEqual([
      expect.objectContaining({ field: "default_discount_pct" }),
    ]);

    expect(
      validateBookingDefaultsPatch({
        defaultSalesCutoffMinutes: 1441,
        defaultSeatCap: 0,
        defaultBookingInstructions: "x".repeat(301),
      }).map((e) => e.field)
    ).toEqual(
      expect.arrayContaining([
        "default_sales_cutoff_minutes",
        "default_seat_cap",
        "default_booking_instructions",
      ])
    );

    expect(
      validateBookingDefaultsPatch({
        defaultDiscountPct: MIN_DISCOUNT_PCT,
        defaultSalesCutoffMinutes: 120,
        defaultSeatCap: null,
      })
    ).toEqual([]);
  });
});
