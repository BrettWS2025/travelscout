import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";
import {
  ACTION_ROLES,
  OPERATOR_ACTIONS,
  ROLE_ACTIONS,
  can,
  denialMessage,
  isAdminAction,
  isOperatorAction,
  isPlatformAdminUser,
  permissionUserFromStore,
  requirePermission,
  type OperatorAction,
  type PermissionUser,
} from "@/lib/marketplace/permissions";
import type { UserRole } from "@/lib/marketplace/enums";
import { seedDevMarketplace } from "@/lib/marketplace/seed-dev";

const MIGRATION_PATH = path.resolve(
  __dirname,
  "../../../../supabase/migrations/20261020000006_profiles_platform_admin.sql"
);

const OPERATOR_ID = "op-1";
const OTHER_OPERATOR_ID = "op-2";

function userWithRole(
  role: UserRole,
  opts?: { id?: string; isPlatformAdmin?: boolean; operatorId?: string }
): PermissionUser {
  const operatorId = opts?.operatorId ?? OPERATOR_ID;
  return {
    id: opts?.id ?? `user-${role}`,
    isPlatformAdmin: opts?.isPlatformAdmin ?? false,
    operatorRoles: { [operatorId]: role },
  };
}

function fakeAuthUser(id: string): User {
  return {
    id,
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "",
  } as User;
}

/** Expected allow/deny for each role × operator action. */
const MATRIX: Record<UserRole, Record<OperatorAction, boolean>> = {
  owner: {
    "inventory.read": true,
    "inventory.write": true,
    "settings.integrations": true,
    "settings.defaults": true,
    "settings.team": true,
    "settings.compliance": true,
    "settings.profile.write": true,
    "settings.profile.read": true,
    "settings.notifications.own": true,
    "settings.billing": true,
    "settings.account": true,
  },
  manager: {
    "inventory.read": true,
    "inventory.write": true,
    "settings.integrations": true,
    "settings.defaults": true,
    "settings.team": true,
    "settings.compliance": true,
    "settings.profile.write": true,
    "settings.profile.read": true,
    "settings.notifications.own": true,
    "settings.billing": false,
    "settings.account": false,
  },
  staff: {
    "inventory.read": true,
    "inventory.write": false,
    "settings.integrations": false,
    "settings.defaults": false,
    "settings.team": false,
    "settings.compliance": false,
    "settings.profile.write": false,
    "settings.profile.read": true,
    "settings.notifications.own": true,
    "settings.billing": false,
    "settings.account": false,
  },
};

describe("Chunk 9 migration", () => {
  it("adds is_platform_admin to profiles and blocks self-elevation", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf8");
    expect(sql).toContain("is_platform_admin");
    expect(sql).toContain("ALTER TABLE public.profiles");
    expect(sql).toContain("WITH CHECK");
    expect(sql).toContain("is_platform_admin IS NOT DISTINCT FROM");
  });
});

describe("action helpers", () => {
  it("recognises operator and admin actions", () => {
    expect(isOperatorAction("inventory.read")).toBe(true);
    expect(isOperatorAction("admin.deals.approve")).toBe(false);
    expect(isAdminAction("admin.deals.approve")).toBe(true);
    expect(isAdminAction("inventory.read")).toBe(false);
    expect(OPERATOR_ACTIONS).toHaveLength(11);
  });

  it("keeps ROLE_ACTIONS and ACTION_ROLES in sync", () => {
    for (const action of OPERATOR_ACTIONS) {
      for (const role of ["owner", "manager", "staff"] as const) {
        const viaAction = ACTION_ROLES[action].includes(role);
        const viaRole = ROLE_ACTIONS[role].includes(action);
        expect(viaRole).toBe(viaAction);
      }
    }
  });
});

describe("can() role × action matrix", () => {
  for (const role of ["owner", "manager", "staff"] as const) {
    describe(role, () => {
      const user = userWithRole(role);
      for (const action of OPERATOR_ACTIONS) {
        const allowed = MATRIX[role][action];
        it(`${allowed ? "allows" : "denies"} ${action}`, () => {
          expect(can(user, OPERATOR_ID, action)).toBe(allowed);
        });
      }
    });
  }

  it("denies operator actions when user is not a member of that operator", () => {
    const owner = userWithRole("owner");
    expect(can(owner, OTHER_OPERATOR_ID, "inventory.read")).toBe(false);
    expect(can(owner, OTHER_OPERATOR_ID, "settings.billing")).toBe(false);
  });

  it("denies operator actions for pending membership (fail closed)", () => {
    const pending = permissionUserFromStore("u1", [
      {
        userId: "u1",
        operatorId: OPERATOR_ID,
        role: "owner",
        inviteStatus: "pending",
      },
    ]);
    expect(can(pending, OPERATOR_ID, "inventory.read")).toBe(false);
  });

  it("grants admin.* only to platform admins", () => {
    const staff = userWithRole("staff");
    const admin = userWithRole("staff", { isPlatformAdmin: true });
    const outsider: PermissionUser = {
      id: "admin-only",
      isPlatformAdmin: true,
      operatorRoles: {},
    };

    expect(can(staff, OPERATOR_ID, "admin.deals.approve")).toBe(false);
    expect(can(admin, OPERATOR_ID, "admin.deals.approve")).toBe(true);
    expect(can(outsider, OPERATOR_ID, "admin.operators.manual-review")).toBe(
      true
    );
    // Platform admin does not imply operator write access
    expect(can(outsider, OPERATOR_ID, "inventory.write")).toBe(false);
  });
});

