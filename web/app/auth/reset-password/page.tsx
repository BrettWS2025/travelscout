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

  // Recovery links establish a session automatically — keep the user signed in.
  useEffect(() => {
    let mounted = true;

    (async () => {
      await supabase.auth.getSession();
      if (mounted) setReady(true);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

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
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });
      if (updateError) throw updateError;

      // Session is already valid after updateUser — go straight into the app.
      router.replace("/account/details");
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Could not update password."
      );
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
        description="Preparing your session…"
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
      description="Choose a new password to continue."
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

        <button
          type="submit"
          disabled={loading}
          className={authPrimaryButtonClassName}
        >
          {loading ? "Saving…" : "Save and continue"}
        </button>
      </form>
    </AuthPageFrame>
  );
}
