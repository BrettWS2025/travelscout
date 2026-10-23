"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { useOnOperatorHost } from "@/hooks/useOperatorSurface";
import { operatorHref } from "@/lib/hosts";
import {
  ensureOperatorAfterAuth,
  normalizeOperatorBusinessDetails,
  operatorSignupUserMetadata,
  type OperatorBusinessDetails,
} from "@/lib/marketplace/operator-signup";
import {
  authInputClassName,
  authLabelClassName,
  authLinkClassName,
  authPrimaryButtonClassName,
} from "@/components/auth/AuthPageFrame";
import { RegionPicker } from "@/components/RegionPicker";

type Mode = "new" | "existing";

export default function OperatorSignupPage() {
  const router = useRouter();
  const { session, user, isLoading: authLoading } = useAuth();
  const onOperatorHost = useOnOperatorHost();

  const [mode, setMode] = useState<Mode>("new");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [region, setRegion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") === "existing") setMode("existing");
  }, []);

  /** After email confirm + login, finish routing into Inventory. */
  useEffect(() => {
    if (authLoading || loading || info) return;
    if (!user || !session?.access_token) return;
    if (mode !== "new") return;

    let cancelled = false;
    (async () => {
      try {
        const { operator } = await ensureOperatorAfterAuth(
          session.access_token,
          { userMetadata: user.user_metadata as Record<string, unknown> }
        );
        if (!cancelled && operator) {
          router.replace(operatorHref("/account/inventory", onOperatorHost));
        }
      } catch {
        // Stay on the form; user can submit or sign in again.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    authLoading,
    user,
    session?.access_token,
    loading,
    info,
    mode,
    router,
    onOperatorHost,
  ]);

  function businessPayload(): OperatorBusinessDetails | null {
    return normalizeOperatorBusinessDetails({
      name: businessName,
      phone,
      website,
      region,
    });
  }

  async function goToInventory() {
    router.push(operatorHref("/account/inventory", onOperatorHost));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);

    const org = businessPayload();
    if (!org) {
      setError("Please fill in all business details, including a valid region.");
      setLoading(false);
      return;
    }

    try {
      if (mode === "existing") {
        const { data, error: signInError } =
          await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        const token = data.session?.access_token;
        if (!token) throw new Error("Signed in, but no session was returned.");
        // Existing traveler → operator: bootstrap org + inventory operator.
        const { operator } = await ensureOperatorAfterAuth(token, {
          business: org,
          userMetadata: data.user?.user_metadata as
            | Record<string, unknown>
            | undefined,
        });
        if (!operator) {
          throw new Error("Could not set up your operator inventory account.");
        }
        await goToInventory();
        return;
      }

      const name = fullName.trim();
      if (!name) throw new Error("Please enter your full name.");

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: operatorSignupUserMetadata(name, org),
        },
      });
      if (signUpError) throw signUpError;

      if (data.user) {
        await supabase
          .from("profiles")
          .update({ display_name: name, email })
          .eq("id", data.user.id);
      }

      const token = data.session?.access_token;
      if (token) {
        // Trigger usually created org + operator already; ensure is idempotent.
        const { operator } = await ensureOperatorAfterAuth(token, {
          business: org,
          userMetadata: data.user?.user_metadata as
            | Record<string, unknown>
            | undefined,
        });
        if (!operator) {
          throw new Error("Could not set up your operator inventory account.");
        }
        await goToInventory();
        return;
      }

      // Email confirmation required — org + operator are created by the signup
      // trigger from user_metadata. User opens Inventory after verifying.
      setInfo(
        "Account and business created. Check your inbox to verify your email, then sign in to open Inventory."
      );
      setMode("existing");
      setPassword("");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong.";
      setError(
        message
          .replace(/^Failed to create organization:\s*/i, "")
          .replace(/^Failed to create operator:\s*/i, "")
      );
    } finally {
      setLoading(false);
    }
  }

  const existingHref = operatorHref(
    "/operator/signup?mode=existing",
    onOperatorHost
  );
  const newHref = operatorHref("/operator/signup", onOperatorHost);
  const loginHref = operatorHref("/auth/login", onOperatorHost);

  return (
    <div className="ts-page relative min-h-[100svh] bg-[var(--ts-ink)]">
      <div className="grid min-h-[100svh] lg:grid-cols-2">
        <div className="relative hidden min-h-[40vh] overflow-hidden lg:block lg:min-h-[100svh]">
          <Image
            src="/Main_Page_Pic.jpg"
            alt="New Zealand landscape"
            fill
            priority
            className="animate-hero-drift scale-105 object-cover object-center"
            sizes="50vw"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-[var(--ts-ink)]/70 via-[var(--ts-ink)]/35 to-[var(--ts-teal)]/40" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(212,230,67,0.2),transparent_55%)]" />
          <div className="absolute bottom-0 left-0 right-0 p-10 xl:p-14">
            <p className="font-[family-name:var(--font-sora)] text-xs font-semibold uppercase tracking-[0.24em] text-[var(--ts-lime)]">
              For operators
            </p>
            <h1 className="mt-4 max-w-md font-[family-name:var(--font-instrument)] text-4xl leading-[1.08] tracking-tight text-white xl:text-5xl">
              Sell the last few seats.
              <span className="italic text-[var(--ts-lime)]"> Pure profit.</span>
            </h1>
          </div>
        </div>

        <div className="relative flex min-h-[100svh] flex-col justify-center bg-[var(--ts-mist)] px-5 py-28 md:px-10 lg:px-12 xl:px-16">
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            <div className="absolute -right-10 top-24 h-56 w-56 rounded-full bg-[var(--ts-lime)]/20 blur-3xl" />
            <div className="absolute bottom-20 left-0 h-64 w-64 rounded-full bg-[var(--ts-teal)]/12 blur-3xl" />
          </div>

          <div className="relative mx-auto w-full max-w-md animate-hero-rise">
            <p className="mb-3 font-[family-name:var(--font-sora)] text-xs font-semibold uppercase tracking-[0.22em] text-[var(--ts-teal)]">
              Operator signup
            </p>
            <h2 className="font-[family-name:var(--font-instrument)] text-3xl leading-[1.08] tracking-tight text-[var(--ts-ink)] md:text-4xl">
              {mode === "new"
                ? "Create your operator account"
                : "Add your business to an existing account"}
            </h2>
            <p className="mt-3 font-[family-name:var(--font-sora)] text-sm leading-relaxed text-[var(--ts-muted)]">
              {mode === "new"
                ? "Your login and business are set up together — one step, then verify your email."
                : "Sign in with your traveler account, then we’ll attach your business."}
            </p>

            <form onSubmit={onSubmit} className="mt-8 space-y-5">
              {error && (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 font-[family-name:var(--font-sora)] text-sm text-red-700">
                  {error}
                </p>
              )}
              {info && (
                <p className="rounded-xl border border-[var(--ts-teal)]/25 bg-white px-3 py-2 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-ink)]">
                  {info}{" "}
                  <Link href={loginHref} className={authLinkClassName}>
                    Sign in
                  </Link>
                </p>
              )}

              <fieldset className="space-y-3">
                <legend className="font-[family-name:var(--font-sora)] text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ts-muted)]">
                  Your account
                </legend>
                {mode === "new" && (
                  <label className="block space-y-1.5">
                    <span className={authLabelClassName}>Full name</span>
                    <input
                      className={authInputClassName}
                      required
                      autoComplete="name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                  </label>
                )}
                <label className="block space-y-1.5">
                  <span className={authLabelClassName}>Email</span>
                  <input
                    className={authInputClassName}
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className={authLabelClassName}>Password</span>
                  <input
                    className={authInputClassName}
                    type="password"
                    required
                    autoComplete={
                      mode === "new" ? "new-password" : "current-password"
                    }
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
              </fieldset>

              <fieldset className="space-y-3">
                <legend className="font-[family-name:var(--font-sora)] text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ts-muted)]">
                  Your business
                </legend>
                <label className="block space-y-1.5">
                  <span className={authLabelClassName}>Business name</span>
                  <input
                    className={authInputClassName}
                    required
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="Queenstown Jetboats"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className={authLabelClassName}>Phone number</span>
                  <input
                    className={authInputClassName}
                    type="tel"
                    required
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+64 21 000 0000"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className={authLabelClassName}>Website</span>
                  <input
                    className={authInputClassName}
                    type="url"
                    required
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="https://example.com"
                  />
                </label>
                <div className="block space-y-1.5">
                  <span className={authLabelClassName}>Region</span>
                  <div className="rounded-xl border border-[var(--ts-ink)]/12 bg-white">
                    <RegionPicker
                      value={region}
                      onChange={setRegion}
                      variant="light"
                      required
                      placeholder="Select your operating region"
                    />
                  </div>
                </div>
              </fieldset>

              <button
                type="submit"
                disabled={loading}
                className={authPrimaryButtonClassName}
              >
                {loading
                  ? "Setting up…"
                  : mode === "new"
                    ? "Create operator account"
                    : "Sign up as an operator"}
              </button>
            </form>

            <p className="mt-6 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
              {mode === "new" ? (
                <>
                  Already a user?{" "}
                  <Link
                    href={existingHref}
                    className={authLinkClassName}
                    onClick={() => setMode("existing")}
                  >
                    Sign up as an operator as well
                  </Link>
                </>
              ) : (
                <>
                  Need a new account?{" "}
                  <Link
                    href={newHref}
                    className={authLinkClassName}
                    onClick={() => setMode("new")}
                  >
                    Create an operator account
                  </Link>
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
