"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import {
  TeamApiError,
  acceptTeamInviteApi,
  getTeamInvitePreviewApi,
  type TeamInvitePreview,
} from "@/lib/marketplace/team-client";
import { USER_ROLE_LABELS } from "@/lib/marketplace/team-ui";
import type { UserRole } from "@/lib/marketplace/enums";

export function TeamInviteAccept({ token }: { token: string }) {
  const { session, user, isLoading: authLoading } = useAuth();
  const accessToken = session?.access_token ?? null;

  const [invite, setInvite] = useState<TeamInvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getTeamInvitePreviewApi(token);
      setInvite(res.invite);
    } catch (err) {
      setInvite(null);
      setError(
        err instanceof TeamApiError ? err.message : "Invite not found"
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onAccept() {
    if (!accessToken) return;
    setAccepting(true);
    setError(null);
    try {
      await acceptTeamInviteApi(token, accessToken);
      setAccepted(true);
    } catch (err) {
      setError(
        err instanceof TeamApiError ? err.message : "Failed to accept invite"
      );
    } finally {
      setAccepting(false);
    }
  }

  const blocked =
    invite && (invite.expired || invite.used || invite.revoked);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-4 py-12">
      <h1 className="font-[family-name:var(--font-sora)] text-2xl font-semibold text-[var(--ts-ink)]">
        Team invite
      </h1>

      {loading ? (
        <p className="mt-4 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
          Loading invite…
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

      {accepted && invite ? (
        <div className="mt-6 space-y-3">
          <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-ink)]">
            You joined <strong>{invite.operatorName}</strong> as{" "}
            {USER_ROLE_LABELS[invite.role as UserRole] ?? invite.role}.
          </p>
          <Link
            href="/account/inventory"
            className="inline-flex rounded-xl bg-[var(--ts-ink)] px-4 py-2.5 font-[family-name:var(--font-sora)] text-sm font-semibold text-white"
          >
            Go to inventory
          </Link>
        </div>
      ) : null}

      {!loading && invite && !accepted ? (
        <div className="mt-6 space-y-4">
          <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-ink)]">
            You&apos;ve been invited to{" "}
            <strong>{invite.operatorName}</strong> as{" "}
            <strong>
              {USER_ROLE_LABELS[invite.role as UserRole] ?? invite.role}
            </strong>
            .
          </p>
          <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
            Invited email: {invite.invitedEmail}
          </p>

          {blocked ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 font-[family-name:var(--font-sora)] text-sm text-amber-900">
              {invite.revoked
                ? "This invite was revoked."
                : invite.used
                  ? "This invite has already been used."
                  : "This invite has expired. Ask an owner or manager to resend."}
            </p>
          ) : null}

          {authLoading ? (
            <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
              Checking sign-in…
            </p>
          ) : !accessToken ? (
            <div className="space-y-2">
              <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
                Sign in with <strong>{invite.invitedEmail}</strong> to accept.
              </p>
              <Link
                href={`/auth/login?next=${encodeURIComponent(`/team/invite/${encodeURIComponent(token)}`)}`}
                className="inline-flex rounded-xl bg-[var(--ts-ink)] px-4 py-2.5 font-[family-name:var(--font-sora)] text-sm font-semibold text-white"
              >
                Sign in
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
                Signed in as {user?.email ?? "your account"}.
              </p>
              <button
                type="button"
                disabled={accepting || Boolean(blocked)}
                onClick={() => void onAccept()}
                className="rounded-xl bg-[var(--ts-ink)] px-4 py-2.5 font-[family-name:var(--font-sora)] text-sm font-semibold text-white disabled:opacity-60"
              >
                {accepting ? "Accepting…" : "Accept invite"}
              </button>
            </div>
          )}
        </div>
      ) : null}

      {!loading && !invite && !error ? (
        <p className="mt-4 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
          Invite not found.{" "}
          <Link href="/auth/login" className="underline">
            Sign in
          </Link>
        </p>
      ) : null}
    </div>
  );
}
