"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * OperatorMain only mounts inside the operator SiteShell, so `/` is always the
 * operator landing (on the subdomain) and must stay full-bleed. Do not gate on
 * useOnOperatorHost() here — that is false during SSR and can leave the hero
 * trapped inside `.container` (narrow cream gutters).
 */
export function OperatorMain({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/";
  const isLanding = pathname === "/" || pathname === "/operator";
  const isSignup =
    pathname === "/signup" ||
    pathname.startsWith("/signup/") ||
    pathname === "/operator/signup" ||
    pathname.startsWith("/operator/signup/");
  const isAuth = pathname.startsWith("/auth/");

  if (isLanding || isSignup || isAuth) {
    return (
      <main className="relative z-0 w-full overflow-x-clip pb-0 pt-0">
        {children}
      </main>
    );
  }

  return (
    <main className="container relative z-0 pb-10 pt-8 md:pt-10">{children}</main>
  );
}
