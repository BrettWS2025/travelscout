"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { mainSiteUrl, operatorPortalUrl } from "@/lib/hosts";

type NavbarProps = {
  /** On the operator subdomain, send traveler nav links to the main site. */
  travelerLinksToMainSite?: boolean;
};

export function Navbar({ travelerLinksToMainSite = false }: NavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const isOverlayNav =
    pathname === "/" || pathname === "/operator" || travelerLinksToMainSite;
  const { user } = useAuth();
  const isLoggedIn = !!user;

  const href = (path: string) =>
    travelerLinksToMainSite ? mainSiteUrl(path) : path;

  const signOutUser = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Error signing out", err);
      alert("Something went wrong signing out. Please try again.");
    }
  };

  const closeMobile = () => setMobileOpen(false);

  const linkClass =
    "font-[family-name:var(--font-sora)] text-sm font-medium text-white/90 transition hover:text-[var(--ts-lime)]";

  return (
    <header
      className={`${isOverlayNav ? "absolute inset-x-0 top-0" : "relative"} z-[1000] overflow-visible py-3 md:py-4`}
      style={{
        background: "transparent",
        borderBottom: "none",
      }}
    >
      <div className="container">
        <div className="flex items-center justify-between gap-3 rounded-full bg-black px-3 py-2 shadow-[0_12px_40px_rgba(0,0,0,0.35)] md:gap-4 md:px-4 md:py-2.5">
          <Link
            href={href("/")}
            className="relative flex min-w-0 shrink items-center"
            onClick={closeMobile}
          >
            <Image
              src="/TravelscoutLogo2Cropped.png"
              alt="TravelScout"
              width={200}
              height={60}
              priority
              className="pointer-events-none h-[36px] w-auto select-none brightness-0 invert md:h-[48px]"
              sizes="(max-width: 768px) calc(100vw - 72px), 200px"
            />
            <span className="sr-only">TravelScout</span>
          </Link>

          <nav className="hidden items-center gap-4 lg:flex xl:gap-5">
            <Link href={href("/find-deals")} className={linkClass}>
              Find Deals
            </Link>
            <Link href={href("/how-it-works")} className={linkClass}>
              How it works
            </Link>
            {!isLoggedIn ? (
              <>
                <Link href={href("/auth/login?mode=signup")} className={linkClass}>
                  Sign up
                </Link>
                <Link
                  href={href("/auth/login")}
                  className="rounded-full bg-white/15 px-4 py-2 font-[family-name:var(--font-sora)] text-sm font-semibold text-white transition hover:bg-white/25"
                >
                  Log in
                </Link>
              </>
            ) : (
              <>
                <Link href={href("/account/profile")} className={linkClass}>
                  Account
                </Link>
                <button
                  type="button"
                  onClick={signOutUser}
                  className={`${linkClass} inline-flex items-center gap-1.5`}
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign out
                </button>
              </>
            )}
            <a
              href={operatorPortalUrl("/")}
              className="rounded-full bg-[var(--ts-lime)] px-4 py-2 font-[family-name:var(--font-sora)] text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ts-ink)] transition hover:brightness-105"
            >
              For operators
            </a>
          </nav>

          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white lg:hidden"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle menu"
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="absolute inset-x-0 top-full z-[1001] lg:hidden">
          <div className="container pb-4 pt-2">
            <div className="rounded-2xl border border-white/10 bg-black p-3 shadow-lg">
              <div className="flex flex-col gap-1 font-[family-name:var(--font-sora)] text-sm text-white">
                <Link
                  href={href("/find-deals")}
                  className="rounded-lg px-3 py-3 font-medium text-white/90 hover:bg-white/10 hover:text-white"
                  onClick={closeMobile}
                >
                  Find Deals
                </Link>
                <Link
                  href={href("/how-it-works")}
                  className="rounded-lg px-3 py-3 font-medium text-white/90 hover:bg-white/10 hover:text-white"
                  onClick={closeMobile}
                >
                  How it works
                </Link>
                {!isLoggedIn ? (
                  <>
                    <Link
                      href={href("/auth/login?mode=signup")}
                      className="rounded-lg px-3 py-3 font-medium text-white/90 hover:bg-white/10 hover:text-white"
                      onClick={closeMobile}
                    >
                      Sign up
                    </Link>
                    <Link
                      href={href("/auth/login")}
                      className="rounded-lg px-3 py-3 font-medium text-white/90 hover:bg-white/10 hover:text-white"
                      onClick={closeMobile}
                    >
                      Log in
                    </Link>
                  </>
                ) : (
                  <>
                    <Link
                      href={href("/account/profile")}
                      className="rounded-lg px-3 py-3 font-medium text-white/90 hover:bg-white/10 hover:text-white"
                      onClick={closeMobile}
                    >
                      Account
                    </Link>
                    <button
                      type="button"
                      className="rounded-lg px-3 py-3 text-left font-medium text-white/90 hover:bg-white/10 hover:text-white"
                      onClick={() => {
                        closeMobile();
                        signOutUser();
                      }}
                    >
                      Sign out
                    </button>
                  </>
                )}
                <a
                  href={operatorPortalUrl("/")}
                  className="mt-1 inline-flex items-center justify-center rounded-full bg-[var(--ts-lime)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ts-ink)]"
                  onClick={closeMobile}
                >
                  For operators
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
