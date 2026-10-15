"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AccountNav } from "@/components/account/AccountNav";
import { useIsOperatorProfile } from "@/components/account/useIsOperatorProfile";
import { useAuth } from "@/components/AuthProvider";

const OPERATOR_ONLY_PREFIXES = ["/account/inventory", "/account/settings"];

export default function AccountLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading } = useAuth();
  const { isOperatorProfile, isLoading: operatorLoading } =
    useIsOperatorProfile();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/auth/login?returnTo=/account/details");
      return;
    }

    if (operatorLoading) return;

    if (
      !isOperatorProfile &&
      OPERATOR_ONLY_PREFIXES.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
      )
    ) {
      router.replace("/account/details");
    }
  }, [
    user,
    isLoading,
    router,
    isOperatorProfile,
    operatorLoading,
    pathname,
  ]);

  if (isLoading || !user) {
    return (
      <div className="py-10 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
        Loading…
      </div>
    );
  }

  return (
    <div className="ts-page pb-6">
      <div className="mb-8">
        <h1 className="font-[family-name:var(--font-instrument)] text-4xl leading-tight text-[var(--ts-ink)] md:text-5xl">
          Account
        </h1>
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
