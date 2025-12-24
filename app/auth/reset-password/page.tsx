"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

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
      const { data } = await supabase.auth.getSession();
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
      <main className="container max-w-md py-12">
        <p className="text-sm text-white/70">Loading…</p>
      </main>
    );
  }

  return (
    <main className="container max-w-md py-12">
      <h1 className="text-3xl font-semibold mb-2">Set a new password</h1>
      <p className="text-sm text-white/70 mb-6">
        Enter a new password for your account.
      </p>

      <form onSubmit={handleSetPassword} className="space-y-4 card p-6">
        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="password">
            New password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded border border-white/10 bg-white/5 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="confirm">
            Confirm new password
          </label>
          <input
            id="confirm"
            type="password"
            required
            minLength={6}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full rounded border border-white/10 bg-white/5 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}
        {success && <p className="text-sm text-emerald-300">{success}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60"
        >
          {loading ? "Updating…" : "Update password"}
        </button>
      </form>
    </main>
  );
}
