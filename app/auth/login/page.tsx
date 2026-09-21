"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useOnOperatorHost } from "@/hooks/useOperatorSurface";
import {
  AuthPageFrame,
  authInputClassName,
  authLabelClassName,
  authLinkClassName,
  authPanelClassName,
  authPrimaryButtonClassName,
  authSecondaryButtonClassName,
} from "@/components/auth/AuthPageFrame";

export default function LoginPage() {
  const router = useRouter();
  const onOperatorHost = useOnOperatorHost();
  const [redirectTo, setRedirectTo] = useState(
    onOperatorHost ? "/" : "/account/itineraries"
  );

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

  // Get return URL / auth mode from query params on client side
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const returnTo = params.get("returnTo");
      const modeParam = params.get("mode");
      if (modeParam === "signup" || modeParam === "login") {
        setMode(modeParam);
      }
      if (returnTo) {
        setRedirectTo(decodeURIComponent(returnTo));
      } else if (onOperatorHost) {
        setRedirectTo("/");
      }
    }
  }, [onOperatorHost]);

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

        // Small delay to ensure auth state is updated
        setTimeout(() => {
          router.push(redirectTo);
        }, 100);
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
          "Account created. Check your inbox to verify before signing in"
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

  const description = onOperatorHost
    ? mode === "login"
      ? "Sign in to manage your operator organizations and last-minute deals."
      : "Create an operator account to publish deals on TravelScout."
    : mode === "login"
      ? "Use your email and password to sign in."
      : "Create an account with your name, email and password.";

  return (
    <AuthPageFrame
      eyebrow={mode === "login" ? "Welcome back" : "Join TravelScout"}
      title={
        mode === "login" ? (
          <>
            Sign in{" "}
            <span className="italic text-[var(--ts-teal)]">to continue.</span>
          </>
        ) : (
          <>
            Create your{" "}
            <span className="italic text-[var(--ts-teal)]">account.</span>
          </>
        )
      }
      description={description}
    >
      <form onSubmit={handleSubmit} className={authPanelClassName}>
        {mode === "signup" && (
          <div className="space-y-2">
            <label className={authLabelClassName} htmlFor="fullName">
              Full name
            </label>
            <input
              id="fullName"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={authInputClassName}
              placeholder="e.g. John Smith"
            />
          </div>
        )}

        <div className="space-y-2">
          <label className={authLabelClassName} htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={authInputClassName}
          />
        </div>

        <div className="space-y-2">
          <label className={authLabelClassName} htmlFor="password">
            Password
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

        {mode === "login" && (
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setForgotOpen((v) => !v);
                setForgotMsg(null);
                setForgotError(null);
              }}
              className={authLinkClassName}
            >
              Forgot password?
            </button>
          </div>
        )}

        {error && (
          <p className="font-[family-name:var(--font-sora)] text-sm text-red-600">
            {error}
          </p>
        )}
        {info && (
          <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-teal)]">
            {info}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className={authPrimaryButtonClassName}
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

      {mode === "login" && forgotOpen && (
        <div className={`mt-4 ${authPanelClassName}`}>
          <div>
            <div className="font-[family-name:var(--font-instrument)] text-2xl text-[var(--ts-ink)]">
              Reset your password
            </div>
            <p className="mt-1 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
              We&apos;ll email you a link to set a new password.
            </p>
          </div>

          <form onSubmit={handleForgotPassword} className="space-y-3">
            {forgotError && (
              <p className="font-[family-name:var(--font-sora)] text-sm text-red-600">
                {forgotError}
              </p>
            )}
            {forgotMsg && (
              <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-teal)]">
                {forgotMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={forgotLoading}
              className={authPrimaryButtonClassName}
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
              className={authSecondaryButtonClassName}
            >
              Close
            </button>
          </form>
        </div>
      )}

      <div className="mt-6 text-center">
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
            className={authLinkClassName}
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
            className={authLinkClassName}
          >
            Already have an account? Sign in
          </button>
        )}
      </div>
    </AuthPageFrame>
  );
}
