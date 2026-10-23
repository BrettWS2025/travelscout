/**
 * Team settings (deals platform Chunk 40).
 *
 * - GET/POST invite under /operators/:id/team
 * - PATCH/DELETE /team/:mid, POST resend/revoke
 * - Accept invite via signed token (links user_id)
 * - Always ≥1 accepted owner; only owners may create/change owners
 * - last_active_at touch on authenticated requests (throttled)
 *
 * Keep free of server-only imports (auth, permissions, next/headers) so
 * team-ui / client components can import serializers and labels safely.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { isValidBookingEmail } from "./booking-destination";
import { isUserRole, type InviteStatus, type UserRole } from "./enums";
import {
  LastOwnerError,
  OperatorValidationError,
  applyTeamMemberChange,
  listTeamMembers,
  removeTeamMember,
  type OperatorStore,
  type TeamMember,
} from "./operators";
import {
  buildDefaultNotificationPreferences,
  type NotificationPreference,
} from "./settings";
import { allowsDevSecretFallback } from "./secrets";
import {
  INVITE_STATUS_LABELS,
  USER_ROLE_LABELS,
} from "./display-labels";

export { INVITE_STATUS_LABELS, USER_ROLE_LABELS };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const TEAM_INVITE_TTL_DAYS = 7;
export const LAST_ACTIVE_THROTTLE_MS = 5 * 60 * 1000;
const TOKEN_BYTES = 32;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class TeamError extends Error {
  readonly status: number;
  readonly errors?: Array<{ field: string; message: string }>;
  readonly code?: string;

  constructor(
    message: string,
    status = 400,
    extras?: {
      errors?: Array<{ field: string; message: string }>;
      code?: string;
    }
  ) {
    super(message);
    this.name = "TeamError";
    this.status = status;
    this.errors = extras?.errors;
    this.code = extras?.code;
  }
}

// ---------------------------------------------------------------------------
// Invite token records
// ---------------------------------------------------------------------------

export type TeamInviteTokenRecord = {
  id: string;
  teamMemberId: string;
  operatorId: string;
  /** SHA-256 hex of the raw token (never store raw). */
  tokenHash: string;
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export type TeamDealStore = {
  operators: OperatorStore;
  teamInviteTokens?: Map<string, TeamInviteTokenRecord>;
  notificationPreferences?: Map<string, NotificationPreference>;
};

export type IssuedTeamInvite = {
  member: TeamMember;
  record: TeamInviteTokenRecord;
  /** Raw token for the email URL — show once, never store. */
  rawToken: string;
  invitePath: string;
};

export type TeamInviteEmailPayload = {
  to: string;
  operatorName: string;
  role: UserRole;
  inviteUrl: string;
  invitedByEmail?: string | null;
};

export type TeamInviteEmailSender = (
  msg: TeamInviteEmailPayload
) => void | Promise<void>;

// ---------------------------------------------------------------------------
// Email stub + URL helpers
// ---------------------------------------------------------------------------

const defaultInviteEmailSender: TeamInviteEmailSender = async (msg) => {
  if (process.env.NODE_ENV === "test") return;
  // eslint-disable-next-line no-console
  console.info("[team:invite-email]", msg.to, msg.role, msg.inviteUrl);
};

let inviteEmailSender: TeamInviteEmailSender = defaultInviteEmailSender;

export function setTeamInviteEmailSender(
  sender: TeamInviteEmailSender | null
): void {
  inviteEmailSender = sender ?? defaultInviteEmailSender;
}

export function getTeamInviteEmailSender(): TeamInviteEmailSender {
  return inviteEmailSender;
}

/** Public accept path (raw token in URL). */
export function buildTeamInvitePath(rawToken: string): string {
  return `/team/invite/${encodeURIComponent(rawToken)}`;
}

export function buildTeamInviteAbsoluteUrl(
  rawToken: string,
  options?: { origin?: string }
): string {
  const path = buildTeamInvitePath(rawToken);
  const origin =
    options?.origin?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "";
  return origin ? `${origin}${path}` : path;
}

// ---------------------------------------------------------------------------
// Store maps
// ---------------------------------------------------------------------------

