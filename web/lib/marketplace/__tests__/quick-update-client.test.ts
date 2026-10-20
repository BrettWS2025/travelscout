import { describe, expect, it } from "vitest";
import {
  formatQuickUpdateSessionLabel,
  QuickUpdateApiError,
} from "@/lib/marketplace/quick-update-client";

describe("quick-update-client (chunk 24)", () => {
  it("flags 410 as expiredOrUsed", () => {
    const err = new QuickUpdateApiError("used", 410);
    expect(err.isExpiredOrUsed).toBe(true);
    expect(err.isInvalidToken).toBe(false);
  });

  it("flags 401/404 as invalid token", () => {
    expect(new QuickUpdateApiError("bad", 401).isInvalidToken).toBe(true);
    expect(new QuickUpdateApiError("gone", 404).isInvalidToken).toBe(true);
  });

  it("formats session start in Pacific/Auckland", () => {
    const label = formatQuickUpdateSessionLabel(
      "2026-10-21T01:00:00.000Z",
      "Pacific/Auckland"
    );
    // NZDT = UTC+13 → 14:00 on 21 Oct
    expect(label).toMatch(/21/);
    expect(label).toMatch(/Oct/i);
    expect(label).toMatch(/2:?00|14/i);
  });
});
