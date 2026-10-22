import { readFileSync } from "fs";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  businessDetailsFromUserMetadata,
  ensureOperatorOrganization,
  isOperatorAccountMetadata,
  normalizeOperatorBusinessDetails,
  operatorSignupUserMetadata,
} from "@/lib/marketplace/operator-signup";

const listMyOrganizations = vi.fn();
const createOrganization = vi.fn();

vi.mock("@/lib/marketplace/client", () => ({
  listMyOrganizations: (...args: unknown[]) => listMyOrganizations(...args),
  createOrganization: (...args: unknown[]) => createOrganization(...args),
}));

vi.mock("@/lib/regions", () => ({
  canonicalizeRegion: (region: string) => {
    const map: Record<string, string> = {
      Otago: "Otago",
      otago: "Otago",
      Auckland: "Auckland",
    };
    return map[region] ?? null;
  },
}));

const MIGRATION_PATH = path.resolve(
  __dirname,
  "../../../../supabase/migrations/20261025000001_bootstrap_operator_org_on_signup.sql"
);

describe("operator signup metadata", () => {
  it("builds auth metadata for the DB bootstrap trigger", () => {
    expect(
      operatorSignupUserMetadata("Ada Operator", {
        name: "Jetboat Co",
        phone: "+64 21 000 0000",
        website: "https://example.com",
        region: "Otago",
      })
    ).toEqual({
      full_name: "Ada Operator",
      account_type: "operator",
      business_name: "Jetboat Co",
      business_phone: "+64 21 000 0000",
      business_website: "https://example.com",
      business_region: "Otago",
    });
  });

  it("ignores traveler metadata", () => {
    expect(isOperatorAccountMetadata({ full_name: "Traveler" })).toBe(false);
    expect(businessDetailsFromUserMetadata({ full_name: "Traveler" })).toBeNull();
  });

  it("reads business details from operator metadata", () => {
    expect(
      businessDetailsFromUserMetadata({
        account_type: "operator",
        business_name: "Jetboat Co",
        business_phone: "+64 21 000 0000",
        business_website: "https://example.com",
        business_region: "otago",
      })
    ).toEqual({
      name: "Jetboat Co",
      phone: "+64 21 000 0000",
      website: "https://example.com",
      region: "Otago",
    });
  });

  it("rejects incomplete or invalid business payloads", () => {
    expect(
      normalizeOperatorBusinessDetails({
        name: "Jetboat Co",
        phone: "+64 21 000 0000",
        website: "https://example.com",
        region: "Queenstown",
      })
    ).toBeNull();
  });
});

describe("ensureOperatorOrganization", () => {
  beforeEach(() => {
    listMyOrganizations.mockReset();
    createOrganization.mockReset();
  });

  it("returns an existing organisation without creating another", async () => {
    listMyOrganizations.mockResolvedValue({
      organizations: [{ id: "o1", name: "Jetboat Co" }],
    });

    const org = await ensureOperatorOrganization("tok", {
      business: {
        name: "Other Co",
        phone: "+64 21 111 1111",
        website: "https://other.example",
        region: "Auckland",
      },
    });

    expect(org).toEqual({ id: "o1", name: "Jetboat Co" });
    expect(createOrganization).not.toHaveBeenCalled();
  });

  it("creates from signup metadata when the user has no org yet", async () => {
    listMyOrganizations.mockResolvedValue({ organizations: [] });
    createOrganization.mockResolvedValue({
      organization: { id: "o2", name: "Jetboat Co" },
    });

    const org = await ensureOperatorOrganization("tok", {
      userMetadata: {
        account_type: "operator",
        business_name: "Jetboat Co",
        business_phone: "+64 21 000 0000",
        business_website: "https://example.com",
        business_region: "Otago",
      },
    });

    expect(createOrganization).toHaveBeenCalledWith(
      {
        name: "Jetboat Co",
        phone: "+64 21 000 0000",
        website: "https://example.com",
        region: "Otago",
      },
      "tok"
    );
    expect(org).toEqual({ id: "o2", name: "Jetboat Co" });
  });

  it("does not create an org for traveler accounts", async () => {
    listMyOrganizations.mockResolvedValue({ organizations: [] });

    const org = await ensureOperatorOrganization("tok", {
      userMetadata: { full_name: "Traveler" },
    });

    expect(org).toBeNull();
    expect(createOrganization).not.toHaveBeenCalled();
  });
});

describe("operator org bootstrap migration", () => {
  it("creates an auth.users trigger that bootstraps from operator metadata", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf8");

    expect(sql).toContain("marketplace.bootstrap_organization_for_user");
    expect(sql).toContain("bootstrap_operator_organization_from_signup");
    expect(sql).toContain("on_auth_user_created_operator_org");
    expect(sql).toContain("account_type");
    expect(sql).toContain("business_name");
    expect(sql).toContain("business_phone");
    expect(sql).toContain("business_website");
    expect(sql).toContain("business_region");
    expect(sql).toContain("REVOKE ALL ON FUNCTION marketplace.bootstrap_organization_for_user");
    expect(sql).toContain("FROM anon, authenticated");
  });
});
