/**
 * UI helpers for Team settings (Chunk 40).
 * Keep free of Node-only imports (team.ts uses crypto).
 */

import { USER_ROLES, type InviteStatus, type UserRole } from "./enums";

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  owner: "Owner",
  manager: "Manager",
  staff: "Staff",
};

export const INVITE_STATUS_LABELS: Record<InviteStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  revoked: "Revoked",
};

export type TeamMemberRow = {
  id: string;
  operator_id: string;
  user_id: string | null;
  role: UserRole;
  role_label: string;
  invited_email: string;
  invite_status: InviteStatus;
  invite_status_label: string;
  invited_at: string;
  last_active_at: string | null;
  created_at: string;
  updated_at: string;
};

export function canManageTeam(role: UserRole | null | undefined): boolean {
  return role === "owner" || role === "manager";
}

/** Roles the actor may assign when inviting or changing role. */
export function assignableRoles(actorRole: UserRole): UserRole[] {
  if (actorRole === "owner") return [...USER_ROLES];
  if (actorRole === "manager") return ["manager", "staff"];
  return [];
}

export function canChangeMemberRole(
  actorRole: UserRole,
  member: Pick<TeamMemberRow, "role" | "invite_status">
): boolean {
  if (!canManageTeam(actorRole)) return false;
  if (member.invite_status === "revoked") return false;
  if (member.role === "owner" && actorRole !== "owner") return false;
  return true;
}

export function canRemoveMember(
  actorRole: UserRole,
  member: Pick<TeamMemberRow, "role" | "invite_status">
): boolean {
  if (!canManageTeam(actorRole)) return false;
  if (member.role === "owner" && actorRole !== "owner") return false;
  return true;
}

export function canResendOrRevoke(
  actorRole: UserRole,
  member: Pick<TeamMemberRow, "role" | "invite_status">
): boolean {
  if (member.invite_status !== "pending") return false;
  return canRemoveMember(actorRole, member);
}

export function formatLastActive(
  iso: string | null,
  nowMs: number = Date.now()
): string {
  if (!iso) return "Never";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "Never";
  const delta = Math.max(0, nowMs - ms);
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  return new Date(ms).toLocaleDateString();
}

export function fieldErrorMap(
  errors: Array<{ field: string; message: string }> | undefined
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of errors ?? []) {
    out[e.field] = e.message;
  }
  return out;
}
