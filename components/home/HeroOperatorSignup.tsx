"use client";

import Link from "next/link";
import { useOnOperatorHost } from "@/hooks/useOperatorSurface";

export function HeroOperatorSignup() {
  const onOperatorHost = useOnOperatorHost();
  const returnTo = onOperatorHost ? "/" : "/operator";
  const signupHref = `/auth/login?mode=signup&returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <div className="mx-auto w-full max-w-xl text-center">
      <Link
        href={signupHref}
        className="inline-flex items-center justify-center rounded-xl bg-[var(--ts-lime)] px-8 py-3.5 font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--ts-ink)] shadow-[0_20px_50px_rgba(0,0,0,0.25)] transition hover:brightness-105"
      >
        Sign up
      </Link>
      <p className="mt-4 font-[family-name:var(--font-sora)] text-sm font-medium tracking-wide text-white/80 md:text-base">
        first 2 months free
      </p>
    </div>
  );
}
