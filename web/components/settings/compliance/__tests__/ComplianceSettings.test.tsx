import { describe, expect, it } from "vitest";
import {
  canManageCompliance,
  complianceDocTypeOptions,
  fieldErrorMap,
  formatComplianceDate,
  reviewStatusTone,
} from "@/lib/marketplace/compliance-ui";

describe("compliance-ui helpers", () => {
  it("allows owner/manager only", () => {
    expect(canManageCompliance("owner")).toBe(true);
    expect(canManageCompliance("manager")).toBe(true);
    expect(canManageCompliance("staff")).toBe(false);
    expect(canManageCompliance(null)).toBe(false);
  });

  it("lists doc types and formats dates", () => {
    const opts = complianceDocTypeOptions();
    expect(opts.some((o) => o.value === "public_liability_insurance")).toBe(
      true
    );
    expect(formatComplianceDate("2026-11-20")).toMatch(/2026/);
    expect(formatComplianceDate(null)).toBe("—");
  });

  it("maps field errors and status tones", () => {
    expect(fieldErrorMap([{ field: "file", message: "required" }])).toEqual({
      file: "required",
    });
    expect(reviewStatusTone("approved")).toBe("ok");
    expect(reviewStatusTone("pending")).toBe("warn");
    expect(reviewStatusTone("expired")).toBe("bad");
  });
});
