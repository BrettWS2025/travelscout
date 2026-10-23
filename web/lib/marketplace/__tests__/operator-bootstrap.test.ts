import { readFileSync } from "fs";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hydrateOperatorIntoHttpStore,
  operatorFromDbRow,
  resolveOperatorsForUser,
  teamMemberFromDbRow,
  type DbOperatorRow,
  type DbTeamMemberRow,
} from "@/lib/marketplace/operator-bootstrap";
import {
  getDealDraftHttpStore,
  setDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import { DEV_SEED_IDS } from "@/lib/marketplace/seed-dev";

const MIGRATION_PATH = path.resolve(
  __dirname,
  "../../../../supabase/migrations/20261037000001_bootstrap_operator_on_signup.sql"
);

afterEach(() => {
  setDealDraftHttpStore(null);
  vi.unstubAllEnvs();
});

describe("operator inventory bootstrap migration", () => {
  it("adds bootstrap_operator_for_user + create_marketplace_operator RPC", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf8");
    expect(sql).toContain("marketplace.bootstrap_operator_for_user");
    expect(sql).toContain("public.create_marketplace_operator");
    expect(sql).toContain("INSERT INTO marketplace.operators");
    expect(sql).toContain("INSERT INTO marketplace.team_members");
    expect(sql).toContain("invite_status");
    expect(sql).toContain("'owner'");
    expect(sql).toContain("REVOKE ALL ON FUNCTION marketplace.bootstrap_operator_for_user");
    expect(sql).toContain("FROM anon, authenticated");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.create_marketplace_operator");
    expect(sql).toContain("bootstrap_operator_organization_from_signup");
  });

  it("signup trigger bootstraps both organisation and inventory operator", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf8");
    expect(sql).toContain("marketplace.bootstrap_organization_for_user");
    expect(sql).toContain("marketplace.bootstrap_operator_for_user");
    expect(sql).toContain("account_type");
    expect(sql).toContain("business_name");
  });
});

describe("hydrateOperatorIntoHttpStore", () => {
  it("makes inventory APIs recognise a DB-backed operator", () => {
    const operator = operatorFromDbRow({
      id: "c3000000-0000-4000-8000-000000000001",
      legal_name: "Jetboat Co",
      trading_name: "Jetboat Co",
      slug: "jetboat-co",
      logo: null,
      cover_image: null,
      short_description: null,
      long_description: null,
      website: "https://example.com",
      public_email: null,
      public_phone: "+64210000000",
      internal_email: null,
      internal_phone: null,
      address: null,
      regions_served: ["Otago"],
      timezone: "Pacific/Auckland",
      currency: "NZD",
      languages: ["en"],
      gst_number: null,
      nzbn: null,
      social_links: {},
      account_status: "pending_verification",
      requires_manual_review: false,
      created_at: "2026-10-23T00:00:00.000Z",
      updated_at: "2026-10-23T00:00:00.000Z",
    } satisfies DbOperatorRow);

    const member = teamMemberFromDbRow({
      id: "c3000000-0000-4000-8000-000000000021",
      operator_id: operator.id,
      user_id: "c3000000-0000-4000-8000-000000000011",
      role: "owner",
      invited_email: "owner@jetboat.example",
      invite_status: "accepted",
      invited_at: "2026-10-23T00:00:00.000Z",
      last_active_at: null,
      created_at: "2026-10-23T00:00:00.000Z",
      updated_at: "2026-10-23T00:00:00.000Z",
    } satisfies DbTeamMemberRow);

    hydrateOperatorIntoHttpStore({ operator, member });

    const store = getDealDraftHttpStore();
    expect(store.operators.operators.get(operator.id)?.tradingName).toBe(
      "Jetboat Co"
    );
    expect(store.operators.bookingDefaults.has(operator.id)).toBe(true);
    expect(
      [...store.operators.teamMembers.values()].some(
        (m) => m.operatorId === operator.id && m.userId === member.userId
      )
    ).toBe(true);
  });
});

describe("resolveOperatorsForUser", () => {
  it("falls back to in-memory seed operators when Supabase env is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    const ops = await resolveOperatorsForUser(
      "tok",
      "unknown-auth-id",
      "manager@harbour-kayaks.dev"
    );
    expect(ops.some((o) => o.id === DEV_SEED_IDS.harbourKayaks.operatorId)).toBe(
      true
    );
  });
});