export function ensureTeamInviteTokenMap(
  store: TeamDealStore
): Map<string, TeamInviteTokenRecord> {
  if (!store.teamInviteTokens) {
    store.teamInviteTokens = new Map();
  }
  return store.teamInviteTokens;
}

function ensureNotificationPrefsMap(
  store: TeamDealStore
): Map<string, NotificationPreference> {
  if (!store.notificationPreferences) {
    store.notificationPreferences = new Map();
  }
  return store.notificationPreferences;
}

function prefKey(userId: string, operatorId: string, eventType: string): string {
  return `${userId}:${operatorId}:${eventType}`;
}

function seedPrefsForNewMember(
  store: TeamDealStore,
  userId: string,
  operatorId: string,
  now: string
): void {
  const map = ensureNotificationPrefsMap(store);
  const prefs = buildDefaultNotificationPreferences(userId, operatorId, {
    now,
  });
  for (const p of prefs) {
    map.set(prefKey(userId, operatorId, p.eventType), p);
  }
}

// ---------------------------------------------------------------------------
// Signing / hashing
// ---------------------------------------------------------------------------

export function resolveTeamInviteTokenSecret(
  env: NodeJS.ProcessEnv = process.env
): string {
  const raw =
    env.TEAM_INVITE_TOKEN_SECRET?.trim() ||
    env.QUICK_UPDATE_TOKEN_SECRET?.trim() ||
    env.SECRETS_ENCRYPTION_KEY?.trim();
  if (raw) return raw;
  // Security S11: never use the hardcoded fallback in production.
  if (!allowsDevSecretFallback(env)) {
    throw new TeamError(
      "TEAM_INVITE_TOKEN_SECRET (or QUICK_UPDATE_TOKEN_SECRET / SECRETS_ENCRYPTION_KEY) is required",
      503,
      { code: "secrets_not_configured" }
    );
  }
  return "dev-team-invite-token-secret";
}

export function hashTeamInviteToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

function signTokenPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("base64url");
}

export function mintTeamInviteRawToken(
  tokenId: string,
  options?: { secret?: string; nonce?: string }
): string {
  const secret = options?.secret ?? resolveTeamInviteTokenSecret();
  const nonce = options?.nonce ?? randomBytes(TOKEN_BYTES).toString("base64url");
  const idPart = Buffer.from(tokenId, "utf8").toString("base64url");
  const payload = `${idPart}.${nonce}`;
  const sig = signTokenPayload(payload, secret);
  return `${payload}.${sig}`;
}

