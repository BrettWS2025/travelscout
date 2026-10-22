/**
 * Security S4: token / reminder tables — RLS on, no client access.
 */
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const MIGRATION_PATH = path.resolve(
  __dirname,
  "../../../../supabase/migrations/20261027000001_enable_rls_token_reminder_tables.sql"
);

const TOKEN_TABLES = [
  "marketplace.quick_update_tokens",
  "marketplace.attestation_reminders",
  "marketplace.team_invite_tokens",
] as const;

const WEB_LIB_MARKETPLACE = path.resolve(__dirname, "..");

describe("S4 migration — enable RLS on token / reminder tables", () => {
  const sql = readFileSync(MIGRATION_PATH, "utf8");

  it("documents Security S4 and the encrypted_secrets fail-closed pattern", () => {
    expect(sql).toContain(
      "Security S4: Enable RLS on token / reminder tables (fail closed)"
    );
    expect(sql).toMatch(/same as marketplace\.encrypted_secrets/i);
    expect(sql).toMatch(/service-role client/i);
    expect(sql).toMatch(/never the anon key/i);
  });

  it("enables RLS on all three tables", () => {
    for (const table of TOKEN_TABLES) {
      expect(sql).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    }
  });

  it("does not add client policies for anon or authenticated", () => {
    expect(sql).not.toMatch(/CREATE POLICY/i);
    expect(sql).toMatch(/no policies for anon \/ authenticated/i);
  });

  it("revokes ALL from PUBLIC, anon, and authenticated on each table", () => {
    for (const table of TOKEN_TABLES) {
      expect(sql).toMatch(
        new RegExp(
          `REVOKE ALL ON TABLE ${table.replace(/\./g, "\\.")}\\s+FROM PUBLIC, anon, authenticated`,
          "s"
        )
      );
    }
  });

  it("grants ALL to service_role on each table", () => {
    for (const table of TOKEN_TABLES) {
      expect(sql).toContain(`GRANT ALL ON TABLE ${table} TO service_role`);
    }
  });

  it("updates table comments to document service_role-only access", () => {
    expect(sql).toContain("security S4");
    expect(sql).toMatch(/service_role only \(no client policies\)/);
  });
});

describe("S4 app paths stay server-only (in-memory today)", () => {
  it("does not query token tables via supabase-js from marketplace lib", () => {
    const files = listTsFiles(WEB_LIB_MARKETPLACE);
    const offenders: string[] = [];

    for (const file of files) {
      if (file.includes(`${path.sep}__tests__${path.sep}`)) continue;
      const src = readFileSync(file, "utf8");
      // Direct PostgREST table access would look like .from("quick_update_tokens")
      // or .from('attestation_reminders') / team_invite_tokens.
      if (
        /\.from\(\s*['"]quick_update_tokens['"]\s*\)/.test(src) ||
        /\.from\(\s*['"]attestation_reminders['"]\s*\)/.test(src) ||
        /\.from\(\s*['"]team_invite_tokens['"]\s*\)/.test(src) ||
        /\.from\(\s*['"]marketplace\.quick_update_tokens['"]\s*\)/.test(src) ||
        /\.from\(\s*['"]marketplace\.attestation_reminders['"]\s*\)/.test(src) ||
        /\.from\(\s*['"]marketplace\.team_invite_tokens['"]\s*\)/.test(src)
      ) {
        offenders.push(path.relative(WEB_LIB_MARKETPLACE, file));
      }
    }

    expect(offenders).toEqual([]);
  });

  it("deal-attestation and team keep in-memory token maps", () => {
    const attestation = readFileSync(
      path.join(WEB_LIB_MARKETPLACE, "deal-attestation.ts"),
      "utf8"
    );
    const team = readFileSync(path.join(WEB_LIB_MARKETPLACE, "team.ts"), "utf8");

    expect(attestation).toContain("quickUpdateTokens: Map");
    expect(attestation).toContain("attestationReminders: Map");
    expect(attestation).toContain("ensureAttestationMaps");
    expect(team).toContain("ensureTeamInviteTokenMap");
    expect(team).toContain("teamInviteTokens");
  });
});

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, name.name);
    if (name.isDirectory()) {
      out.push(...listTsFiles(full));
    } else if (name.name.endsWith(".ts") || name.name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}
