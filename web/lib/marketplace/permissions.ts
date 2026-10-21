/**
 * Server-side roles and permissions guard (deals platform Chunk 9).
 *
 * Every operator endpoint should call `can(...)` / `requirePermission(...)`.
 * The UI may mirror these rules but must never be the only check.
 *
 * Roles (operator team):
 * - owner: everything
 * - manager: everything except Billing and Account
 * - staff: read-only Inventory, read-only Business profile, own Notifications
 *
 * Platform admin (`isPlatformAdmin` on the user) may perform `admin.*` only;
 * it does not grant operator membership actions by itself (fail closed).
 */

import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import {
  forbidden,
  getMarketplaceAuth,
  unauthorized,
} from "./auth";
import { createMarketplaceClient } from "./db";
import type { UserRole } from "./enums";
import { isUserRole } from "./enums";

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export const OPERATOR_ACTIONS = [
  "inventory.read",
  "inventory.write",
  "settings.integrations",
  "settings.defaults",
  "settings.team",
  "settings.compliance",
  "settings.profile.write",
  "settings.profile.read",
  "settings.notifications.own",
  "settings.billing",
  "settings.account",
] as const;

export type OperatorAction = (typeof OPERATOR_ACTIONS)[number];

/** Admin actions are any string starting with `admin.` (e.g. `admin.deals.approve`). */
export type AdminAction = `admin.${string}`;

export type PermissionAction = OperatorAction | AdminAction;

export function isOperatorAction(value: unknown): value is OperatorAction {
  return (
    typeof value === "string" &&
    (OPERATOR_ACTIONS as readonly string[]).includes(value)
  );
}

export function isAdminAction(value: unknown): value is AdminAction {
  return typeof value === "string" && value.startsWith("admin.");
}

export function isPermissionAction(value: unknown): value is PermissionAction {
  return isOperatorAction(value) || isAdminAction(value);
}

// ---------------------------------------------------------------------------
// Role → action matrix
// ---------------------------------------------------------------------------

const ALL_ROLES: readonly UserRole[] = ["owner", "manager", "staff"];
const OWNER_MANAGER: readonly UserRole[] = ["owner", "manager"];
const OWNER_ONLY: readonly UserRole[] = ["owner"];

/** Which accepted team roles may perform each operator-scoped action. */
export const ACTION_ROLES: Record<OperatorAction, readonly UserRole[]> = {
  "inventory.read": ALL_ROLES,
  "inventory.write": OWNER_MANAGER,
  "settings.integrations": OWNER_MANAGER,
  "settings.defaults": OWNER_MANAGER,
  "settings.team": OWNER_MANAGER,
  "settings.compliance": OWNER_MANAGER,
  "settings.profile.write": OWNER_MANAGER,
  "settings.profile.read": ALL_ROLES,
  "settings.notifications.own": ALL_ROLES,
  "settings.billing": OWNER_ONLY,
  "settings.account": OWNER_ONLY,
};

/** Inverse: actions granted to each role (handy for UI / list row actions). */
export const ROLE_ACTIONS: Record<UserRole, readonly OperatorAction[]> = {
  owner: OPERATOR_ACTIONS.filter((a) => ACTION_ROLES[a].includes("owner")),
  manager: OPERATOR_ACTIONS.filter((a) => ACTION_ROLES[a].includes("manager")),
  staff: OPERATOR_ACTIONS.filter((a) => ACTION_ROLES[a].includes("staff")),
};

// ---------------------------------------------------------------------------
// User shape for can()
// ---------------------------------------------------------------------------

/**
 * Principal passed to `can`. Callers resolve membership (and platform-admin)
 * before calling, or use `requirePermission` which loads them.
 */
export type PermissionUser = {
  id: string;
  /** Separate flag on User / profiles — not an operator team role. */
  isPlatformAdmin?: boolean;
  /**
   * Accepted operator roles keyed by operator id.
   * Missing / null entry ⇒ not a member (fail closed for operator actions).
   */
  operatorRoles?: Readonly<Record<string, UserRole>>;
};

export function roleForOperator(
  user: PermissionUser,
  operatorId: string
): UserRole | null {
  const role = user.operatorRoles?.[operatorId];
  return role != null && isUserRole(role) ? role : null;
}

/**
 * Pure permission check used by every operator endpoint.
 *
 * - `admin.*` → platform admin only (ignores operator membership)
 * - operator actions → accepted team role for `operatorId` must allow the action
 */
export function can(
  user: PermissionUser,
  operatorId: string,
  action: PermissionAction
): boolean {
  if (isAdminAction(action)) {
    return user.isPlatformAdmin === true;
  }

  if (!isOperatorAction(action)) {
    return false;
  }

  const role = roleForOperator(user, operatorId);
  if (!role) return false;
  return ACTION_ROLES[action].includes(role);
}

export function denialMessage(action: PermissionAction): string {
  if (isAdminAction(action)) {
    return `Forbidden: platform admin required for "${action}".`;
  }
  return `Forbidden: missing permission "${action}" for this operator.`;
}

// ---------------------------------------------------------------------------
// Platform admin + membership lookup (DB)
// ---------------------------------------------------------------------------

function truthyFlag(value: unknown): boolean {
  return value === true || value === "true";
}

/**
 * Platform admin flag from auth metadata and/or profiles.is_platform_admin.
 * Metadata alone is enough for `can`; profile lookup is used by requirePermission.
 */
export function isPlatformAdminUser(
  user: User,
  profileFlag?: boolean | null
): boolean {
  if (profileFlag === true) return true;
  if (truthyFlag(user.app_metadata?.is_platform_admin)) return true;
  if (truthyFlag(user.user_metadata?.is_platform_admin)) return true;
  return false;
}

