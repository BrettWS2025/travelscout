"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { useIsOperatorProfile } from "@/components/account/useIsOperatorProfile";
import {
  ensureUserProfile,
  type ProfileRow,
} from "@/lib/profiles";
import { listMyOperators } from "@/lib/marketplace/operator-deals-client";
import {
  getOperatorProfileApi,
  patchOperatorProfileApi,
  type OperatorProfileRow,
} from "@/lib/marketplace/operator-profile-client";
import {
  authInputClassName,
  authLabelClassName,
  authPanelClassName,
  authPrimaryButtonClassName,
  authSecondaryButtonClassName,
} from "@/components/auth/AuthPageFrame";
import { RegionPicker } from "@/components/RegionPicker";
import { canonicalizeRegion } from "@/lib/regions";

export default function AccountDetailsPage() {
  const { user, session, isLoading } = useAuth();
  const { isOperatorProfile, isLoading: operatorLoading } =
    useIsOperatorProfile();

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [operator, setOperator] = useState<OperatorProfileRow | null>(null);
  const [operatorReadOnly, setOperatorReadOnly] = useState(false);
  const [fullName, setFullName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [businessRegion, setBusinessRegion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [resetLoading, setResetLoading] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || operatorLoading) return;

    (async () => {
      setLoading(true);
      setError(null);
      setSaved(false);

      try {
        const p = await ensureUserProfile(user);
        setProfile(p);

        const metaName =
          (user.user_metadata?.full_name as string | undefined) ??
          (user.user_metadata?.name as string | undefined) ??
          "";
        setFullName(p.display_name ?? metaName ?? "");

        if (isOperatorProfile) {
          const { operators } = await listMyOperators(session?.access_token);
          const first = operators[0] ?? null;
          if (first) {
            const { operator: op, read_only } = await getOperatorProfileApi(
              first.id,
              session?.access_token
            );
            setOperator(op);
            setOperatorReadOnly(read_only);
            setBusinessName(op.trading_name ?? "");
            setBusinessPhone(op.public_phone ?? "");
            setBusinessRegion(op.regions_served?.[0] ?? "");
          } else {
            setOperator(null);
            setOperatorReadOnly(false);
            setBusinessName("");
            setBusinessPhone("");
            setBusinessRegion("");
          }
        } else {
          setOperator(null);
          setOperatorReadOnly(false);
          setBusinessName("");
          setBusinessPhone("");
          setBusinessRegion("");
        }
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "Could not load your profile."
        );
        setProfile(null);
        setOperator(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [user, session?.access_token, isOperatorProfile, operatorLoading]);

  async function handleSaveProfile() {
    if (!user) return;

    setLoading(true);
    setError(null);
    setSaved(false);

    const name = fullName.trim() || null;

    try {
      await ensureUserProfile(user);

      const { error: updateError } = await supabase
        .from("profiles")
        .upsert(
          {
            id: user.id,
            email: user.email ?? profile?.email ?? null,
            display_name: name,
          },
          { onConflict: "id" }
        );

      if (updateError) throw updateError;

      setProfile((prev) =>
        prev
          ? { ...prev, display_name: name, email: user.email ?? prev.email }
          : {
              id: user.id,
              email: user.email ?? null,
              display_name: name,
            }
      );

      if (isOperatorProfile && operator && !operatorReadOnly) {
        const trimmedName = businessName.trim();
        if (!trimmedName) {
          throw new Error("Business name is required.");
        }
        const canonicalRegion = canonicalizeRegion(businessRegion);
        if (!canonicalRegion) {
          throw new Error("Please select a valid New Zealand region.");
        }

        // Operator profile requires E.164 (+6421…); strip spaces/dashes from entry.
        const rawPhone = businessPhone.trim();
        const normalizedPhone = rawPhone
          ? rawPhone.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "")
          : "";

        const { operator: updated } = await patchOperatorProfileApi(
          operator.id,
          {
            trading_name: trimmedName,
            legal_name: trimmedName,
            public_phone: normalizedPhone || null,
            regions_served: [canonicalRegion],
          },
          session?.access_token
        );
        setOperator(updated);
        setBusinessName(updated.trading_name);
        setBusinessPhone(updated.public_phone ?? "");
        setBusinessRegion(updated.regions_served?.[0] ?? "");
      }

      setSaved(true);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Could not save your profile."
      );
    } finally {
      setLoading(false);
    }
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
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/auth/reset-password`
          : undefined;

      const { error: resetPasswordError } =
        await supabase.auth.resetPasswordForEmail(email, {
          redirectTo,
        });

      if (resetPasswordError) throw resetPasswordError;

      setResetMsg(
        "Password reset email sent. Open the link in your email to set a new password."
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Could not send password reset email.";
      setResetError(message);
    } finally {
      setResetLoading(false);
    }
  }

  const busy = loading || isLoading || operatorLoading;
  const businessDisabled = busy || !operator || operatorReadOnly;

  return (
    <div className="space-y-6">
      <h2 className="font-[family-name:var(--font-instrument)] text-3xl text-[var(--ts-ink)]">
        Account details
      </h2>

      <div className={authPanelClassName}>
        <div className="space-y-2">
          <label className={authLabelClassName} htmlFor="fullName">
            Full name
          </label>
          <input
            id="fullName"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={authInputClassName}
            disabled={busy}
          />
        </div>

        <div className="space-y-2">
          <label className={authLabelClassName}>Email</label>
          <div className={`${authInputClassName} bg-[var(--ts-mist)]/60`}>
            {profile?.email ?? user?.email ?? "—"}
          </div>
        </div>

        {isOperatorProfile && (
          <>
            <div className="border-t border-[var(--ts-ink)]/8 pt-4">
              <p className="mb-4 font-[family-name:var(--font-sora)] text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ts-teal)]">
                Business
              </p>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className={authLabelClassName} htmlFor="businessName">
                    Business name
                  </label>
                  <input
                    id="businessName"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className={authInputClassName}
                    disabled={businessDisabled}
                  />
                </div>
                <div className="space-y-2">
                  <label className={authLabelClassName} htmlFor="businessPhone">
                    Phone
                  </label>
                  <input
                    id="businessPhone"
                    type="tel"
                    value={businessPhone}
                    onChange={(e) => setBusinessPhone(e.target.value)}
                    className={authInputClassName}
                    disabled={businessDisabled}
                  />
                </div>
                <div className="space-y-2">
                  <label className={authLabelClassName} htmlFor="businessRegion">
                    Region
                  </label>
                  <div
                    className={`${authInputClassName} !p-0 overflow-hidden ${
                      businessDisabled ? "opacity-60" : ""
                    }`}
                  >
                    <RegionPicker
                      id="businessRegion"
                      value={businessRegion}
                      onChange={setBusinessRegion}
                      variant="light"
                      disabled={businessDisabled}
                      required
                      placeholder="Select your operating region"
                    />
                  </div>
                </div>
              </div>
              <p className="mt-3 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
                For logo, website, and the full public profile, use{" "}
                <Link
                  href="/account/settings/business-profile"
                  className="text-[var(--ts-teal)] underline-offset-2 hover:underline"
                >
                  Settings → Business profile
                </Link>
                .
              </p>
            </div>
            {!operator && !busy && (
              <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
                No business profile is linked to this account yet. Sign in again
                from the operator signup page if setup did not finish.
              </p>
            )}
            {operator && operatorReadOnly && !busy && (
              <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
                Your role can view business details but not edit them.
              </p>
            )}
          </>
        )}

        {error && (
          <p className="font-[family-name:var(--font-sora)] text-sm text-red-600">
            {error}
          </p>
        )}
        {saved && (
          <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-teal)]">
            Saved.
          </p>
        )}

        <button
          type="button"
          onClick={handleSaveProfile}
          disabled={busy || (isOperatorProfile && operatorReadOnly)}
          className={authPrimaryButtonClassName}
        >
          {loading ? "Saving…" : "Save changes"}
        </button>

        <div className="border-t border-[var(--ts-ink)]/8 pt-4">
          <button
            type="button"
            onClick={handleSendPasswordReset}
            disabled={resetLoading}
            className={authSecondaryButtonClassName}
          >
            {resetLoading ? "Sending…" : "Reset password"}
          </button>
          {resetError && (
            <p className="mt-3 font-[family-name:var(--font-sora)] text-sm text-red-600">
              {resetError}
            </p>
          )}
          {resetMsg && (
            <p className="mt-3 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-teal)]">
              {resetMsg}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
