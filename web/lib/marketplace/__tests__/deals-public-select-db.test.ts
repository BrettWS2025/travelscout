/**
 * Security S9: narrow public SELECT on live deals (hide promo codes / internals).
 */
import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  DEAL_PRICE_OPTION_INTERNAL_COLUMNS,
  DEAL_PRICE_OPTION_PUBLIC_COLUMNS,
  DISCOUNT_STEP_INTERNAL_COLUMNS,
  DISCOUNT_STEP_PUBLIC_COLUMNS,
  OPERATOR_DEAL_INTERNAL_COLUMNS,
  OPERATOR_DEAL_PUBLIC_COLUMNS,
} from "@/lib/marketplace/deal-public";

const S9_MIGRATION_PATH = path.resolve(
  __dirname,
  "../../../../supabase/migrations/20261032000001_narrow_public_deals_select.sql"
);

const DEALS_CREATE_PATH = path.resolve(
  __dirname,
  "../../../../supabase/migrations/20261019000002_create_deals_table.sql"
);

const CHILDREN_CREATE_PATH = path.resolve(
  __dirname,
  "../../../../supabase/migrations/20261020000001_create_deal_sessions_price_options.sql"
);

function viewSelectBlock(sql: string, viewName: string): string {
  const re = new RegExp(
    `CREATE OR REPLACE VIEW marketplace\\.${viewName} AS([\\s\\S]*?)FROM marketplace\\.`,
    "m"
  );
  const block = sql.match(re)?.[1];
  expect(block).toBeDefined();
  return block!;
}