function createPublicAuthedClient(accessToken: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: supabaseAnonKey,
      },
    },
  });
}

export async function lookupAcceptedOperatorRole(
  accessToken: string,
  userId: string,
  operatorId: string
): Promise<UserRole | null> {
  const supabase = createMarketplaceClient(accessToken);
  const { data, error } = await supabase
    .from("team_members")
    .select("role")
    .eq("operator_id", operatorId)
    .eq("user_id", userId)
    .eq("invite_status", "accepted")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load team membership: ${error.message}`);
  }
  if (!data || !isUserRole(data.role)) return null;
  return data.role;
}

export async function lookupPlatformAdminFromProfile(
  accessToken: string,
  userId: string
): Promise<boolean> {
  const supabase = createPublicAuthedClient(accessToken);
  const { data, error } = await supabase
    .from("profiles")
    .select("is_platform_admin")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    // Column may be absent in older envs — fall back to auth metadata only.
    if (
      typeof error.message === "string" &&
      (error.message.includes("is_platform_admin") ||
        error.message.includes("does not exist"))
    ) {
      return false;
    }
    throw new Error(`Failed to load profile admin flag: ${error.message}`);
  }

  return data?.is_platform_admin === true;
}

export type RequirePermissionOk = {
  ok: true;
  user: User;
  accessToken: string;
  role: UserRole | null;
  permissionUser: PermissionUser;
};

export type RequirePermissionDenied = {
  ok: false;
  response: Response;
};

export type RequirePermissionResult =
  | RequirePermissionOk
  | RequirePermissionDenied;

export type RequirePermissionOptions = {
  /** Override auth resolution (tests). */
  getAuth?: (req: Request) => Promise<{
    user: User | null;
    accessToken?: string;
  }>;
  /** Override membership lookup (tests / in-memory). */
  lookupRole?: (
    accessToken: string,
    userId: string,
    operatorId: string
  ) => Promise<UserRole | null>;
  /** Override platform-admin resolution (tests). */
  resolvePlatformAdmin?: (
    user: User,
    accessToken: string
  ) => boolean | Promise<boolean>;
};

/**
 * Optional in-memory team membership lookup (Chunk 22 HTTP store / seeds).
 * Used when Supabase team_members has no row (process-local draft store).
 */
export type MemoryOperatorRoleLookup = (
  userId: string,
  operatorId: string,
  email?: string | null
) => UserRole | null;

let memoryOperatorRoleLookup: MemoryOperatorRoleLookup | null = null;

export function setMemoryOperatorRoleLookup(
  fn: MemoryOperatorRoleLookup | null
): void {
  memoryOperatorRoleLookup = fn;
}

export function getMemoryOperatorRoleLookup(): MemoryOperatorRoleLookup | null {
  return memoryOperatorRoleLookup;
}

/**
 * Auth + permission middleware for operator API routes.
 * Returns `{ ok: true, ... }` or `{ ok: false, response }` with 401/403.
 */
export async function requirePermission(
  req: Request,
  operatorId: string,
  action: PermissionAction,
  options?: RequirePermissionOptions
): Promise<RequirePermissionResult> {
  const getAuth = options?.getAuth ?? getMarketplaceAuth;
  const { user, accessToken } = await getAuth(req);
  if (!user || !accessToken) {
    return { ok: false, response: unauthorized() };
  }

  const lookupRole = options?.lookupRole ?? lookupAcceptedOperatorRole;
  const resolveAdmin =
    options?.resolvePlatformAdmin ??
    (async (u: User, token: string) => {
      const fromProfile = await lookupPlatformAdminFromProfile(token, u.id);
      return isPlatformAdminUser(u, fromProfile);
    });

  const [lookedUpRole, isPlatformAdmin] = await Promise.all([
    lookupRole(accessToken, user.id, operatorId),
    Promise.resolve(resolveAdmin(user, accessToken)).then(Boolean),
  ]);

  const role =
    lookedUpRole ??
    memoryOperatorRoleLookup?.(user.id, operatorId, user.email ?? null) ??
    null;

  const permissionUser: PermissionUser = {
    id: user.id,
    isPlatformAdmin,
    operatorRoles: role != null ? { [operatorId]: role } : {},
  };

  if (!can(permissionUser, operatorId, action)) {
    return { ok: false, response: forbidden(denialMessage(action)) };
  }

  // Chunk 40: throttled last_active_at for accepted team members.
  // Dynamic import avoids a hard cycle with team.ts ↔ permissions.
  void import("./team")
    .then(({ touchLastActiveIfConfigured }) => {
      touchLastActiveIfConfigured(operatorId, user.id);
    })
    .catch(() => undefined);

  return {
    ok: true,
    user,
    accessToken,
    role,
    permissionUser,
  };
}

/**
 * Build a PermissionUser from an in-memory team store (unit tests / seeds).
 */
export function permissionUserFromStore(
  userId: string,
  memberships: Iterable<{
    userId: string | null;
    operatorId: string;
    role: UserRole;
    inviteStatus: string;
  }>,
  isPlatformAdmin = false
): PermissionUser {
  const operatorRoles: Record<string, UserRole> = {};
  for (const m of memberships) {
    if (
      m.userId === userId &&
      m.inviteStatus === "accepted" &&
      isUserRole(m.role)
    ) {
      operatorRoles[m.operatorId] = m.role;
    }
  }
  return { id: userId, isPlatformAdmin, operatorRoles };
}