export function verifyTeamInviteRawToken(
  rawToken: string,
  options?: { secret?: string }
): { tokenId: string } | null {
  const secret = options?.secret ?? resolveTeamInviteTokenSecret();
  const parts = rawToken.split(".");
  if (parts.length !== 3) return null;
  const [idPart, nonce, sig] = parts;
  if (!idPart || !nonce || !sig) return null;
  const payload = `${idPart}.${nonce}`;
  const expected = signTokenPayload(payload, secret);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  let tokenId: string;
  try {
    tokenId = Buffer.from(idPart, "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!tokenId) return null;
  return { tokenId };
}

function inviteExpiresAt(nowIso: string): string {
  const ms = Date.parse(nowIso) + TEAM_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString();
}

function revokeOpenTokensForMember(
  tokens: Map<string, TeamInviteTokenRecord>,
  teamMemberId: string,
  now: string
): void {
  for (const [id, t] of tokens) {
    if (
      t.teamMemberId === teamMemberId &&
      t.usedAt == null &&
      t.revokedAt == null
    ) {
      tokens.set(id, { ...t, revokedAt: now });
    }
  }
}

function issueTokenForMember(
  store: TeamDealStore,
  member: TeamMember,
  options?: { now?: string; secret?: string; id?: string }
): IssuedTeamInvite {
  const tokens = ensureTeamInviteTokenMap(store);
  const now = options?.now ?? new Date().toISOString();
  revokeOpenTokensForMember(tokens, member.id, now);

  const id = options?.id ?? crypto.randomUUID();
  const rawToken = mintTeamInviteRawToken(id, { secret: options?.secret });
  const record: TeamInviteTokenRecord = {
    id,
    teamMemberId: member.id,
    operatorId: member.operatorId,
    tokenHash: hashTeamInviteToken(rawToken),
    expiresAt: inviteExpiresAt(now),
    usedAt: null,
    revokedAt: null,
    createdAt: now,
  };
  tokens.set(id, record);
  return {
    member,
    record,
    rawToken,
    invitePath: buildTeamInvitePath(rawToken),
  };
}

// ---------------------------------------------------------------------------
// Serializers
// ---------------------------------------------------------------------------

export function serializeTeamMember(m: TeamMember): Record<string, unknown> {
  return {
    id: m.id,
    operator_id: m.operatorId,
    user_id: m.userId,
    role: m.role,
    role_label: USER_ROLE_LABELS[m.role],
    invited_email: m.invitedEmail,
    invite_status: m.inviteStatus,
    invite_status_label: INVITE_STATUS_LABELS[m.inviteStatus],
    invited_at: m.invitedAt,
    last_active_at: m.lastActiveAt,
    created_at: m.createdAt,
    updated_at: m.updatedAt,
  };
}

export type ActorForTeam = {
  userId: string;
  /** Accepted role on this operator. */
  role: UserRole;
  email?: string | null;
};

function requireOperator(store: TeamDealStore, operatorId: string) {
  const op = store.operators.operators.get(operatorId);
  if (!op) {
    throw new TeamError("Operator not found.", 404);
  }
  return op;
}

function getMemberOrThrow(store: TeamDealStore, memberId: string): TeamMember {
  const m = store.operators.teamMembers.get(memberId);
  if (!m) {
    throw new TeamError("Team member not found.", 404);
  }
  return m;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function assertCanManageOwners(actor: ActorForTeam, targetRole: UserRole): void {
  if (targetRole === "owner" && actor.role !== "owner") {
    throw new TeamError(
      "Only owners can create or change owner roles.",
      403,
      { code: "owner_required" }
    );
  }
}

function assertActorIsOwnerForOwnerTarget(
  actor: ActorForTeam,
  member: TeamMember,
  nextRole?: UserRole
): void {
  if (member.role === "owner" && actor.role !== "owner") {
    throw new TeamError(
      "Only owners can change or remove owners.",
      403,
      { code: "owner_required" }
    );
  }
  if (nextRole === "owner" && actor.role !== "owner") {
    throw new TeamError(
      "Only owners can create or change owner roles.",
      403,
      { code: "owner_required" }
    );
  }
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export function listOperatorTeam(
  store: TeamDealStore,
  operatorId: string
): TeamMember[] {
  requireOperator(store, operatorId);
  return listTeamMembers(store.operators, operatorId).sort((a, b) => {
    const rank = (r: UserRole) =>
      r === "owner" ? 0 : r === "manager" ? 1 : 2;
    const byRole = rank(a.role) - rank(b.role);
    if (byRole !== 0) return byRole;
    return a.invitedEmail.localeCompare(b.invitedEmail);
  });
}

// ---------------------------------------------------------------------------
// Invite
// ---------------------------------------------------------------------------

export type InviteTeamMemberInput = {
  email: string;
  role: UserRole;
};

export async function inviteTeamMember(
  store: TeamDealStore,
  operatorId: string,
  actor: ActorForTeam,
  input: InviteTeamMemberInput,
  options?: { now?: string; secret?: string; origin?: string }
): Promise<IssuedTeamInvite> {
  const op = requireOperator(store, operatorId);
  const now = options?.now ?? new Date().toISOString();

  const emailRaw = typeof input.email === "string" ? input.email : "";
  if (!isValidBookingEmail(emailRaw)) {
    throw new TeamError("A valid email is required.", 400, {
      errors: [{ field: "email", message: "invalid email" }],
    });
  }
  if (!isUserRole(input.role)) {
    throw new TeamError("Invalid role.", 400, {
      errors: [{ field: "role", message: "invalid value" }],
    });
  }
  assertCanManageOwners(actor, input.role);

  const email = normalizeEmail(emailRaw);
  const existing = listTeamMembers(store.operators, operatorId).find(
    (m) => normalizeEmail(m.invitedEmail) === email
  );

  let member: TeamMember;

  if (existing) {
    if (existing.inviteStatus === "accepted") {
      throw new TeamError(
        "That email is already on the team.",
        409,
        { code: "already_member", errors: [{ field: "email", message: "already a member" }] }
      );
    }
    if (existing.inviteStatus === "pending") {
      throw new TeamError(
        "An invite is already pending for that email. Use resend.",
        409,
        {
          code: "invite_pending",
          errors: [{ field: "email", message: "invite already pending" }],
        }
      );
    }
    // Revoked → reactivate as pending with new role
    assertCanManageOwners(actor, input.role);
    member = {
      ...existing,
      role: input.role,
      inviteStatus: "pending",
      userId: null,
      invitedAt: now,
      updatedAt: now,
      lastActiveAt: null,
    };
    store.operators.teamMembers.set(member.id, member);
  } else {
    member = {
      id: crypto.randomUUID(),
      operatorId,
      userId: null,
      role: input.role,
      invitedEmail: email,
      inviteStatus: "pending",
      invitedAt: now,
      lastActiveAt: null,
      createdAt: now,
      updatedAt: now,
    };
    store.operators.teamMembers.set(member.id, member);
  }

  const issued = issueTokenForMember(store, member, {
    now,
    secret: options?.secret,
  });

  const inviteUrl = buildTeamInviteAbsoluteUrl(issued.rawToken, {
    origin: options?.origin,
  });
  await inviteEmailSender({
    to: email,
    operatorName: op.tradingName,
    role: member.role,
    inviteUrl,
    invitedByEmail: actor.email ?? null,
  });

  return issued;
}

// ---------------------------------------------------------------------------
// Role change / remove / revoke / resend
// ---------------------------------------------------------------------------

export function updateTeamMemberRole(
  store: TeamDealStore,
  memberId: string,
  actor: ActorForTeam,
  role: UserRole,
  options?: { now?: string }
): TeamMember {
  const member = getMemberOrThrow(store, memberId);
  requireOperator(store, member.operatorId);
  const now = options?.now ?? new Date().toISOString();

  if (!isUserRole(role)) {
    throw new TeamError("Invalid role.", 400, {
      errors: [{ field: "role", message: "invalid value" }],
    });
  }
  if (member.inviteStatus === "revoked") {
    throw new TeamError("Cannot change role on a revoked invite.", 409);
  }

  assertActorIsOwnerForOwnerTarget(actor, member, role);

  const members = listTeamMembers(store.operators, member.operatorId);
  try {
    const next = applyTeamMemberChange(members, memberId, { role });
    const updated = next.find((m) => m.id === memberId)!;
    const saved: TeamMember = { ...updated, updatedAt: now };
    store.operators.teamMembers.set(memberId, saved);
    return saved;
  } catch (err) {
    if (err instanceof LastOwnerError) {
      throw new TeamError(
        "Operator must have at least one accepted owner.",
        409,
        { code: "last_owner" }
      );
    }
    if (err instanceof OperatorValidationError) {
      throw new TeamError(err.message, 400, { errors: err.errors });
    }
    throw err;
  }
}

export function deleteTeamMember(
  store: TeamDealStore,
  memberId: string,
  actor: ActorForTeam,
  options?: { now?: string }
): void {
  const member = getMemberOrThrow(store, memberId);
  requireOperator(store, member.operatorId);
  const now = options?.now ?? new Date().toISOString();

  assertActorIsOwnerForOwnerTarget(actor, member);

  // Prevent removing yourself when you are the only accepted owner (covered by LastOwnerError)
  const members = listTeamMembers(store.operators, member.operatorId);
  try {
    removeTeamMember(members, memberId);
  } catch (err) {
    if (err instanceof LastOwnerError) {
      throw new TeamError(
        "Operator must have at least one accepted owner.",
        409,
        { code: "last_owner" }
      );
    }
    throw err;
  }

  const tokens = ensureTeamInviteTokenMap(store);
  revokeOpenTokensForMember(tokens, memberId, now);
  store.operators.teamMembers.delete(memberId);
}

export function revokeTeamInvite(
  store: TeamDealStore,
  memberId: string,
  actor: ActorForTeam,
  options?: { now?: string }
): TeamMember {
  const member = getMemberOrThrow(store, memberId);
  requireOperator(store, member.operatorId);
  const now = options?.now ?? new Date().toISOString();

  if (member.inviteStatus !== "pending") {
    throw new TeamError("Only pending invites can be revoked.", 409, {
      code: "not_pending",
    });
  }
  assertActorIsOwnerForOwnerTarget(actor, member);

  const members = listTeamMembers(store.operators, member.operatorId);
  try {
    const next = applyTeamMemberChange(members, memberId, {
      inviteStatus: "revoked",
    });
    const updated = next.find((m) => m.id === memberId)!;
    const saved: TeamMember = { ...updated, updatedAt: now };
    store.operators.teamMembers.set(memberId, saved);
    revokeOpenTokensForMember(ensureTeamInviteTokenMap(store), memberId, now);
    return saved;
  } catch (err) {
    if (err instanceof LastOwnerError) {
      throw new TeamError(
        "Operator must have at least one accepted owner.",
        409,
        { code: "last_owner" }
      );
    }
    throw err;
  }
}

export async function resendTeamInvite(
  store: TeamDealStore,
  memberId: string,
  actor: ActorForTeam,
  options?: { now?: string; secret?: string; origin?: string }
): Promise<IssuedTeamInvite> {
  const member = getMemberOrThrow(store, memberId);
  const op = requireOperator(store, member.operatorId);
  const now = options?.now ?? new Date().toISOString();

  if (member.inviteStatus !== "pending") {
    throw new TeamError("Only pending invites can be resent.", 409, {
      code: "not_pending",
    });
  }
  assertActorIsOwnerForOwnerTarget(actor, member);
  assertCanManageOwners(actor, member.role);

  const issued = issueTokenForMember(store, member, {
    now,
    secret: options?.secret,
  });
  // Bump invited_at so "last invited" is fresh
  const refreshed: TeamMember = {
    ...member,
    invitedAt: now,
    updatedAt: now,
  };
  store.operators.teamMembers.set(member.id, refreshed);
  issued.member = refreshed;

  const inviteUrl = buildTeamInviteAbsoluteUrl(issued.rawToken, {
    origin: options?.origin,
  });
  await inviteEmailSender({
    to: member.invitedEmail,
    operatorName: op.tradingName,
    role: member.role,
    inviteUrl,
    invitedByEmail: actor.email ?? null,
  });

  return issued;
}

// ---------------------------------------------------------------------------
// Accept invite
// ---------------------------------------------------------------------------

export type TeamInvitePreview = {
  operatorId: string;
  operatorName: string;
  role: UserRole;
  invitedEmail: string;
  inviteStatus: InviteStatus;
  expiresAt: string;
  expired: boolean;
  used: boolean;
  revoked: boolean;
};

function resolveInviteTokenRecord(
  store: TeamDealStore,
  rawToken: string,
  options?: { secret?: string; now?: string }
): {
  record: TeamInviteTokenRecord;
  member: TeamMember;
  expired: boolean;
  used: boolean;
  revoked: boolean;
} {
  const verified = verifyTeamInviteRawToken(rawToken, {
    secret: options?.secret,
  });
  if (!verified) {
    throw new TeamError("Invalid invite link.", 404, { code: "invalid_token" });
  }
  const tokens = ensureTeamInviteTokenMap(store);
  const record = tokens.get(verified.tokenId);
  if (!record || record.tokenHash !== hashTeamInviteToken(rawToken)) {
    throw new TeamError("Invalid invite link.", 404, { code: "invalid_token" });
  }
  const member = store.operators.teamMembers.get(record.teamMemberId);
  if (!member) {
    throw new TeamError("Invite is no longer valid.", 404, {
      code: "member_gone",
    });
  }
  const now = options?.now ?? new Date().toISOString();
  const expired = Date.parse(record.expiresAt) <= Date.parse(now);
  const used = record.usedAt != null;
  const revoked =
    record.revokedAt != null || member.inviteStatus === "revoked";
  return { record, member, expired, used, revoked };
}

export function getTeamInvitePreview(
  store: TeamDealStore,
  rawToken: string,
  options?: { secret?: string; now?: string }
): TeamInvitePreview {
  const { record, member, expired, used, revoked } = resolveInviteTokenRecord(
    store,
    rawToken,
    options
  );
  const op = requireOperator(store, member.operatorId);
  return {
    operatorId: member.operatorId,
    operatorName: op.tradingName,
    role: member.role,
    invitedEmail: member.invitedEmail,
    inviteStatus: member.inviteStatus,
    expiresAt: record.expiresAt,
    expired,
    used,
    revoked,
  };
}

export function acceptTeamInvite(
  store: TeamDealStore,
  rawToken: string,
  user: { id: string; email?: string | null },
  options?: { secret?: string; now?: string }
): TeamMember {
  const now = options?.now ?? new Date().toISOString();
  const { record, member, expired, used, revoked } = resolveInviteTokenRecord(
    store,
    rawToken,
    { ...options, now }
  );

  if (used) {
    throw new TeamError("This invite has already been used.", 410, {
      code: "used",
    });
  }
  if (revoked || member.inviteStatus === "revoked") {
    throw new TeamError("This invite was revoked.", 410, { code: "revoked" });
  }
  if (expired) {
    throw new TeamError("This invite has expired.", 410, { code: "expired" });
  }
  if (member.inviteStatus === "accepted") {
    throw new TeamError("This invite has already been accepted.", 410, {
      code: "already_accepted",
    });
  }

  const userEmail = user.email ? normalizeEmail(user.email) : "";
  if (!userEmail || userEmail !== normalizeEmail(member.invitedEmail)) {
    throw new TeamError(
      "Sign in with the invited email address to accept this invite.",
      403,
      { code: "email_mismatch" }
    );
  }

  // Another accepted membership for this user on the same operator?
  const conflict = listTeamMembers(store.operators, member.operatorId).find(
    (m) =>
      m.id !== member.id &&
      m.userId === user.id &&
      m.inviteStatus === "accepted"
  );
  if (conflict) {
    throw new TeamError("You are already a member of this operator.", 409, {
      code: "already_member",
    });
  }

  const accepted: TeamMember = {
    ...member,
    userId: user.id,
    inviteStatus: "accepted",
    lastActiveAt: now,
    updatedAt: now,
  };
  store.operators.teamMembers.set(accepted.id, accepted);

  const tokens = ensureTeamInviteTokenMap(store);
  tokens.set(record.id, { ...record, usedAt: now });
  revokeOpenTokensForMember(tokens, member.id, now);

  seedPrefsForNewMember(store, user.id, member.operatorId, now);

  return accepted;
}

// ---------------------------------------------------------------------------
// last_active_at (throttled)
// ---------------------------------------------------------------------------

/**
 * Update last_active_at for an accepted member when they hit an authenticated
 * API. No-ops if missing, not accepted, or updated within LAST_ACTIVE_THROTTLE_MS.
 */
export function touchTeamMemberLastActive(
  store: TeamDealStore,
  operatorId: string,
  userId: string,
  options?: { now?: string; throttleMs?: number }
): TeamMember | null {
  const now = options?.now ?? new Date().toISOString();
  const throttleMs = options?.throttleMs ?? LAST_ACTIVE_THROTTLE_MS;
  const member = listTeamMembers(store.operators, operatorId).find(
    (m) => m.userId === userId && m.inviteStatus === "accepted"
  );
  if (!member) return null;

  if (member.lastActiveAt) {
    const prev = Date.parse(member.lastActiveAt);
    const nowMs = Date.parse(now);
    if (Number.isFinite(prev) && nowMs - prev < throttleMs) {
      return member;
    }
  }

  const updated: TeamMember = {
    ...member,
    lastActiveAt: now,
    updatedAt: now,
  };
  store.operators.teamMembers.set(member.id, updated);
  return updated;
}

/** Process-level hook installed by HTTP store for requirePermission. */
export type LastActiveTouchFn = (
  operatorId: string,
  userId: string
) => void;

let lastActiveTouchFn: LastActiveTouchFn | null = null;

export function setLastActiveTouchHandler(fn: LastActiveTouchFn | null): void {
  lastActiveTouchFn = fn;
}

export function getLastActiveTouchHandler(): LastActiveTouchFn | null {
  return lastActiveTouchFn;
}

export function touchLastActiveIfConfigured(
  operatorId: string,
  userId: string
): void {
  try {
    lastActiveTouchFn?.(operatorId, userId);
  } catch {
    // Never fail the request because last-active tracking failed.
  }
}
