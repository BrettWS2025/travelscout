import { describe, expect, it } from "vitest";
import {
  assignableRoles,
  canChangeMemberRole,
  canManageTeam,
  canRemoveMember,
  canResendOrRevoke,
  formatLastActive,
} from "@/lib/marketplace/team-ui";

describe("team-ui helpers", () => {
  it("restricts assignable roles by actor", () => {
    expect(assignableRoles("owner")).toEqual(["owner", "manager", "staff"]);
    expect(assignableRoles("manager")).toEqual(["manager", "staff"]);
    expect(assignableRoles("staff")).toEqual([]);
  });

  it("gates manage / remove / resend", () => {
    expect(canManageTeam("owner")).toBe(true);
    expect(canManageTeam("staff")).toBe(false);

    const owner = {
      role: "owner" as const,
      invite_status: "accepted" as const,
    };
    const pendingStaff = {
      role: "staff" as const,
      invite_status: "pending" as const,
    };

    expect(canChangeMemberRole("manager", owner)).toBe(false);
    expect(canRemoveMember("manager", owner)).toBe(false);
    expect(canResendOrRevoke("manager", pendingStaff)).toBe(true);
    expect(canResendOrRevoke("manager", owner)).toBe(false);
  });

  it("formats last active", () => {
    const now = Date.parse("2026-10-21T12:00:00.000Z");
    expect(formatLastActive(null, now)).toBe("Never");
    expect(formatLastActive("2026-10-21T11:59:30.000Z", now)).toBe("Just now");
    expect(formatLastActive("2026-10-21T10:00:00.000Z", now)).toBe("2h ago");
  });
});
