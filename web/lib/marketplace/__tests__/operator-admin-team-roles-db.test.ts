/**
 * Security S3: operator admin columns + team role escalation locked at the DB.
 */
import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  ADMIN_ONLY_OPERATOR_FIELDS,
  DB_LOCKED_OPERATOR_ADMIN_COLUMNS,
} from "@/lib/marketplace/operator-profile";

const MIGRATION_PATH = path.resolve(
  __dirname,
  "../../../../supabase/migrations/20261026000001_lock_operator_admin_and_team_roles.sql"
);

describe("S3 migration — lock operator admin fields and team roles", () => {
  const sql = readFileSync(MIGRATION_PATH, "utf8");

  it("documents Security S3 and the service_role bypass pattern", () => {
    expect(sql).toContain(
      "Security S3: Lock operator admin fields and team role escalation"
    );
    expect(sql).toContain(
      "current_user IN ('service_role', 'postgres', 'supabase_admin')"
    );
    expect(sql).toContain("ERRCODE = '42501'");
  });

  it("adds BEFORE INSERT/UPDATE triggers on operators for admin columns", () => {
    expect(sql).toContain("enforce_operator_admin_columns");
    expect(sql).toContain("marketplace_operators_enforce_admin_columns");
    expect(sql).toMatch(
      /BEFORE INSERT OR UPDATE ON marketplace\.operators/
    );
    for (const col of DB_LOCKED_OPERATOR_ADMIN_COLUMNS) {
      expect(sql).toContain(col);
    }
    expect(sql).toMatch(
      /NEW\.account_status IS DISTINCT FROM OLD\.account_status[\s\S]*NEW\.requires_manual_review IS DISTINCT FROM OLD\.requires_manual_review/
    );
    expect(sql).toContain("pending_verification");
  });

  it("enforces owner-only role=owner and last accepted owner on team_members", () => {
    expect(sql).toContain("enforce_team_member_role_rules");
    expect(sql).toContain("marketplace_team_members_enforce_role_rules");
    expect(sql).toMatch(
      /BEFORE INSERT OR UPDATE OR DELETE ON marketplace\.team_members/
    );
    expect(sql).toContain("only owners may set role = owner");
    expect(sql).toContain("cannot remove the last accepted owner");
    expect(sql).toContain("cannot demote or revoke the last accepted owner");
    expect(sql).toContain("first-owner bootstrap");
    expect(sql).toContain("is_operator_owner");
    expect(sql).toContain("team_accepted_owner_count");
    expect(sql).toContain("team_has_accepted_member");
  });

  it("mirrors owner escalation rules on legacy organization_members", () => {
    expect(sql).toContain("enforce_organization_member_role_rules");
    expect(sql).toContain(
      "marketplace_organization_members_enforce_role_rules"
    );
    expect(sql).toMatch(
      /BEFORE INSERT OR UPDATE OR DELETE ON marketplace\.organization_members/
    );
    expect(sql).toContain("marketplace.is_org_owner");
    expect(sql).toContain("org_owner_count");
    expect(sql).toContain(
      "organization_members: only owners may set role = owner"
    );
    expect(sql).toContain(
      "organization_members: cannot remove the last owner"
    );
    expect(sql).toContain(
      "organization_members: cannot demote the last owner"
    );
  });

  it("keeps enforce triggers INVOKER so current_user is the PostgREST role", () => {
    expect(sql).toMatch(
      /Trigger functions stay INVOKER so `current_user` reflects the PostgREST role/
    );
    // Enforce functions must not be SECURITY DEFINER (would always look like postgres).
    expect(sql).not.toMatch(
      /CREATE OR REPLACE FUNCTION marketplace\.enforce_operator_admin_columns\(\)[\s\S]*?SECURITY DEFINER/
    );
    expect(sql).not.toMatch(
      /CREATE OR REPLACE FUNCTION marketplace\.enforce_team_member_role_rules\(\)[\s\S]*?SECURITY DEFINER/
    );
    expect(sql).not.toMatch(
      /CREATE OR REPLACE FUNCTION marketplace\.enforce_organization_member_role_rules\(\)[\s\S]*?SECURITY DEFINER/
    );
  });

  it("documents service-role persistence for admin fields when leaving in-memory stores", () => {
    expect(sql).toMatch(/service-role client/i);
    expect(sql).toContain("ensureAcceptedOwner");
  });
});

describe("S3 app constants align with DB lock list", () => {
  it("ADMIN_ONLY_OPERATOR_FIELDS covers account_status and requires_manual_review", () => {
    expect(ADMIN_ONLY_OPERATOR_FIELDS).toEqual(
      expect.arrayContaining([
        "account_status",
        "requires_manual_review",
        "accountStatus",
        "requiresManualReview",
      ])
    );
  });

  it("DB_LOCKED_OPERATOR_ADMIN_COLUMNS is the snake_case DB set", () => {
    expect([...DB_LOCKED_OPERATOR_ADMIN_COLUMNS]).toEqual([
      "account_status",
      "requires_manual_review",
    ]);
  });
});
