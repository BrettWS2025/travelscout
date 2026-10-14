"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AccountNav } from "@/components/account/AccountNav";
import { useAuth } from "@/components/AuthProvider";
import { useIsOperatorSurface } from "@/components/SiteSurfaceContext";

const OPERATOR_ONLY_PREFIXES = ["/account/inventory", "/account/settings"];

export default function AccountLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading } = useAuth();
  const isOperatorSurface = useIsOperatorSurface();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/auth/login?returnTo=/account/details");
      return;
    }

    // Regular travelers should not reach operator-only account sections.
    if (
      !isOperatorSurface &&
      OPERATOR_ONLY_PREFIXES.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
      )
    ) {
      router.replace("/account/details");
    }
  }, [user, isLoading, router, isOperatorSurface, pathname]);

  if (isLoading || !user) {
    return (
      <div className="py-10 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
        Loading your account…
      </div>
    );
  }

  return (
    <div className="ts-page pb-6">
      <div className="mb-8 max-w-3xl">
        <p className="font-[family-name:var(--font-sora)] text-xs font-semibold uppercase tracking-[0.22em] text-[var(--ts-teal)]">
          {isOperatorSurface ? "Operator account" : "Your account"}
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-instrument)] text-4xl leading-tight text-[var(--ts-ink)] md:text-5xl">
          {isOperatorSurface ? (
            <>
              Your <span className="italic text-[var(--ts-teal)]">workspace</span>
            </>
          ) : (
            <>
              Account <span className="italic text-[var(--ts-teal)]">details</span>
            </>
          )}
        </h1>
        <p className="mt-3 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)] md:text-base">
          {isOperatorSurface
            ? "Manage your profile, inventory, and account settings."
            : "Manage your profile and sign-in details."}
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)] md:gap-10 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="md:sticky md:top-28 md:self-start">
          <AccountNav />
        </aside>
        <section className="min-w-0">{children}</section>
      </div>
    </div>
  );
}
