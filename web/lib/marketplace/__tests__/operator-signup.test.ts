import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it, vi } from "vitest";

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

import {
  businessDetailsFromUserMetadata,
  isOperatorAccountMetadata,
  normalizeOperatorBusinessDetails,
  operatorSignupUserMetadata,
} from "@/lib/marketplace/operator-signup";

const ORG_BOOTSTRAP_MIGRATION = path.resolve(
  __dirname,
  "../../../../supabase/migrations/20261025000001_bootstrap_operator_org_on_signup.sql"
);

const OPERATOR_ONLY_MIGRATION = path.resolve(
  __dirname,
  "../../../../supabase/migrations/20261038000001_stop_org_bootstrap_on_signup.sql"
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

describe("operator signup bootstrap migrations", () => {
  it("original migration creates an auth.users trigger from operator metadata", () => {
    const sql = readFileSync(ORG_BOOTSTRAP_MIGRATION, "utf8");

    expect(sql).toContain("marketplace.bootstrap_organization_for_user");
    expect(sql).toContain("bootstrap_operator_organization_from_signup");
    expect(sql).toContain("on_auth_user_created_operator_org");
    expect(sql).toContain("account_type");
    expect(sql).toContain("business_name");
  });

  it("later migration stops creating organisations and only bootstraps operators", () => {
    const sql = readFileSync(OPERATOR_ONLY_MIGRATION, "utf8");

    expect(sql).toContain("marketplace.bootstrap_operator_for_user");
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.bootstrap_operator_organization_from_signup"
    );
    expect(sql).not.toContain(
      "PERFORM marketplace.bootstrap_organization_for_user"
    );
    expect(sql).toContain("do not create marketplace.organizations");
  });
});