describe("isPlatformAdminUser", () => {
  it("grants admin from app_metadata or profile flag only", () => {
    const base = fakeAuthUser("u");

    expect(isPlatformAdminUser(base)).toBe(false);
    expect(
      isPlatformAdminUser({
        ...base,
        app_metadata: { is_platform_admin: true },
      })
    ).toBe(true);
    expect(
      isPlatformAdminUser({
        ...base,
        app_metadata: { is_platform_admin: "true" },
      })
    ).toBe(true);
    expect(isPlatformAdminUser(base, true)).toBe(true);
  });

  it("does not grant admin from client-writable user_metadata alone", () => {
    const base = fakeAuthUser("u");

    expect(
      isPlatformAdminUser({
        ...base,
        user_metadata: { is_platform_admin: true },
      })
    ).toBe(false);
    expect(
      isPlatformAdminUser({
        ...base,
        user_metadata: { is_platform_admin: "true" },
      })
    ).toBe(false);
    // user_metadata must not override a false/absent profile flag
    expect(
      isPlatformAdminUser(
        {
          ...base,
          user_metadata: { is_platform_admin: true },
        },
        false
      )
    ).toBe(false);
  });
});

describe("permissionUserFromStore + seed", () => {
  it("maps Harbour Kayaks seeded roles correctly", () => {
    const { store, harbourKayaks } = seedDevMarketplace();
    const members = [...store.teamMembers.values()];

    const owner = permissionUserFromStore(
      harbourKayaks.owner.userId!,
      members
    );
    const manager = permissionUserFromStore(
      harbourKayaks.manager.userId!,
      members
    );
    const staff = permissionUserFromStore(
      harbourKayaks.staff.userId!,
      members
    );

    const opId = harbourKayaks.operator.id;
    expect(can(owner, opId, "settings.billing")).toBe(true);
    expect(can(manager, opId, "settings.billing")).toBe(false);
    expect(can(manager, opId, "inventory.write")).toBe(true);
    expect(can(staff, opId, "inventory.write")).toBe(false);
    expect(can(staff, opId, "inventory.read")).toBe(true);
    expect(can(staff, opId, "settings.profile.read")).toBe(true);
    expect(can(staff, opId, "settings.notifications.own")).toBe(true);
  });
});

describe("requirePermission helper", () => {
  it("returns 401 when unauthenticated", async () => {
    const result = await requirePermission(
      new Request("http://localhost/test"),
      OPERATOR_ID,
      "inventory.read",
      {
        getAuth: async () => ({ user: null }),
      }
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(401);
  });

  it("returns 403 with a clear message when the role is denied", async () => {
    const result = await requirePermission(
      new Request("http://localhost/test"),
      OPERATOR_ID,
      "settings.billing",
      {
        getAuth: async () => ({
          user: fakeAuthUser("staff-1"),
          accessToken: "test-token",
        }),
        lookupRole: async () => "staff",
        resolvePlatformAdmin: async () => false,
      }
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(403);
    const body = await result.response.json();
    expect(body.error).toBe(denialMessage("settings.billing"));
    expect(body.error).toContain("settings.billing");
  });

  it("allows owner for settings.billing", async () => {
    const result = await requirePermission(
      new Request("http://localhost/test"),
      OPERATOR_ID,
      "settings.billing",
      {
        getAuth: async () => ({
          user: fakeAuthUser("owner-1"),
          accessToken: "test-token",
        }),
        lookupRole: async () => "owner",
        resolvePlatformAdmin: async () => false,
      }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.role).toBe("owner");
    expect(result.user.id).toBe("owner-1");
  });

  it("allows platform admin for admin.* without membership", async () => {
    const result = await requirePermission(
      new Request("http://localhost/test"),
      OPERATOR_ID,
      "admin.deals.approve",
      {
        getAuth: async () => ({
          user: fakeAuthUser("admin-1"),
          accessToken: "test-token",
        }),
        lookupRole: async () => null,
        resolvePlatformAdmin: async () => true,
      }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.permissionUser.isPlatformAdmin).toBe(true);
  });
});

describe("denialMessage", () => {
  it("mentions the action", () => {
    expect(denialMessage("inventory.write")).toContain("inventory.write");
    expect(denialMessage("admin.deals.approve")).toContain("platform admin");
  });
});
