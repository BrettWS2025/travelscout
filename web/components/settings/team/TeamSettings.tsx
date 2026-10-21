"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { SettingsSubnav } from "@/components/settings/SettingsSubnav";
import {
  listMyOperators,
  type MyOperator,
} from "@/lib/marketplace/operator-deals-client";
import {
  TeamApiError,
  inviteTeamMemberApi,
  listTeamApi,
  removeTeamMemberApi,
  resendTeamInviteApi,
  revokeTeamInviteApi,
  updateTeamMemberRoleApi,
  type TeamMemberApiRow,
} from "@/lib/marketplace/team-client";
import {
  assignableRoles,
  canChangeMemberRole,
  canManageTeam,
  canRemoveMember,
  canResendOrRevoke,
  fieldErrorMap,
  formatLastActive,
  USER_ROLE_LABELS,
} from "@/lib/marketplace/team-ui";
import type { UserRole } from "@/lib/marketplace/enums";

export function TeamSettings() {
  const { session, isLoading: authLoading } = useAuth();
  const token = session?.access_token ?? null;

  const [operators, setOperators] = useState<MyOperator[]>([]);
  const [operatorId, setOperatorId] = useState<string | null>(null);
  const [members, setMembers] = useState<TeamMemberApiRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("staff");
  const [inviteErrors, setInviteErrors] = useState<Record<string, string>>({});
  const [inviting, setInviting] = useState(false);

  const currentOp = operators.find((o) => o.id === operatorId) ?? null;
  const actorRole = (currentOp?.role ?? null) as UserRole | null;
  const canEdit = canManageTeam(actorRole);
  const roleOptions = actorRole ? assignableRoles(actorRole) : [];

  const loadOperators = useCallback(async () => {
    if (!token) return;
    const res = await listMyOperators(token);
    setOperators(res.operators);
    if (res.operators.length && !operatorId) {
      setOperatorId(res.operators[0]!.id);
    }
  }, [token, operatorId]);

  const loadTeam = useCallback(async () => {
    if (!token || !operatorId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await listTeamApi(operatorId, token);
      setMembers(res.members);
    } catch (err) {
      setError(
        err instanceof TeamApiError ? err.message : "Failed to load team"
      );
    } finally {
      setLoading(false);
    }
  }, [token, operatorId]);

  useEffect(() => {
    if (authLoading || !token) return;
    void loadOperators();
  }, [authLoading, token, loadOperators]);

  useEffect(() => {
    if (!operatorId || !token) return;
    void loadTeam();
  }, [operatorId, token, loadTeam]);

  useEffect(() => {
    if (actorRole && !roleOptions.includes(inviteRole)) {
      setInviteRole(roleOptions[0] ?? "staff");
    }
  }, [actorRole, roleOptions, inviteRole]);

  async function onInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !operatorId || !canEdit) return;
    setInviting(true);
    setInviteErrors({});
    setBanner(null);
    setError(null);
    try {
      const res = await inviteTeamMemberApi(operatorId, token, {
        email: inviteEmail,
        role: inviteRole,
      });
      setInviteEmail("");
      setBanner(`Invite sent to ${res.member.invited_email}.`);
      await loadTeam();
    } catch (err) {
      if (err instanceof TeamApiError) {
        setInviteErrors(fieldErrorMap(err.errors));
        setError(err.message);
      } else {
        setError("Failed to invite");
      }
    } finally {
      setInviting(false);
    }
  }

  async function onRoleChange(member: TeamMemberApiRow, role: string) {
    if (!token || !actorRole) return;
    if (!canChangeMemberRole(actorRole, member as never)) return;
    setBusyId(member.id);
    setError(null);
    setBanner(null);
    try {
      await updateTeamMemberRoleApi(member.id, token, role);
      setBanner(`Updated ${member.invited_email} to ${USER_ROLE_LABELS[role as UserRole] ?? role}.`);
      await loadTeam();
    } catch (err) {
      setError(err instanceof TeamApiError ? err.message : "Failed to update role");
    } finally {
      setBusyId(null);
    }
  }

  async function onRemove(member: TeamMemberApiRow) {
    if (!token || !actorRole) return;
    if (!canRemoveMember(actorRole, member as never)) return;
    if (
      !window.confirm(
        `Remove ${member.invited_email} from the team?`
      )
    ) {
      return;
    }
    setBusyId(member.id);
    setError(null);
    setBanner(null);
    try {
      await removeTeamMemberApi(member.id, token);
      setBanner(`Removed ${member.invited_email}.`);
      await loadTeam();
    } catch (err) {
      setError(err instanceof TeamApiError ? err.message : "Failed to remove");
    } finally {
      setBusyId(null);
    }
  }

  async function onResend(member: TeamMemberApiRow) {
    if (!token || !actorRole) return;
    if (!canResendOrRevoke(actorRole, member as never)) return;
    setBusyId(member.id);
    setError(null);
    setBanner(null);
    try {
      await resendTeamInviteApi(member.id, token);
      setBanner(`Invite resent to ${member.invited_email}.`);
      await loadTeam();
    } catch (err) {
      setError(err instanceof TeamApiError ? err.message : "Failed to resend");
    } finally {
      setBusyId(null);
    }
  }

  async function onRevoke(member: TeamMemberApiRow) {
    if (!token || !actorRole) return;
    if (!canResendOrRevoke(actorRole, member as never)) return;
    setBusyId(member.id);
    setError(null);
    setBanner(null);
    try {
      await revokeTeamInviteApi(member.id, token);
      setBanner(`Invite revoked for ${member.invited_email}.`);
      await loadTeam();
    } catch (err) {
      setError(err instanceof TeamApiError ? err.message : "Failed to revoke");
    } finally {
      setBusyId(null);
    }
  }

  if (authLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
          Loading…
        </p>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
          Sign in to manage your team.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <h1 className="font-[family-name:var(--font-sora)] text-2xl font-semibold text-[var(--ts-ink)]">
          Settings
        </h1>
        <p className="mt-1 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
          Invite teammates and manage roles. There must always be at least one
          owner.
        </p>
      </div>

      <SettingsSubnav />

      {operators.length > 1 ? (
        <div className="mt-6">
          <label
            htmlFor="team-operator"
            className="block font-[family-name:var(--font-sora)] text-xs font-semibold text-[var(--ts-muted)]"
          >
            Operator
          </label>
          <select
            id="team-operator"
            className="mt-1 w-full max-w-sm rounded-xl border border-[var(--ts-ink)]/15 bg-white px-3 py-2.5 font-[family-name:var(--font-sora)] text-sm"
            value={operatorId ?? ""}
            onChange={(e) => setOperatorId(e.target.value)}
          >
            {operators.map((op) => (
              <option key={op.id} value={op.id}>
                {op.tradingName}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {banner ? (
        <p
          className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 font-[family-name:var(--font-sora)] text-sm text-emerald-800"
          role="status"
        >
          {banner}
        </p>
      ) : null}
      {error ? (
        <p
          className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 font-[family-name:var(--font-sora)] text-sm text-red-700"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {canEdit ? (
        <form
          onSubmit={onInvite}
          className="mt-6 rounded-2xl border border-[var(--ts-ink)]/10 bg-white/80 p-4"
        >
          <h2 className="font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--ts-ink)]">
            Invite someone
          </h2>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label
                htmlFor="invite-email"
                className="block font-[family-name:var(--font-sora)] text-xs font-semibold text-[var(--ts-muted)]"
              >
                Email
              </label>
              <input
                id="invite-email"
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[var(--ts-ink)]/15 bg-white px-3 py-2.5 font-[family-name:var(--font-sora)] text-sm"
                placeholder="name@example.com"
              />
              {inviteErrors.email ? (
                <p className="mt-1 text-xs text-red-600">{inviteErrors.email}</p>
              ) : null}
            </div>
            <div className="sm:w-40">
              <label
                htmlFor="invite-role"
                className="block font-[family-name:var(--font-sora)] text-xs font-semibold text-[var(--ts-muted)]"
              >
                Role
              </label>
              <select
                id="invite-role"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as UserRole)}
                className="mt-1 w-full rounded-xl border border-[var(--ts-ink)]/15 bg-white px-3 py-2.5 font-[family-name:var(--font-sora)] text-sm"
              >
                {roleOptions.map((r) => (
                  <option key={r} value={r}>
                    {USER_ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={inviting}
              className="rounded-xl bg-[var(--ts-ink)] px-4 py-2.5 font-[family-name:var(--font-sora)] text-sm font-semibold text-white disabled:opacity-60"
            >
              {inviting ? "Sending…" : "Send invite"}
            </button>
          </div>
        </form>
      ) : (
        <p className="mt-6 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
          You can view the team. Ask an owner or manager to invite people.
        </p>
      )}

      <div className="mt-8 overflow-x-auto">
        <table className="min-w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-[var(--ts-ink)]/10">
              <th className="py-2 pr-4 font-[family-name:var(--font-sora)] text-xs font-semibold uppercase tracking-wide text-[var(--ts-muted)]">
                Member
              </th>
              <th className="py-2 pr-4 font-[family-name:var(--font-sora)] text-xs font-semibold uppercase tracking-wide text-[var(--ts-muted)]">
                Role
              </th>
              <th className="py-2 pr-4 font-[family-name:var(--font-sora)] text-xs font-semibold uppercase tracking-wide text-[var(--ts-muted)]">
                Status
              </th>
              <th className="py-2 pr-4 font-[family-name:var(--font-sora)] text-xs font-semibold uppercase tracking-wide text-[var(--ts-muted)]">
                Last active
              </th>
              {canEdit ? (
                <th className="py-2 font-[family-name:var(--font-sora)] text-xs font-semibold uppercase tracking-wide text-[var(--ts-muted)]">
                  Actions
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={canEdit ? 5 : 4}
                  className="py-6 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]"
                >
                  Loading team…
                </td>
              </tr>
            ) : members.length === 0 ? (
              <tr>
                <td
                  colSpan={canEdit ? 5 : 4}
                  className="py-6 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]"
                >
                  No team members yet.
                </td>
              </tr>
            ) : (
              members.map((m) => {
                const busy = busyId === m.id;
                const showRoleSelect =
                  canEdit &&
                  actorRole &&
                  canChangeMemberRole(actorRole, m as never) &&
                  m.invite_status !== "revoked";
                return (
                  <tr
                    key={m.id}
                    className="border-b border-[var(--ts-ink)]/5 align-middle"
                  >
                    <td className="py-3 pr-4 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-ink)]">
                      {m.invited_email}
                    </td>
                    <td className="py-3 pr-4">
                      {showRoleSelect ? (
                        <select
                          aria-label={`Role for ${m.invited_email}`}
                          disabled={busy}
                          value={m.role}
                          onChange={(e) => onRoleChange(m, e.target.value)}
                          className="rounded-lg border border-[var(--ts-ink)]/15 bg-white px-2 py-1.5 font-[family-name:var(--font-sora)] text-sm"
                        >
                          {assignableRoles(actorRole!).map((r) => (
                            <option key={r} value={r}>
                              {USER_ROLE_LABELS[r]}
                            </option>
                          ))}
                          {/* Keep current owner visible even if manager somehow views */}
                          {!assignableRoles(actorRole!).includes(
                            m.role as UserRole
                          ) ? (
                            <option value={m.role}>
                              {m.role_label || m.role}
                            </option>
                          ) : null}
                        </select>
                      ) : (
                        <span className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-ink)]">
                          {m.role_label || m.role}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
                      {m.invite_status_label || m.invite_status}
                    </td>
                    <td className="py-3 pr-4 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
                      {formatLastActive(m.last_active_at)}
                    </td>
                    {canEdit && actorRole ? (
                      <td className="py-3">
                        <div className="flex flex-wrap gap-2">
                          {canResendOrRevoke(actorRole, m as never) ? (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void onResend(m)}
                                className="font-[family-name:var(--font-sora)] text-xs font-semibold text-[var(--ts-ink)] underline-offset-2 hover:underline disabled:opacity-50"
                              >
                                Resend
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void onRevoke(m)}
                                className="font-[family-name:var(--font-sora)] text-xs font-semibold text-[var(--ts-muted)] underline-offset-2 hover:underline disabled:opacity-50"
                              >
                                Revoke
                              </button>
                            </>
                          ) : null}
                          {canRemoveMember(actorRole, m as never) ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void onRemove(m)}
                              className="font-[family-name:var(--font-sora)] text-xs font-semibold text-red-700 underline-offset-2 hover:underline disabled:opacity-50"
                            >
                              Remove
                            </button>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
