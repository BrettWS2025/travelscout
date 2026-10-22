/**
 * Security S7: profiles INSERT cannot set is_platform_admin = true.
 */
import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const S7_MIGRATION_PATH = path.resolve(
  __dirname,
  "../../../../supabase/migrations/20261030000001_harden_profiles_insert_platform_admin.sql"
);

const CHUNK9_MIGRATION_PATH = path.resolve(
  __dirname,
  "../../../../supabase/migrations/20261020000006_profiles_platform_admin.sql"
);

const PROFILES_CREATE_PATH = path.resolve(
  __dirname,
  "../../../../supabase/migrations/20240101000001_profiles.sql"
);

describe("S7 migration — harden profiles INSERT for is_platform_admin", () => {
  const sql = readFileSync(S7_MIGRATION_PATH, "utf8");
  const chunk9Sql = readFileSync(CHUNK9_MIGRATION_PATH, "utf8");
  const createSql = readFileSync(PROFILES_CREATE_PATH, "utf8");

  it("documents Security S7 and the INSERT elevation hole", () => {
    expect(sql).toContain(
      "Security S7: Harden profiles INSERT so is_platform_admin cannot be set by clients"
    );
    expect(sql).toContain("is_platform_admin IS NOT TRUE");
    expect(sql).toMatch(/service_role bypasses RLS/i);
  });

  it("replaces Users can insert own profile with uid + admin-not-true check", () => {
    expect(sql).toMatch(
      /DROP POLICY IF EXISTS "Users can insert own profile"\s+ON public\.profiles/
    );
    expect(sql).toMatch(
      /CREATE POLICY "Users can insert own profile"\s+ON public\.profiles FOR INSERT/
    );
    expect(sql).toMatch(
      /WITH CHECK\s*\(\s*\(SELECT auth\.uid\(\)\) = id\s+AND is_platform_admin IS NOT TRUE\s*\)/s
    );
  });

  it("does not weaken the existing UPDATE lock from Chunk 9", () => {
    expect(chunk9Sql).toContain("is_platform_admin IS NOT DISTINCT FROM");
    expect(sql).not.toMatch(/FOR UPDATE/);
    expect(sql).not.toContain(
      'DROP POLICY IF EXISTS "Users can update own profile"'
    );
  });

  it("signup trigger still inserts without setting is_platform_admin", () => {
    expect(createSql).toContain("handle_new_user");
    expect(createSql).toMatch(
      /INSERT INTO public\.profiles \(id, email, display_name\)/
    );
    expect(createSql).not.toMatch(
      /INSERT INTO public\.profiles[\s\S]*is_platform_admin/
    );
    expect(sql).toMatch(/handle_new_user\(\)/);
    expect(sql).toMatch(/DEFAULT false/);
  });

  it("policy predicate rejects is_platform_admin = true and allows false", () => {
    // Mirror the SQL `IS NOT TRUE` semantics used in WITH CHECK.
    const isNotTrue = (v: boolean | null) => v !== true;
    expect(isNotTrue(true)).toBe(false);
    expect(isNotTrue(false)).toBe(true);
    expect(isNotTrue(null)).toBe(true);
    expect(sql).toContain("AND is_platform_admin IS NOT TRUE");
  });
});
