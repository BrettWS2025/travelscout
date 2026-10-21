import { describe, expect, it } from "vitest";
import {
  canManageAccount,
  closeConfirmTextForOperator,
  closeWarningCopy,
  isCloseConfirmValid,
} from "@/lib/marketplace/account-ui";

describe("account-ui", () => {
  it("canManageAccount is owner only", () => {
    expect(canManageAccount("owner")).toBe(true);
    expect(canManageAccount("manager")).toBe(false);
  });

  it("close confirm matches trading name exactly", () => {
    expect(closeConfirmTextForOperator("  Harbour Kayaks ")).toBe(
      "Harbour Kayaks"
    );
    expect(isCloseConfirmValid("Harbour Kayaks", "Harbour Kayaks")).toBe(true);
    expect(isCloseConfirmValid("Harbour Kayaks", "harbour kayaks")).toBe(false);
  });

  it("closeWarningCopy names the operator", () => {
    expect(closeWarningCopy("Bay Cruises")).toContain("Bay Cruises");
  });
});
