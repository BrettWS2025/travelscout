"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { useOnOperatorHost } from "@/hooks/useOperatorSurface";

export function OperatorSiteChrome() {
  const { user } = useAuth();
  const pathname = usePathname();
  const onOperatorHost = useOnOperatorHost();
  const isLanding =
    pathname === "/operator" || (onOperatorHost && pathname === "/");

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Error signing out", err);
    }
  };

  const mainSite =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://travelscout.co.nz";

  const homeHref = onOperatorHost ? "/" : "/operator";
  const returnTo = encodeURIComponent(homeHref);
  const signupHref = `/auth/login?mode=signup&returnTo=${returnTo}`;
  const loginHref = `/auth/login?returnTo=${returnTo}`;

  const linkClass =
    "font-[family-name:var(--font-sora)] text-sm font-medium text-white/90 transition hover:text-[var(--ts-lime)]";

  return (
    <header
      className={`${isLanding ? "absolute inset-x-0 top-0" : "relative"} z-[1000] overflow-visible py-3 md:py-4`}
      style={{
        background: "transparent",
        borderBottom: "none",
      }}
    >
      <div className="container">
        <div className="flex items-center justify-between gap-3 rounded-full bg-black px-3 py-2 shadow-[0_12px_40px_rgba(0,0,0,0.35)] md:gap-4 md:px-4 md:py-2.5">
          <Link href={homeHref} className="relative flex min-w-0 shrink items-center gap-2">
            <Image
              src="/TravelscoutLogo2Cropped.png"
              alt="TravelScout"
              width={200}
              height={60}
              priority
              className="pointer-events-none h-[36px] w-auto select-none brightness-0 invert md:h-[48px]"
              sizes="(max-width: 768px) calc(100vw - 72px), 200px"
            />
            <span className="hidden font-[family-name:var(--font-sora)] text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ts-lime)] sm:inline">
              Operators
            </span>
          </Link>

          <nav className="flex flex-wrap items-center gap-3 text-sm">
            <a href={mainSite} className={linkClass}>
              Traveler site
            </a>
            {user ? (
              <button
                type="button"
                onClick={signOut}
                className={`${linkClass} inline-flex items-center gap-1.5`}
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </button>
            ) : (
              <>
                <Link href={signupHref} className={linkClass}>
                  Sign up
                </Link>
                <Link
                  href={loginHref}
                  className="rounded-full bg-white/15 px-4 py-2 font-[family-name:var(--font-sora)] text-sm font-semibold text-white transition hover:bg-white/25"
                >
                  Log in
                </Link>
              </>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}
