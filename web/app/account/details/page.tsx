"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import {
  authInputClassName,
  authLabelClassName,
  authPanelClassName,
  authPrimaryButtonClassName,
  authSecondaryButtonClassName,
} from "@/components/auth/AuthPageFrame";

type ProfileRow = {
  id: string;
  email: string | null;
  display_name: string | null;
};

export default function AccountDetailsPage() {
  const { user, isLoading } = useAuth();

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [resetLoading, setResetLoading] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    (async () => {
      setLoading(true);
      setError(null);
      setSaved(false);

      const { data, error: fetchError } = await supabase
        .from("profiles")
        .select("id,email,display_name")
        .eq("id", user.id)
        .single();

      if (fetchError) {
        setError(fetchError.message);
        setProfile(null);
        setLoading(false);
        return;
      }

      const p = data as ProfileRow;
      setProfile(p);

      const metaName =
        (user.user_metadata?.full_name as string | undefined) ??
        (user.user_metadata?.name as string | undefined) ??
        "";

      setFullName(p.display_name ?? metaName ?? "");
      setLoading(false);
    })();
  }, [user]);

  async function handleSaveProfile() {
    if (!user) return;

    setLoading(true);
    setError(null);
    setSaved(false);

    const name = fullName.trim() || null;

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ display_name: name })
      .eq("id", user.id);

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    setSaved(true);
    setLoading(false);
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-[family-name:var(--font-instrument)] text-3xl text-[var(--ts-ink)]">
          Account details
        </h2>
        <p className="mt-1 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
          Your profile information for this account.
        </p>
      </div>

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
            disabled={loading || isLoading}
          />
        </div>

        <div className="space-y-2">
          <label className={authLabelClassName}>Email</label>
          <div className={`${authInputClassName} bg-[var(--ts-mist)]/60`}>
            {profile?.email ?? user?.email ?? "—"}
          </div>
        </div>

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
          disabled={loading || isLoading}
          className={authPrimaryButtonClassName}
        >
          {loading ? "Saving…" : "Save changes"}
        </button>

        <div className="border-t border-[var(--ts-ink)]/8 pt-4">
          <p className="mb-3 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
            Need a new password? We&apos;ll email you a reset link.
          </p>
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
