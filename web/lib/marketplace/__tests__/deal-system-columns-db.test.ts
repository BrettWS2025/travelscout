/**
 * Security S2: system-owned deal columns locked at the database.
 */
import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  DB_LOCKED_OPERATOR_DEAL_COLUMNS,
  SYSTEM_OWNED_DEAL_FIELDS,
} from "@/lib/marketplace/deal-status";

const MIGRATION_PATH = path.resolve(
  __dirname,
  "../../../../supabase/migrations/20261024000001_lock_system_owned_deal_columns.sql"
);

describe("S2 migration — lock system-owned deal columns", () => {
  const sql = readFileSync(MIGRATION_PATH, "utf8");

  it("adds BEFORE UPDATE triggers on operator_deals and legacy deals", () => {
    expect(sql).toContain("Security S2: Lock system-owned deal columns");
    expect(sql).toContain("enforce_operator_deal_system_columns");
    expect(sql).toContain("enforce_legacy_deal_system_columns");
    expect(sql).toContain(
      "marketplace_operator_deals_enforce_system_columns"
    );
    expect(sql).toContain("marketplace_deals_enforce_system_columns");
    expect(sql).toMatch(
      /BEFORE UPDATE ON marketplace\.operator_deals/
    );
    expect(sql).toMatch(/BEFORE UPDATE ON marketplace\.deals/);
  });

  it("allows only service_role / postgres / supabase_admin to change locked columns", () => {
    expect(sql).toContain(
      "current_user IN ('service_role', 'postgres', 'supabase_admin')"
    );
    expect(sql).toContain("ERRCODE = '42501'");
  });

  it("locks status, pause_*, and discount_verification on operator_deals", () => {
    for (const col of DB_LOCKED_OPERATOR_DEAL_COLUMNS) {
      expect(sql).toContain(col);
    }
    expect(sql).toMatch(
      /NEW\.status IS DISTINCT FROM OLD\.status[\s\S]*NEW\.pause_reason IS DISTINCT FROM OLD\.pause_reason[\s\S]*NEW\.pause_detail IS DISTINCT FROM OLD\.pause_detail[\s\S]*NEW\.discount_verification IS DISTINCT FROM OLD\.discount_verification/
    );
  });

  it("locks status on legacy marketplace.deals", () => {
    expect(sql).toContain(
      "marketplace.deals system-owned column (status) can only be changed by service_role"
    );
  });

  it("does not lock promo_code_confirmed_by_operator (operator attest path)", () => {
    expect(sql).toContain("promo_code_confirmed_by_operator");
    expect(sql).toMatch(/stays client-writable/i);
    expect(sql).not.toMatch(
      /NEW\.promo_code_confirmed_by_operator IS DISTINCT FROM OLD\.promo_code_confirmed_by_operator/
    );
  });

  it("documents service-role / SECURITY DEFINER persistence for transitions", () => {
    expect(sql).toMatch(/service-role client or a SECURITY DEFINER/i);
    expect(sql).toContain("transitionDeal");
  });
});

describe("S2 app constants align with DB lock list", () => {
  it("SYSTEM_OWNED_DEAL_FIELDS covers status and pause_* (camelCase)", () => {
    expect(SYSTEM_OWNED_DEAL_FIELDS).toEqual([
      "status",
      "pauseReason",
      "pauseDetail",
    ]);
  });

  it("DB_LOCKED_OPERATOR_DEAL_COLUMNS is the snake_case DB set", () => {
    expect([...DB_LOCKED_OPERATOR_DEAL_COLUMNS]).toEqual([
      "status",
      "pause_reason",
      "pause_detail",
      "discount_verification",
    ]);
  });
});
