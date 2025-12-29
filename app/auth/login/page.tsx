"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();

  const [mode, setMode] = useState<"login" | "signup">("login");

  // Signup-only
  const [fullName, setFullName] = useState("");

  // Login/signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Forgot password flow
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMsg, setForgotMsg] = useState<string | null>(null);
  const [forgotError, setForgotError] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const redirectTo = "/account/itineraries";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;

        router.push(redirectTo);
      } else {
        const name = fullName.trim();
        if (!name) throw new Error("Please enter your full name.");

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name },
          },
        });

        if (error) throw error;

        // Best-effort update to profiles (may not run if confirm-email is enabled)
        if (data.user) {
          await supabase
            .from("profiles")
            .update({ display_name: name, email })
            .eq("id", data.user.id);
        }

        setInfo(
          "Account created. If email confirmation is enabled, check your inbox to verify before signing in."
        );

        setMode("login");
        setPassword("");
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message ?? "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setForgotError(null);
    setForgotMsg(null);

    const em = email.trim();
    if (!em) {
      setForgotError("Enter your email above first, then click Send reset email.");
      return;
    }

    setForgotLoading(true);
    try {
      const redirectToUrl =
        typeof window !== "undefined"
          ? `${window.location.origin}/auth/reset-password`
          : undefined;

      const { error } = await supabase.auth.resetPasswordForEmail(em, {
        redirectTo: redirectToUrl,
      });

      if (error) throw error;

      setForgotMsg(
        "Reset email sent. Check your inbox for a link to set a new password."
      );
    } catch (err: any) {
      console.error(err);
      setForgotError(err?.message ?? "Could not send reset email.");
    } finally {
      setForgotLoading(false);
    }
  }

  return (
    <main className="container max-w-md py-12">
      <h1 className="text-3xl font-semibold mb-2">
        {mode === "login" ? "Sign in" : "Create an account"}
      </h1>
      <p className="text-sm text-white/70 mb-6">
        {mode === "login"
          ? "Use your email and password to sign in."
          : "Create an account with your name, email and password."}
      </p>

      <form onSubmit={handleSubmit} className="space-y-4 card p-6">
        {mode === "signup" && (
          <div className="space-y-2">
            <label className="block text-sm font-medium" htmlFor="fullName">
              Full name
            </label>
            <input
              id="fullName"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded border border-white/10 bg-white/5 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              placeholder="e.g. Brett Strawbridge"
            />
          </div>
        )}

        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded border border-white/10 bg-white/5 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="password">
            Password
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

        {mode === "login" && (
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setForgotOpen((v) => !v);
                setForgotMsg(null);
                setForgotError(null);
              }}
              className="text-sm text-[var(--accent)] hover:underline"
            >
              Forgot password?
            </button>

            {/* Optional: keep layout balanced */}
            <span className="text-xs text-white/60">
              {/* Could put a hint here if you want */}
            </span>
          </div>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}
        {info && <p className="text-sm text-emerald-300">{info}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60"
        >
          {loading
            ? mode === "login"
              ? "Signing in..."
              : "Creating account..."
            : mode === "login"
            ? "Sign in"
            : "Create account"}
        </button>
      </form>

      {/* Forgot password panel */}
      {mode === "login" && forgotOpen && (
        <div className="mt-4 card p-6 space-y-3">
          <div>
            <div className="font-semibold">Reset your password</div>
            <p className="text-sm text-white/70">
              We’ll email you a link to set a new password.
            </p>
          </div>

          <form onSubmit={handleForgotPassword} className="space-y-3">
            {forgotError && <p className="text-sm text-red-400">{forgotError}</p>}
            {forgotMsg && <p className="text-sm text-emerald-300">{forgotMsg}</p>}

            <button
              type="submit"
              disabled={forgotLoading}
              className="w-full rounded px-4 py-2 text-sm font-semibold hover:bg-white/10 disabled:opacity-60"
              style={{
                border: "1px solid rgba(255,255,255,0.12)",
              }}
            >
              {forgotLoading ? "Sending…" : "Send reset email"}
            </button>

            <button
              type="button"
              onClick={() => {
                setForgotOpen(false);
                setForgotMsg(null);
                setForgotError(null);
              }}
              className="w-full rounded px-4 py-2 text-sm hover:bg-white/10"
            >
              Close
            </button>
          </form>
        </div>
      )}

      <div className="mt-4 text-sm">
        {mode === "login" ? (
          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setError(null);
              setInfo(null);
              setForgotOpen(false);
              setForgotMsg(null);
              setForgotError(null);
            }}
            className="text-[var(--accent)] hover:underline"
          >
            Don&apos;t have an account? Create one
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setError(null);
              setInfo(null);
            }}
            className="text-[var(--accent)] hover:underline"
          >
            Already have an account? Sign in
          </button>
        )}
      </div>
    </main>
  );
}
