"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

export function MarketingMain({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isFullBleed =
    pathname === "/" ||
    pathname === "/operator" ||
    pathname === "/find-deals" ||
    pathname === "/how-it-works" ||
    pathname.startsWith("/auth/");

  if (isFullBleed) {
    // overflow-x: clip avoids the CSS quirk where overflow-x:hidden forces
    // overflow-y to auto and clips the hero deal cards that straddle the seam.
    return <main className="relative z-0 overflow-x-clip pb-0 pt-0">{children}</main>;
  }

  return <main className="container relative z-0 pb-10 pt-[120px]">{children}</main>;
}
