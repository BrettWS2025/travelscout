"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthProvider";

type ProfileRow = {
  id: string;
  email: string | null;
  display_name: string | null;
};

export default function ProfilePage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  const [profile, setProfile] = useState<ProfileRow | null>(null);

  // Full name
  const [fullName, setFullName] = useState("");

  // UI status
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Password reset (email flow)
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!user) router.push("/auth/login");
  }, [user, isLoading, router]);

  useEffect(() => {
    if (!user) return;

    (async () => {
      setLoading(true);
      setError(null);
      setSaved(false);

      const { data, error } = await supabase
        .from("profiles")
        .select("id,email,display_name")
        .eq("id", user.id)
        .single();

      if (error) {
        setError(error.message);
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

    const { error } = await supabase
      .from("profiles")
      .update({ display_name: name })
      .eq("id", user.id);

    if (error) {
      setError(error.message);
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
      // Important: this must be a URL allowed in Supabase Auth settings.
      // In dev, usually: http://localhost:3000/auth/reset-password
      // In prod: https://yourdomain.com/auth/reset-password
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/auth/reset-password`
          : undefined;

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      });

      if (error) throw error;

      setResetMsg(
        "Password reset email sent. Open the link in your email to set a new password."
      );
    } catch (err: any) {
      setResetError(err?.message ?? "Could not send password reset email.");
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <main className="container max-w-xl py-10">
      <h1 className="text-3xl font-semibold">Profile</h1>
      <p className="mt-2 text-sm text-white/70">
        Manage your account details.
      </p>

      <div className="mt-6 card p-6 space-y-5">
        {/* Full name FIRST */}
        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="fullName">
            Full name
          </label>
          <input
            id="fullName"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="e.g. Brett Strawbridge"
            className="w-full rounded border border-white/10 bg-white/5 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
        </div>

        {/* Email (unchangeable) */}
        <div className="space-y-2">
          <label className="block text-sm font-medium">Email</label>
          <div className="rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80">
            {profile?.email ?? user?.email ?? "—"}
          </div>
        </div>

        {/* Save profile */}
        {error && <p className="text-sm text-red-400">{error}</p>}
        {saved && <p className="text-sm text-emerald-300">Saved.</p>}

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => router.push("/account/itineraries")}
            className="rounded px-4 py-2 text-sm hover:bg-white/10"
            disabled={loading}
          >
            Back
          </button>
          <button
            type="button"
            onClick={handleSaveProfile}
            disabled={loading || isLoading}
            className="rounded bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60"
          >
            {loading ? "Saving…" : "Save"}
          </button>
        </div>

        {/* Password reset section */}
        <div className="border-t border-white/10 pt-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold">Password</div>
              <div className="text-sm text-white/70">
                Reset your password via email.
              </div>
            </div>

            <button
              type="button"
              onClick={handleSendPasswordReset}
              disabled={resetLoading}
              className="rounded px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-60"
            >
              {resetLoading ? "Sending…" : "Reset password"}
            </button>
          </div>

          {resetError && <p className="mt-3 text-sm text-red-400">{resetError}</p>}
          {resetMsg && <p className="mt-3 text-sm text-emerald-300">{resetMsg}</p>}
        </div>
      </div>
    </main>
  );
}
