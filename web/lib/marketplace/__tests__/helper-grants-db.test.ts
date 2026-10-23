/**
 * Security S18: tighten unnecessary GRANTs and SECURITY DEFINER EXECUTE.
 */
import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const S18_MIGRATION_PATH = path.resolve(
  __dirname,
  "../../../../supabase/migrations/20261036000001_tighten_helper_and_audit_grants.sql"
);

const MEMBERSHIP_HELPERS = [
  "marketplace.is_operator_member(UUID)",
  "marketplace.is_operator_owner_or_manager(UUID)",
  "marketplace.is_operator_owner(UUID)",
] as const;

const OPERATOR_ID_HELPERS = [
  "marketplace.operator_id_for_deal(UUID)",
  "marketplace.operator_id_for_integration(UUID)",
  "marketplace.operator_id_for_external_product(UUID)",
] as const;

/** Intentional anon EXECUTE — required for public deal child RLS / views. */
const INTENTIONAL_ANON_EXECUTE = [
  "marketplace.is_visible_to_travellers",
  "marketplace.is_live_operator_deal",
] as const;

describe("S18 migration — tighten helper and audit grants", () => {
  const sql = readFileSync(S18_MIGRATION_PATH, "utf8");

  it("documents Security S18 and least-privilege intent", () => {
    expect(sql).toContain(
      "Security S18: Tighten unnecessary GRANTs and SECURITY DEFINER EXECUTE"
    );
    expect(sql).toMatch(/least privilege/i);
    expect(sql).toMatch(/no anon RPC probing/i);
  });

  it("documents intentional anon grants that must remain", () => {
    expect(sql).toMatch(/Intentional anon grants/i);
    for (const name of INTENTIONAL_ANON_EXECUTE) {
      expect(sql).toContain(name);
    }
    expect(sql).toContain("operators_public");
    expect(sql).toContain("operator_deals_public");
    expect(sql).toContain("deal_price_options_public");
    expect(sql).toContain("discount_steps_public");
  });

  it("revokes membership helper EXECUTE from PUBLIC and anon", () => {
    for (const fn of MEMBERSHIP_HELPERS) {
      const escaped = fn.replace(/\(/g, "\\(").replace(/\)/g, "\\)");
      expect(sql).toMatch(
        new RegExp(`REVOKE ALL ON FUNCTION ${escaped}\\s+FROM PUBLIC`, "s")
      );
      expect(sql).toMatch(
        new RegExp(`REVOKE ALL ON FUNCTION ${escaped}\\s+FROM anon`, "s")
      );
      expect(sql).toMatch(
        new RegExp(
          `GRANT EXECUTE ON FUNCTION ${escaped}\\s+TO authenticated, service_role`,
          "s"
        )
      );
    }
  });

  it("revokes operator_id_for_* EXECUTE from PUBLIC and anon", () => {
    for (const fn of OPERATOR_ID_HELPERS) {
      const escaped = fn.replace(/\(/g, "\\(").replace(/\)/g, "\\)");
      expect(sql).toMatch(
        new RegExp(`REVOKE ALL ON FUNCTION ${escaped}\\s+FROM PUBLIC`, "s")
      );
      expect(sql).toMatch(
        new RegExp(`REVOKE ALL ON FUNCTION ${escaped}\\s+FROM anon`, "s")
      );
      expect(sql).toMatch(
        new RegExp(
          `GRANT EXECUTE ON FUNCTION ${escaped}\\s+TO authenticated, service_role`,
          "s"
        )
      );
    }
  });

  it("does not grant membership or operator_id helpers to anon", () => {
    const grantStatements = sql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => /^GRANT\b/i.test(s));

    const helperGrants = grantStatements.filter(
      (s) =>
        /is_operator_member|is_operator_owner|operator_id_for_/i.test(s)
    );

    expect(helperGrants.length).toBeGreaterThan(0);
    for (const g of helperGrants) {
      expect(g).not.toMatch(/\banon\b/);
      expect(g).toMatch(/\bauthenticated\b/);
      expect(g).toMatch(/\bservice_role\b/);
    }
  });

  it("revokes anon SELECT on deal_events and keeps authenticated/service_role", () => {
    expect(sql).toMatch(
      /REVOKE SELECT ON TABLE marketplace\.deal_events\s+FROM PUBLIC, anon/s
    );
    expect(sql).toMatch(
      /GRANT SELECT, INSERT ON TABLE marketplace\.deal_events\s+TO authenticated, service_role/s
    );
  });

  it("revokes anon INSERT on click_events and keeps authenticated/service_role", () => {
    expect(sql).toMatch(
      /REVOKE INSERT ON TABLE marketplace\.click_events\s+FROM PUBLIC, anon/s
    );
    expect(sql).toMatch(
      /GRANT SELECT ON TABLE marketplace\.click_events\s+TO authenticated, service_role/s
    );
    expect(sql).toMatch(
      /GRANT INSERT ON TABLE marketplace\.click_events\s+TO authenticated, service_role/s
    );

    const grantStatements = sql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => /^GRANT\b/i.test(s) && /click_events/i.test(s));

    for (const g of grantStatements) {
      expect(g).not.toMatch(/\banon\b/);
    }
  });

  it("does not revoke intentional public visibility helpers", () => {
    const withoutLineComments = sql
      .split("\n")
      .map((line) => line.replace(/--.*$/, ""))
      .join("\n");
    const revokeStatements = withoutLineComments
      .split(";")
      .map((s) => s.trim())
      .filter((s) => /^REVOKE\b/i.test(s));

    expect(revokeStatements.length).toBeGreaterThan(0);
    for (const stmt of revokeStatements) {
      expect(stmt).not.toMatch(/is_visible_to_travellers/i);
      expect(stmt).not.toMatch(/is_live_operator_deal/i);
    }
  });
});
