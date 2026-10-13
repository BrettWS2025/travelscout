"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useOnOperatorHost } from "@/hooks/useOperatorSurface";

export function OperatorMain({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const onOperatorHost = useOnOperatorHost();
  const isLanding =
    pathname === "/operator" || (onOperatorHost && pathname === "/");
  const isSignup =
    pathname === "/operator/signup" ||
    (onOperatorHost && (pathname === "/signup" || pathname.startsWith("/signup/")));
  const isAuth = pathname.startsWith("/auth/");

  if (isLanding || isSignup || isAuth) {
    return (
      <main className="relative z-0 overflow-x-hidden pb-0 pt-0">{children}</main>
    );
  }

  return <main className="relative z-0">{children}</main>;
}
