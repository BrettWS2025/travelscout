"use client";

import Link from "next/link";
import { useOnOperatorHost } from "@/hooks/useOperatorSurface";

export function HeroOperatorSignup() {
  const onOperatorHost = useOnOperatorHost();
  const returnTo = onOperatorHost ? "/" : "/operator";
  const signupHref = `/auth/login?mode=signup&returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <div className="mx-auto w-full max-w-xl text-center">
      {/* Mirror the home hero search shell so mobile gets the same full-width CTA treatment */}
      <div className="rounded-2xl border border-white/20 bg-white/12 p-2 shadow-[0_20px_50px_rgba(0,0,0,0.25)] backdrop-blur-md">
        <Link
          href={signupHref}
          className="inline-flex w-full items-center justify-center rounded-xl bg-[var(--ts-lime)] px-5 py-3 font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--ts-ink)] transition hover:brightness-105"
        >
          Sign up
        </Link>
      </div>
      <p className="mt-4 font-[family-name:var(--font-sora)] text-sm font-medium tracking-wide text-white/80 md:text-base">
        first 2 months free
      </p>
    </div>
  );
}