describe("S9 migration — narrow public deals SELECT", () => {
  const sql = readFileSync(S9_MIGRATION_PATH, "utf8");
  const dealsCreateSql = readFileSync(DEALS_CREATE_PATH, "utf8");
  const childrenCreateSql = readFileSync(CHILDREN_CREATE_PATH, "utf8");

  it("documents Security S9 and public views", () => {
    expect(sql).toContain(
      "Security S9: Narrow public SELECT on live deals (hide promo codes / internals)"
    );
    expect(sql).toContain("marketplace.operator_deals_public");
    expect(sql).toContain("marketplace.deal_price_options_public");
    expect(sql).toContain("marketplace.discount_steps_public");
    expect(sql).toMatch(/security_invoker\s*=\s*false/);
    expect(sql).toMatch(/Do not set security_invoker = true/);
  });

  it("creates operator_deals_public with only OPERATOR_DEAL_PUBLIC_COLUMNS", () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE VIEW marketplace\.operator_deals_public AS/
    );
    expect(sql).toMatch(
      /FROM marketplace\.operator_deals\s+WHERE status = 'live'/
    );

    const selectBlock = viewSelectBlock(sql, "operator_deals_public");
    for (const col of OPERATOR_DEAL_PUBLIC_COLUMNS) {
      expect(selectBlock).toMatch(new RegExp(`\\b${col}\\b`));
    }
    for (const col of OPERATOR_DEAL_INTERNAL_COLUMNS) {
      expect(selectBlock).not.toMatch(new RegExp(`\\b${col}\\b`));
    }
    expect(selectBlock).not.toMatch(/\bpromo_code\b/);
  });

  it("creates deal_price_options_public without external option ids", () => {
    const selectBlock = viewSelectBlock(sql, "deal_price_options_public");
    for (const col of DEAL_PRICE_OPTION_PUBLIC_COLUMNS) {
      expect(selectBlock).toMatch(new RegExp(`\\b${col}\\b`));
    }
    for (const col of DEAL_PRICE_OPTION_INTERNAL_COLUMNS) {
      expect(selectBlock).not.toMatch(new RegExp(`\\b${col}\\b`));
    }
  });

  it("creates discount_steps_public without promo_code", () => {
    const selectBlock = viewSelectBlock(sql, "discount_steps_public");
    for (const col of DISCOUNT_STEP_PUBLIC_COLUMNS) {
      expect(selectBlock).toMatch(new RegExp(`\\b${col}\\b`));
    }
    for (const col of DISCOUNT_STEP_INTERNAL_COLUMNS) {
      expect(selectBlock).not.toMatch(new RegExp(`\\b${col}\\b`));
    }
    expect(selectBlock).not.toMatch(/\bpromo_code\b/);
  });

  it("grants SELECT on public views to anon, authenticated, service_role", () => {
    expect(sql).toMatch(
      /GRANT SELECT ON marketplace\.operator_deals_public TO anon, authenticated, service_role/
    );
    expect(sql).toMatch(
      /GRANT SELECT ON marketplace\.deal_price_options_public TO anon, authenticated, service_role/
    );
    expect(sql).toMatch(
      /GRANT SELECT ON marketplace\.discount_steps_public TO anon, authenticated, service_role/
    );
  });

  it("drops wide public SELECT policies on sensitive base tables", () => {
    expect(sql).toMatch(
      /DROP POLICY IF EXISTS "Public can view live deals"\s+ON marketplace\.operator_deals/
    );
    expect(sql).toMatch(
      /DROP POLICY IF EXISTS "Public can view price options for live deals"\s+ON marketplace\.deal_price_options/
    );
    expect(sql).toMatch(
      /DROP POLICY IF EXISTS "Public can view discount steps for live deals"\s+ON marketplace\.discount_steps/
    );
  });

  it("revokes anon SELECT on sensitive base tables", () => {
    expect(sql).toMatch(
      /REVOKE SELECT ON TABLE marketplace\.operator_deals FROM PUBLIC, anon/
    );
    expect(sql).toMatch(
      /REVOKE SELECT ON TABLE marketplace\.deal_price_options FROM PUBLIC, anon/
    );
    expect(sql).toMatch(
      /REVOKE SELECT ON TABLE marketplace\.discount_steps FROM PUBLIC, anon/
    );
    expect(sql).toMatch(
      /GRANT SELECT ON TABLE marketplace\.operator_deals TO authenticated, service_role/
    );
    expect(sql).toMatch(
      /GRANT SELECT ON TABLE marketplace\.deal_price_options TO authenticated, service_role/
    );
    expect(sql).toMatch(
      /GRANT SELECT ON TABLE marketplace\.discount_steps TO authenticated, service_role/
    );
  });

  it("adds SECURITY DEFINER is_live_operator_deal for sessions/media public RLS", () => {
    expect(sql).toContain("marketplace.is_live_operator_deal");
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION marketplace\.is_live_operator_deal\(UUID\)\s+TO anon, authenticated, service_role/
    );
    expect(sql).toMatch(
      /USING \(marketplace\.is_live_operator_deal\(deal_id\)\)/
    );
  });

  it("create migrations originally exposed full rows / promo_code to anon", () => {
    expect(dealsCreateSql).toContain('CREATE POLICY "Public can view live deals"');
    expect(dealsCreateSql).toMatch(
      /GRANT SELECT ON marketplace\.operator_deals TO anon, authenticated, service_role/
    );
    expect(dealsCreateSql).toContain("promo_code");
    expect(childrenCreateSql).toContain(
      'CREATE POLICY "Public can view discount steps for live deals"'
    );
    expect(childrenCreateSql).toMatch(
      /GRANT SELECT ON marketplace\.discount_steps\s+TO anon, authenticated, service_role/
    );
  });
});

describe("S9 column constants — promo and internals stay off public lists", () => {
  it("OPERATOR_DEAL_PUBLIC_COLUMNS never includes promo or internal fields", () => {
    expect(OPERATOR_DEAL_PUBLIC_COLUMNS).not.toContain("promo_code");
    for (const col of OPERATOR_DEAL_INTERNAL_COLUMNS) {
      expect(OPERATOR_DEAL_PUBLIC_COLUMNS).not.toContain(col);
    }
  });

  it("DISCOUNT_STEP_PUBLIC_COLUMNS never includes promo_code", () => {
    expect(DISCOUNT_STEP_PUBLIC_COLUMNS).not.toContain("promo_code");
    expect(DISCOUNT_STEP_INTERNAL_COLUMNS).toEqual(
      expect.arrayContaining(["promo_code", "external_deal_price_option_id"])
    );
  });

  it("DEAL_PRICE_OPTION_PUBLIC_COLUMNS omits provider external ids", () => {
    expect(DEAL_PRICE_OPTION_PUBLIC_COLUMNS).not.toContain(
      "external_price_option_id"
    );
    expect(DEAL_PRICE_OPTION_PUBLIC_COLUMNS).not.toContain(
      "external_deal_price_option_id"
    );
  });
});
