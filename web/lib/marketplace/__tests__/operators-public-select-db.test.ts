/**
 * Security S8: narrow public SELECT on operators (no internal PII / tax IDs).
 */
import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  OPERATOR_INTERNAL_COLUMNS,
  OPERATOR_PUBLIC_COLUMNS,
  serializeOperatorPreview,
} from "@/lib/marketplace/operator-profile";
import { createOperator, createOperatorStore } from "@/lib/marketplace/operators";

const S8_MIGRATION_PATH = path.resolve(
  __dirname,
  "../../../../supabase/migrations/20261031000001_narrow_public_operators_select.sql"
);

const OPERATORS_MIGRATION_PATH = path.resolve(
  __dirname,
  "../../../../supabase/migrations/20261019000001_create_operators_tables.sql"
);

describe("S8 migration — narrow public operators SELECT", () => {
  const sql = readFileSync(S8_MIGRATION_PATH, "utf8");
  const createSql = readFileSync(OPERATORS_MIGRATION_PATH, "utf8");

  it("documents Security S8 and operators_public view", () => {
    expect(sql).toContain(
      "Security S8: Narrow public SELECT on operators (no internal PII / tax IDs)"
    );
    expect(sql).toContain("marketplace.operators_public");
    expect(sql).toMatch(/security_invoker\s*=\s*false/);
    expect(sql).toMatch(/Do not set security_invoker = true/);
  });

  it("creates operators_public with only OPERATOR_PUBLIC_COLUMNS", () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE VIEW marketplace\.operators_public AS/
    );
    expect(sql).toMatch(/WHERE account_status = 'active'/);

    for (const col of OPERATOR_PUBLIC_COLUMNS) {
      expect(sql).toContain(col);
    }
    for (const col of OPERATOR_INTERNAL_COLUMNS) {
      // Filter uses account_status; column must not appear in the SELECT list.
      if (col === "account_status") {
        const selectBlock = sql.match(
          /CREATE OR REPLACE VIEW marketplace\.operators_public AS([\s\S]*?)FROM marketplace\.operators/
        )?.[1];
        expect(selectBlock).toBeDefined();
        expect(selectBlock).not.toMatch(/\baccount_status\b/);
        continue;
      }
      expect(sql).not.toMatch(
        new RegExp(`CREATE OR REPLACE VIEW marketplace\\.operators_public AS[\\s\\S]*?\\b${col}\\b[\\s\\S]*?FROM marketplace\\.operators`)
      );
    }
  });

  it("grants SELECT on the public view to anon, authenticated, service_role", () => {
    expect(sql).toMatch(
      /GRANT SELECT ON marketplace\.operators_public TO anon, authenticated, service_role/
    );
  });

  it("drops the wide public SELECT policy on the base table", () => {
    expect(sql).toMatch(
      /DROP POLICY IF EXISTS "Public can view active operators"\s+ON marketplace\.operators/
    );
  });

  it("revokes anon SELECT on the base operators table", () => {
    expect(sql).toMatch(
      /REVOKE SELECT ON TABLE marketplace\.operators FROM PUBLIC, anon/
    );
    expect(sql).toMatch(
      /GRANT SELECT ON TABLE marketplace\.operators TO authenticated, service_role/
    );
  });

  it("create migration originally exposed full rows to anon", () => {
    expect(createSql).toContain(
      'CREATE POLICY "Public can view active operators"'
    );
    expect(createSql).toMatch(
      /GRANT SELECT ON marketplace\.operators TO anon, authenticated, service_role/
    );
    expect(createSql).toContain("internal_email");
    expect(createSql).toContain("gst_number");
    expect(createSql).toContain("nzbn");
  });
});

describe("S8 app preview serializer aligns with public view", () => {
  it("OPERATOR_PUBLIC_COLUMNS matches serializeOperatorPreview keys", () => {
    const store = createOperatorStore();
    const { operator } = createOperator(store, {
      legalName: "S8 Kayaks Limited",
      tradingName: "S8 Kayaks",
      slug: "s8-kayaks-public",
      internalEmail: "ops@s8.example",
      internalPhone: "+64210000000",
      gstNumber: "123-456-789",
      nzbn: "9429000000000",
      publicEmail: "hello@s8.example",
    });

    const preview = serializeOperatorPreview(operator);
    expect(Object.keys(preview).sort()).toEqual(
      [...OPERATOR_PUBLIC_COLUMNS].sort()
    );
    expect(preview.public_email).toBe("hello@s8.example");
    expect(preview).not.toHaveProperty("internal_email");
    expect(preview).not.toHaveProperty("gst_number");
    expect(preview).not.toHaveProperty("nzbn");
    expect(preview).not.toHaveProperty("legal_name");
    expect(preview).not.toHaveProperty("account_status");
  });

  it("OPERATOR_INTERNAL_COLUMNS lists PII / tax / admin fields S8 hides", () => {
    expect([...OPERATOR_INTERNAL_COLUMNS]).toEqual(
      expect.arrayContaining([
        "internal_email",
        "internal_phone",
        "gst_number",
        "nzbn",
        "legal_name",
        "account_status",
        "requires_manual_review",
      ])
    );
    for (const col of OPERATOR_INTERNAL_COLUMNS) {
      expect(OPERATOR_PUBLIC_COLUMNS).not.toContain(col);
    }
  });
});
