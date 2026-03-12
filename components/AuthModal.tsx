"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { X } from "lucide-react";

type AuthModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  context?: "add-to-itinerary" | "pin-event" | "save-itinerary";
};

export default function AuthModal({ isOpen, onClose, onSuccess, context = "save-itinerary" }: AuthModalProps) {
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

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-[#1E2C4B] border border-white/10 shadow-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">
            {mode === "login" 
              ? context === "add-to-itinerary" 
                ? "Sign in to add to itinerary"
                : context === "pin-event"
                ? "Sign in to pin event"
                : "Sign in to save"
              : "Create an account"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/15 flex items-center justify-center"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        <p className="text-sm text-white/70 mb-6">
          {mode === "login"
            ? context === "add-to-itinerary"
              ? "Please sign in to add this experience to your itinerary."
              : context === "pin-event"
              ? "Please sign in to pin this event to your itinerary."
              : "Please sign in to save your itinerary."
            : context === "add-to-itinerary"
            ? "Create an account to add experiences to your itinerary."
            : context === "pin-event"
            ? "Create an account to pin events to your itinerary."
            : "Create an account to save your itinerary."}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-white" htmlFor="fullName">
                Full name
              </label>
              <input
                id="fullName"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-[var(--accent)]"
                placeholder="e.g. John Smith"
              />
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-sm font-medium text-white" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-[var(--accent)]"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-white" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-[var(--accent)]"
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
            </div>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}
          {info && <p className="text-sm text-emerald-300">{info}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 transition-all hover:brightness-110 shadow-lg hover:shadow-xl"
            style={{ 
              background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)",
            }}
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
          <div className="mt-4 rounded-lg bg-white/5 border border-white/10 p-4 space-y-3">
            <div>
              <div className="font-semibold text-white">Reset your password</div>
              <p className="text-sm text-white/70">
                We'll email you a link to set a new password.
              </p>
            </div>

            <form onSubmit={handleForgotPassword} className="space-y-3">
              {forgotError && <p className="text-sm text-red-400">{forgotError}</p>}
              {forgotMsg && <p className="text-sm text-emerald-300">{forgotMsg}</p>}

              <button
                type="submit"
                disabled={forgotLoading}
                className="w-full rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-2 text-sm font-semibold text-white hover:from-emerald-600 hover:to-teal-700 disabled:opacity-60 transition-colors"
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
                className="w-full rounded-lg px-4 py-2 text-sm border border-white/10 hover:bg-white/10 text-white"
              >
                Close
              </button>
            </form>
          </div>
        )}

        <div className="mt-4 text-sm text-center">
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
      </div>
    </div>
  );
}
