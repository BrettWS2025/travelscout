"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { useOnOperatorHost } from "@/hooks/useOperatorSurface";
import { operatorHref } from "@/lib/hosts";
import { createOrganization } from "@/lib/marketplace/client";
import type { CreateOrganizationInput } from "@/lib/marketplace/types";
import {
  authInputClassName,
  authLabelClassName,
  authLinkClassName,
  authPrimaryButtonClassName,
} from "@/components/auth/AuthPageFrame";

const PENDING_ORG_KEY = "ts_pending_operator_org";

type Mode = "new" | "existing";

type PendingOrg = Pick<
  CreateOrganizationInput,
  "name" | "phone" | "website" | "region"
>;

function readPendingOrg(): PendingOrg | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PENDING_ORG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingOrg;
    if (!parsed?.name || !parsed?.phone || !parsed?.website || !parsed?.region) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writePendingOrg(org: PendingOrg) {
  sessionStorage.setItem(PENDING_ORG_KEY, JSON.stringify(org));
}

function clearPendingOrg() {
  sessionStorage.removeItem(PENDING_ORG_KEY);
}

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
  const [finishingPending, setFinishingPending] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") === "existing") setMode("existing");
  }, []);

  useEffect(() => {
    if (authLoading || finishingPending) return;
    if (!user || !session?.access_token) return;

    const pending = readPendingOrg();
    if (!pending) return;

    let cancelled = false;
    (async () => {
      setFinishingPending(true);
      setError(null);
      setInfo(null);
      try {
        const { organization } = await createOrganization(
          pending,
          session.access_token
        );
        clearPendingOrg();
        if (!cancelled) {
          router.replace(
            operatorHref(
              `/operator/organizations/${organization.id}`,
              onOperatorHost
            )
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not finish setting up your business."
          );
          setFinishingPending(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    authLoading,
    user,
    session?.access_token,
    finishingPending,
    router,
    onOperatorHost,
  ]);

  function businessPayload(): PendingOrg {
    return {
      name: businessName.trim(),
      phone: phone.trim(),
      website: website.trim(),
      region: region.trim(),
    };
  }

  async function createOrgAndGo(accessToken: string, org: PendingOrg) {
    const { organization } = await createOrganization(org, accessToken);
    clearPendingOrg();
    router.push(
      operatorHref(`/operator/organizations/${organization.id}`, onOperatorHost)
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);

    const org = businessPayload();
    if (!org.name || !org.phone || !org.website || !org.region) {
      setError("Please fill in all business details.");
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
        await createOrgAndGo(token, org);
        return;
      }

      const name = fullName.trim();
      if (!name) throw new Error("Please enter your full name.");

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name,
            account_type: "operator",
          },
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
        await createOrgAndGo(token, org);
        return;
      }

      // Email confirmation required — finish org setup after verify + login.
      writePendingOrg(org);
      setInfo(
        "Account created. Check your inbox to verify your email, then sign in with the link below to finish operator setup."
      );
      setMode("existing");
      setPassword("");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong.";
      // Strip duplicated "Failed to create organization:" prefix if present
      setError(message.replace(/^Failed to create organization:\s*/i, ""));
    } finally {
      setLoading(false);
    }
  }

  const existingHref = operatorHref("/operator/signup?mode=existing", onOperatorHost);
  const newHref = operatorHref("/operator/signup", onOperatorHost);

  return (
    <div className="ts-page relative min-h-[100svh] bg-[var(--ts-ink)]">
      <div className="grid min-h-[100svh] lg:grid-cols-2">
        {/* Left: hero visual */}
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

        {/* Right: form */}
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
                ? "Your login and business are set up together — ready to publish deals."
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
                  {info}
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
                <label className="block space-y-1.5">
                  <span className={authLabelClassName}>Region</span>
                  <input
                    className={authInputClassName}
                    required
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    placeholder="Queenstown"
                  />
                </label>
              </fieldset>

              <button
                type="submit"
                disabled={loading || finishingPending}
                className={authPrimaryButtonClassName}
              >
                {loading || finishingPending
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
                  <Link href={existingHref} className={authLinkClassName} onClick={() => setMode("existing")}>
                    Sign up as an operator as well
                  </Link>
                </>
              ) : (
                <>
                  Need a new account?{" "}
                  <Link href={newHref} className={authLinkClassName} onClick={() => setMode("new")}>
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
