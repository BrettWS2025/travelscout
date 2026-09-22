"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { X } from "lucide-react";
import {
  authInputClassName,
  authLabelClassName,
  authLinkClassName,
  authPrimaryButtonClassName,
  authSecondaryButtonClassName,
} from "@/components/auth/AuthPageFrame";

type AuthModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  context?: "add-to-itinerary" | "pin-event" | "save-itinerary";
};

export default function AuthModal({
  isOpen,
  onClose,
  onSuccess,
  context = "save-itinerary",
}: AuthModalProps) {
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

  if (!isOpen) return null;

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
          onSuccess();
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

        // If signup is successful and user is immediately logged in, call onSuccess
        // Otherwise show info message to check email
        if (data.session) {
          setTimeout(() => {
            onSuccess();
          }, 100);
        } else {
          setInfo(
            "Account created. Check your inbox to verify before signing in"
          );
          setMode("login");
          setPassword("");
        }
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

  const title =
    mode === "login"
      ? context === "add-to-itinerary"
        ? "Sign in to add to itinerary"
        : context === "pin-event"
          ? "Sign in to pin event"
          : "Sign in to save"
      : "Create an account";

  const description =
    mode === "login"
      ? context === "add-to-itinerary"
        ? "Please sign in to add this experience to your itinerary."
        : context === "pin-event"
          ? "Please sign in to pin this event to your itinerary."
          : "Please sign in to save your itinerary."
      : context === "add-to-itinerary"
        ? "Create an account to add experiences to your itinerary."
        : context === "pin-event"
          ? "Create an account to pin events to your itinerary."
          : "Create an account to save your itinerary.";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[var(--ts-ink)]/45 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-[var(--ts-ink)]/10 bg-[var(--bg)] shadow-[0_24px_60px_rgba(16,36,28,0.18)]">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[var(--ts-lime)]/30 blur-3xl" />
          <div className="absolute -bottom-12 -left-8 h-44 w-44 rounded-full bg-[var(--ts-teal)]/20 blur-3xl" />
        </div>

        <div className="relative p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="mb-1 font-[family-name:var(--font-sora)] text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--ts-teal)]">
                {mode === "login" ? "Welcome back" : "Join TravelScout"}
              </p>
              <h3 className="font-[family-name:var(--font-instrument)] text-2xl leading-tight text-[var(--ts-ink)] md:text-[1.75rem]">
                {title}
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--ts-ink)]/10 bg-white text-[var(--ts-ink)] transition hover:bg-[var(--ts-mist)]"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="mb-6 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
            {description}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
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
            <div className="mt-4 space-y-3 rounded-xl border border-[var(--ts-ink)]/10 bg-white/80 p-4">
              <div>
                <div className="font-[family-name:var(--font-instrument)] text-xl text-[var(--ts-ink)]">
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

          <div className="mt-5 text-center">
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
        </div>
      </div>
    </div>
  );
}
