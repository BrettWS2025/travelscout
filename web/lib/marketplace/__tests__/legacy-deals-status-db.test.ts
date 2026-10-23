/**
 * Security S14: legacy marketplace.deals — no client-controlled status;
 * staff read-only writes; status via transition_legacy_deal_status RPC.
 */
import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { stripLegacyDealStatus } from "@/lib/marketplace/db";

const MIGRATION_PATH = path.resolve(
  __dirname,
  "../../../../supabase/migrations/20261035000001_legacy_deals_status_and_staff_write.sql"
);

describe("S14 migration — legacy deals status and staff write", () => {
  const sql = readFileSync(MIGRATION_PATH, "utf8");

  it("documents Security S14 and legacy feed deprecation", () => {
    expect(sql).toContain(
      "Security S14: Legacy deals — stop client-controlled status"
    );
    expect(sql).toMatch(/deprecated relative to[\s\S]*inventory/i);
  });

  it("forces INSERT status=draft for anon/authenticated", () => {
    expect(sql).toContain("enforce_legacy_deal_insert_status");
    expect(sql).toContain("marketplace_deals_enforce_insert_status");
    expect(sql).toMatch(/BEFORE INSERT ON marketplace\.deals/);
    expect(sql).toContain("NEW.status := 'draft'");
    expect(sql).toContain(
      "current_user IN ('service_role', 'postgres', 'supabase_admin')"
    );
  });

  it("restricts INSERT/UPDATE/DELETE to owner and admin (not staff)", () => {
    expect(sql).toContain(
      "Owners and admins can create deals for their organization"
    );
    expect(sql).toContain(
      "Owners and admins can update their organization deals"
    );
    expect(sql).toContain(
      "Owners and admins can delete their organization deals"
    );
    expect(sql).toMatch(/m\.role IN \('owner', 'admin'\)/);
    expect(sql).toContain(
      'DROP POLICY IF EXISTS "Members can create deals for their organization"'
    );
    expect(sql).toContain(
      'DROP POLICY IF EXISTS "Members can update their organization deals"'
    );
    expect(sql).toContain(
      'DROP POLICY IF EXISTS "Members can delete their organization deals"'
    );
  });

  it("adds SECURITY DEFINER transition_legacy_deal_status for owner/admin", () => {
    expect(sql).toContain("public.transition_legacy_deal_status");
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toContain(
      "Only organization owners and admins may change deal status"
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.transition_legacy_deal_status\(UUID, TEXT\)\s+TO authenticated, service_role/
    );
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.transition_legacy_deal_status\(UUID, TEXT\) FROM anon/
    );
  });

  it("keeps member SELECT (staff remain read-only readers)", () => {
    expect(sql).toMatch(/SELECT policies unchanged/i);
    expect(sql).toMatch(/Staff are read-only/i);
  });
});

describe("S14 app helpers — strip legacy status", () => {
  it("stripLegacyDealStatus removes status and keeps other fields", () => {
    const stripped = stripLegacyDealStatus({
      title: "Half-price jetboat",
      status: "live" as const,
      dealPrice: 99,
      bookingUrl: "https://book.example",
    });
    expect(stripped).toEqual({
      title: "Half-price jetboat",
      dealPrice: 99,
      bookingUrl: "https://book.example",
    });
    expect("status" in stripped).toBe(false);
  });
});
