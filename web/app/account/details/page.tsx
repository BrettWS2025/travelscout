"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { useIsOperatorProfile } from "@/components/account/useIsOperatorProfile";
import {
  ensureUserProfile,
  type ProfileRow,
} from "@/lib/profiles";
import {
  listMyOrganizations,
  updateOrganization,
} from "@/lib/marketplace/client";
import type { Organization } from "@/lib/marketplace/types";
import {
  authInputClassName,
  authLabelClassName,
  authPanelClassName,
  authPrimaryButtonClassName,
  authSecondaryButtonClassName,
} from "@/components/auth/AuthPageFrame";

export default function AccountDetailsPage() {
  const { user, session, isLoading } = useAuth();
  const { isOperatorProfile, isLoading: operatorLoading } =
    useIsOperatorProfile();

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [fullName, setFullName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [orgPhone, setOrgPhone] = useState("");
  const [orgRegion, setOrgRegion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [resetLoading, setResetLoading] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || operatorLoading) return;

    (async () => {
      setLoading(true);
      setError(null);
      setSaved(false);

      try {
        const p = await ensureUserProfile(user);
        setProfile(p);

        const metaName =
          (user.user_metadata?.full_name as string | undefined) ??
          (user.user_metadata?.name as string | undefined) ??
          "";
        setFullName(p.display_name ?? metaName ?? "");

        if (isOperatorProfile) {
          const { organizations } = await listMyOrganizations(
            session?.access_token
          );
          const org = organizations[0] ?? null;
          setOrganization(org);
          setOrgName(org?.name ?? "");
          setOrgPhone(org?.phone ?? "");
          setOrgRegion(org?.region ?? "");
        } else {
          setOrganization(null);
          setOrgName("");
          setOrgPhone("");
          setOrgRegion("");
        }
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "Could not load your profile."
        );
        setProfile(null);
        setOrganization(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [user, session?.access_token, isOperatorProfile, operatorLoading]);

  async function handleSaveProfile() {
    if (!user) return;

    setLoading(true);
    setError(null);
    setSaved(false);

    const name = fullName.trim() || null;

    try {
      await ensureUserProfile(user);

      const { error: updateError } = await supabase
        .from("profiles")
        .upsert(
          {
            id: user.id,
            email: user.email ?? profile?.email ?? null,
            display_name: name,
          },
          { onConflict: "id" }
        );

      if (updateError) throw updateError;

      setProfile((prev) =>
        prev
          ? { ...prev, display_name: name, email: user.email ?? prev.email }
          : {
              id: user.id,
              email: user.email ?? null,
              display_name: name,
            }
      );

      if (isOperatorProfile && organization) {
        const trimmedName = orgName.trim();
        if (!trimmedName) {
          throw new Error("Organisation name is required.");
        }

        const { organization: updated } = await updateOrganization(
          organization.id,
          {
            name: trimmedName,
            phone: orgPhone.trim(),
            region: orgRegion.trim(),
          },
          session?.access_token
        );
        setOrganization(updated);
        setOrgName(updated.name);
        setOrgPhone(updated.phone ?? "");
        setOrgRegion(updated.region ?? "");
      }

      setSaved(true);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Could not save your profile."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSendPasswordReset() {
    setResetMsg(null);
    setResetError(null);

    const email = profile?.email ?? user?.email;
    if (!email) {
      setResetError("No email found for this account.");
      return;
    }

    setResetLoading(true);

    try {
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/auth/reset-password`
          : undefined;

      const { error: resetPasswordError } =
        await supabase.auth.resetPasswordForEmail(email, {
          redirectTo,
        });

      if (resetPasswordError) throw resetPasswordError;

      setResetMsg(
        "Password reset email sent. Open the link in your email to set a new password."
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Could not send password reset email.";
      setResetError(message);
    } finally {
      setResetLoading(false);
    }
  }

  const busy = loading || isLoading || operatorLoading;

  return (
    <div className="space-y-6">
      <h2 className="font-[family-name:var(--font-instrument)] text-3xl text-[var(--ts-ink)]">
        Account details
      </h2>

      <div className={authPanelClassName}>
        <div className="space-y-2">
          <label className={authLabelClassName} htmlFor="fullName">
            Full name
          </label>
          <input
            id="fullName"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={authInputClassName}
            disabled={busy}
          />
        </div>

        <div className="space-y-2">
          <label className={authLabelClassName}>Email</label>
          <div className={`${authInputClassName} bg-[var(--ts-mist)]/60`}>
            {profile?.email ?? user?.email ?? "—"}
          </div>
        </div>

        {isOperatorProfile && (
          <>
            <div className="border-t border-[var(--ts-ink)]/8 pt-4">
              <p className="mb-4 font-[family-name:var(--font-sora)] text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ts-teal)]">
                Organisation
              </p>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className={authLabelClassName} htmlFor="orgName">
                    Organisation name
                  </label>
                  <input
                    id="orgName"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    className={authInputClassName}
                    disabled={busy || !organization}
                  />
                </div>
                <div className="space-y-2">
                  <label className={authLabelClassName} htmlFor="orgPhone">
                    Phone
                  </label>
                  <input
                    id="orgPhone"
                    type="tel"
                    value={orgPhone}
                    onChange={(e) => setOrgPhone(e.target.value)}
                    className={authInputClassName}
                    disabled={busy || !organization}
                  />
                </div>
                <div className="space-y-2">
                  <label className={authLabelClassName} htmlFor="orgRegion">
                    Region
                  </label>
                  <input
                    id="orgRegion"
                    value={orgRegion}
                    onChange={(e) => setOrgRegion(e.target.value)}
                    className={authInputClassName}
                    disabled={busy || !organization}
                  />
                </div>
              </div>
            </div>
            {!organization && !busy && (
              <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
                No organisation is linked to this account yet.
              </p>
            )}
          </>
        )}

        {error && (
          <p className="font-[family-name:var(--font-sora)] text-sm text-red-600">
            {error}
          </p>
        )}
        {saved && (
          <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-teal)]">
            Saved.
          </p>
        )}

        <button
          type="button"
          onClick={handleSaveProfile}
          disabled={busy}
          className={authPrimaryButtonClassName}
        >
          {loading ? "Saving…" : "Save changes"}
        </button>

        <div className="border-t border-[var(--ts-ink)]/8 pt-4">
          <button
            type="button"
            onClick={handleSendPasswordReset}
            disabled={resetLoading}
            className={authSecondaryButtonClassName}
          >
            {resetLoading ? "Sending…" : "Reset password"}
          </button>
          {resetError && (
            <p className="mt-3 font-[family-name:var(--font-sora)] text-sm text-red-600">
              {resetError}
            </p>
          )}
          {resetMsg && (
            <p className="mt-3 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-teal)]">
              {resetMsg}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
