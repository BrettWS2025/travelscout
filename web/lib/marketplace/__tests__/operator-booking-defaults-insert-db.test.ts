/**
 * Security S5: operator_booking_defaults INSERT — trigger / service_role only.
 */
import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  createOperator,
  createOperatorStore,
  getBookingDefaults,
} from "@/lib/marketplace/operators";

const S5_MIGRATION_PATH = path.resolve(
  __dirname,
  "../../../../supabase/migrations/20261028000001_fix_operator_booking_defaults_insert.sql"
);

const OPERATORS_MIGRATION_PATH = path.resolve(
  __dirname,
  "../../../../supabase/migrations/20261019000001_create_operators_tables.sql"
);

describe("S5 migration — fix operator_booking_defaults INSERT", () => {
  const sql = readFileSync(S5_MIGRATION_PATH, "utf8");
  const createSql = readFileSync(OPERATORS_MIGRATION_PATH, "utf8");

  it("documents Security S5 and rejects WITH CHECK (true)", () => {
    expect(sql).toContain(
      "Security S5: Fix operator_booking_defaults INSERT policy"
    );
    expect(sql).toMatch(/WITH CHECK \(true\)/);
    expect(sql).toMatch(/never true/i);
    expect(sql).toMatch(/Do not reintroduce WITH CHECK \(true\)/);
  });

  it("drops the open System can insert booking defaults policy", () => {
    expect(sql).toMatch(
      /DROP POLICY IF EXISTS "System can insert booking defaults"\s+ON marketplace\.operator_booking_defaults/
    );
    // Must not recreate an open INSERT policy.
    expect(sql).not.toMatch(
      /CREATE POLICY[\s\S]*INSERT[\s\S]*WITH CHECK\s*\(\s*true\s*\)/i
    );
  });

  it("revokes INSERT from PUBLIC, anon, and authenticated", () => {
    expect(sql).toMatch(
      /REVOKE INSERT ON TABLE marketplace\.operator_booking_defaults\s+FROM PUBLIC, anon, authenticated/s
    );
  });

  it("keeps service_role INSERT and authenticated SELECT/UPDATE only", () => {
    expect(sql).toMatch(
      /GRANT SELECT, INSERT, UPDATE, DELETE\s+ON TABLE marketplace\.operator_booking_defaults\s+TO service_role/s
    );
    expect(sql).toMatch(
      /GRANT SELECT, UPDATE, DELETE\s+ON TABLE marketplace\.operator_booking_defaults\s+TO authenticated/s
    );
    // Authenticated must not regain INSERT via a real GRANT statement.
    const grantStatements = sql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => /^GRANT\b/i.test(s));
    expect(
      grantStatements.some(
        (s) =>
          /\bINSERT\b/i.test(s) &&
          /\bTO\s+authenticated\b/i.test(s)
      )
    ).toBe(false);
  });

  it("documents trigger / service_role-only inserts and owner-manager UPDATE path", () => {
    expect(sql).toContain("create_operator_booking_defaults");
    expect(sql).toMatch(/SECURITY DEFINER/i);
    expect(sql).toMatch(/service_role/i);
    expect(sql).toMatch(/Owners\/managers still SELECT\/UPDATE/);
    expect(sql).toContain("is_operator_owner_or_manager");
  });

  it("asserts create_operator_booking_defaults stays SECURITY DEFINER at migrate time", () => {
    expect(sql).toContain("create_operator_booking_defaults must be SECURITY DEFINER");
    expect(sql).toContain("p.prosecdef");
  });

  it("original create migration defines SECURITY DEFINER auto-insert trigger", () => {
    expect(createSql).toMatch(
      /CREATE OR REPLACE FUNCTION marketplace\.create_operator_booking_defaults\(\)[\s\S]*?SECURITY DEFINER/
    );
    expect(createSql).toContain(
      "marketplace_operators_create_booking_defaults"
    );
    expect(createSql).toContain(
      'CREATE POLICY "System can insert booking defaults"'
    );
    expect(createSql).toMatch(
      /"System can insert booking defaults"[\s\S]*?WITH CHECK \(true\)/
    );
  });
});

describe("S5 create-operator path still seeds booking defaults", () => {
  it("createOperator always inserts OperatorBookingDefaults (mirrors DB trigger)", () => {
    const store = createOperatorStore();
    const { operator, defaults } = createOperator(store, {
      legalName: "S5 Kayaks Limited",
      tradingName: "S5 Kayaks",
      slug: "s5-kayaks-defaults",
    });

    expect(defaults.operatorId).toBe(operator.id);
    expect(getBookingDefaults(store, operator.id)).toEqual(defaults);
  });
});
