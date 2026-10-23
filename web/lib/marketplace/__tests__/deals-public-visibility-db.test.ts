/**
 * Security S10: public deal views/RLS match fail-closed isVisibleToTravellers.
 */
import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { PLATFORM_DEFAULTS } from "@/lib/marketplace/config";
import {
  OPERATOR_DEAL_INTERNAL_COLUMNS,
  OPERATOR_DEAL_PUBLIC_COLUMNS,
  PUBLIC_DEAL_VISIBILITY_MAX_LEAD_HOURS,
} from "@/lib/marketplace/deal-public";

const S10_MIGRATION_PATH = path.resolve(
  __dirname,
  "../../../../supabase/migrations/20261033000001_align_public_deal_visibility.sql"
);

const S9_MIGRATION_PATH = path.resolve(
  __dirname,
  "../../../../supabase/migrations/20261032000001_narrow_public_deals_select.sql"
);

function viewSelectBlock(sql: string, viewName: string): string {
  const re = new RegExp(
    `CREATE OR REPLACE VIEW marketplace\\.${viewName} AS([\\s\\S]*?)(?:FROM marketplace\\.|WHERE marketplace\\.)`,
    "m"
  );
  const block = sql.match(re)?.[1];
  expect(block).toBeDefined();
  return block!;
}

describe("S10 migration — public deal visibility aligns with isVisibleToTravellers", () => {
  const sql = readFileSync(S10_MIGRATION_PATH, "utf8");
  const s9Sql = readFileSync(S9_MIGRATION_PATH, "utf8");

  it("documents Security S10 and depends on S9 public views", () => {
    expect(sql).toContain(
      "Security S10: Align public deal RLS / views with fail-closed traveller visibility"
    );
    expect(sql).toContain("isVisibleToTravellers");
    expect(s9Sql).toContain("marketplace.operator_deals_public");
  });

  it("creates is_visible_to_travellers with live + cutoff + MAX_LEAD_HOURS window", () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION marketplace\.is_visible_to_travellers\(p_deal_id UUID\)/
    );
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/d\.status = 'live'/);
    expect(sql).toMatch(/d\.sales_cutoff_minutes IS NOT NULL/);
    expect(sql).toMatch(
      /\(s\.start_at - \(d\.sales_cutoff_minutes \* INTERVAL '1 minute'\)\) > NOW\(\)/
    );
    expect(sql).toMatch(
      new RegExp(
        `s\\.start_at <= NOW\\(\\) \\+ INTERVAL '${PUBLIC_DEAL_VISIBILITY_MAX_LEAD_HOURS} hours'`
      )
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION marketplace\.is_visible_to_travellers\(UUID\)\s+TO anon, authenticated, service_role/
    );
  });

  it("PUBLIC_DEAL_VISIBILITY_MAX_LEAD_HOURS matches PLATFORM_DEFAULTS.MAX_LEAD_HOURS", () => {
    expect(PUBLIC_DEAL_VISIBILITY_MAX_LEAD_HOURS).toBe(
      PLATFORM_DEFAULTS.MAX_LEAD_HOURS
    );
    expect(PUBLIC_DEAL_VISIBILITY_MAX_LEAD_HOURS).toBe(72);
  });

  it("is_live_operator_deal delegates to is_visible_to_travellers", () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION marketplace\.is_live_operator_deal\(p_deal_id UUID\)/
    );
    expect(sql).toMatch(
      /SELECT marketplace\.is_visible_to_travellers\(p_deal_id\);/
    );
  });

  it("recreates public views filtered by is_visible_to_travellers (not status=live alone)", () => {
    expect(sql).toMatch(
      /FROM marketplace\.operator_deals d\s+WHERE marketplace\.is_visible_to_travellers\(d\.id\)/
    );
    expect(sql).toMatch(
      /WHERE marketplace\.is_visible_to_travellers\(p\.deal_id\)/
    );
    expect(sql).toMatch(
      /WHERE marketplace\.is_visible_to_travellers\(s\.deal_id\)/
    );
    // Must not keep the S9-only filter as the sole predicate on the deal view.
    expect(sql).not.toMatch(
      /FROM marketplace\.operator_deals\s+WHERE status = 'live'/
    );
  });

  it("operator_deals_public still exposes only OPERATOR_DEAL_PUBLIC_COLUMNS", () => {
    const selectBlock = viewSelectBlock(sql, "operator_deals_public");
    for (const col of OPERATOR_DEAL_PUBLIC_COLUMNS) {
      expect(selectBlock).toMatch(new RegExp(`\\b${col}\\b`));
    }
    for (const col of OPERATOR_DEAL_INTERNAL_COLUMNS) {
      expect(selectBlock).not.toMatch(new RegExp(`\\b${col}\\b`));
    }
    expect(selectBlock).not.toMatch(/\bpromo_code\b/);
  });

  it("sessions and media public policies use is_visible_to_travellers", () => {
    expect(sql).toMatch(
      /CREATE POLICY "Public can view sessions for live deals"\s+ON marketplace\.deal_sessions FOR SELECT\s+USING \(marketplace\.is_visible_to_travellers\(deal_id\)\)/
    );
    expect(sql).toMatch(
      /CREATE POLICY "Public can view media for live deals"\s+ON marketplace\.deal_media FOR SELECT\s+USING \(marketplace\.is_visible_to_travellers\(deal_id\)\)/
    );
  });

  it("re-grants SELECT on public views to anon", () => {
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
});
