import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isOperatorHost,
  operatorPortalUrl,
  toInternalOperatorPath,
  toPublicOperatorPath,
  operatorHref,
} from "@/lib/hosts";

describe("hosts", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("maps public operator paths to internal /operator routes", () => {
    expect(toInternalOperatorPath("/")).toBe("/operator");
    expect(toInternalOperatorPath("/organizations/new")).toBe(
      "/operator/organizations/new"
    );
    expect(toInternalOperatorPath("/operator")).toBe("/operator");
  });

  it("maps internal paths to public subdomain paths", () => {
    expect(toPublicOperatorPath("/operator")).toBe("/");
    expect(toPublicOperatorPath("/operator/organizations/abc")).toBe(
      "/organizations/abc"
    );
  });

  it("detects operator host when configured", () => {
    vi.stubEnv("NEXT_PUBLIC_OPERATOR_HOST", "operators.example.com");
    expect(isOperatorHost("operators.example.com")).toBe(true);
    expect(isOperatorHost("www.example.com")).toBe(false);
  });

  it("builds operator portal URLs", () => {
    vi.stubEnv("NEXT_PUBLIC_OPERATOR_HOST", "operators.travelscout.co.nz");
    expect(operatorPortalUrl("/")).toBe("https://operators.travelscout.co.nz/");
    expect(operatorPortalUrl("/organizations/new")).toBe(
      "https://operators.travelscout.co.nz/organizations/new"
    );
  });

  it("operatorHref respects surface", () => {
    expect(operatorHref("/organizations/new", true)).toBe("/organizations/new");
    expect(operatorHref("/organizations/new", false)).toBe(
      "/operator/organizations/new"
    );
    expect(operatorHref("/operator", false)).toBe("/operator");
    expect(operatorHref("/operator", true)).toBe("/");
  });
});
