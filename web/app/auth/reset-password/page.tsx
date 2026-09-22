"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import {
  AuthPageFrame,
  authInputClassName,
  authLabelClassName,
  authPanelClassName,
  authPrimaryButtonClassName,
} from "@/components/auth/AuthPageFrame";

export default function ResetPasswordPage() {
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // If the user arrived via the Supabase reset link,
  // Supabase will establish a recovery session automatically.
  useEffect(() => {
    let mounted = true;

    (async () => {
      await supabase.auth.getSession();
      // session may exist if the link was valid; either way allow form submission
      if (mounted) setReady(true);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Password and confirmation do not match.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      setSuccess("Password updated. You can now sign in.");
      setPassword("");
      setConfirm("");

      // Send them somewhere sensible
      setTimeout(() => {
        router.push("/auth/login");
      }, 800);
    } catch (err: any) {
      setError(err?.message ?? "Could not update password.");
    } finally {
      setLoading(false);
    }
  }

  if (!ready) {
    return (
      <AuthPageFrame
        eyebrow="Account"
        title={
          <>
            Almost{" "}
            <span className="italic text-[var(--ts-teal)]">there.</span>
          </>
        }
        description="Loading your password reset session…"
      >
        <div className={authPanelClassName}>
          <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
            Loading…
          </p>
        </div>
      </AuthPageFrame>
    );
  }

  return (
    <AuthPageFrame
      eyebrow="Account"
      title={
        <>
          Set a new{" "}
          <span className="italic text-[var(--ts-teal)]">password.</span>
        </>
      }
      description="Enter a new password for your account."
    >
      <form onSubmit={handleSetPassword} className={authPanelClassName}>
        <div className="space-y-2">
          <label className={authLabelClassName} htmlFor="password">
            New password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={authInputClassName}
          />
        </div>

        <div className="space-y-2">
          <label className={authLabelClassName} htmlFor="confirm">
            Confirm new password
          </label>
          <input
            id="confirm"
            type="password"
            required
            minLength={6}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={authInputClassName}
          />
        </div>

        {error && (
          <p className="font-[family-name:var(--font-sora)] text-sm text-red-600">
            {error}
          </p>
        )}
        {success && (
          <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-teal)]">
            {success}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className={authPrimaryButtonClassName}
        >
          {loading ? "Updating…" : "Update password"}
        </button>
      </form>
    </AuthPageFrame>
  );
}
