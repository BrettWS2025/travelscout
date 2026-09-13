"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { operatorPortalUrl } from "@/lib/hosts";

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const isOverlayNav = pathname === "/";
  const navTextColor = isOverlayNav ? "#ffffff" : "var(--ts-ink, var(--text))";
  const { user } = useAuth();
  const isLoggedIn = !!user;

  const signOutUser = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Error signing out", err);
      alert("Something went wrong signing out. Please try again.");
    }
  };

  const closeMobile = () => setMobileOpen(false);

  const linkClass = isOverlayNav
    ? "font-[family-name:var(--font-sora)] text-sm font-medium text-white/90 transition hover:text-[var(--ts-lime)]"
    : "font-[family-name:var(--font-sora)] text-sm font-medium text-[var(--ts-ink)] transition hover:text-[var(--ts-teal)]";

  return (
    <header
      className={`${isOverlayNav ? "absolute inset-x-0 top-0" : "relative"} z-[1000] overflow-visible py-3 md:py-4`}
      style={{
        background: isOverlayNav ? "transparent" : "rgba(243, 246, 244, 0.88)",
        WebkitBackdropFilter: isOverlayNav ? "none" : "saturate(160%) blur(18px)",
        backdropFilter: isOverlayNav ? "none" : "saturate(160%) blur(18px)",
        borderBottom: isOverlayNav ? "none" : "1px solid rgba(16, 36, 28, 0.08)",
        color: navTextColor,
      }}
    >
      <div className="container flex items-center justify-between gap-4">
        <Link href="/" className="relative flex min-w-0 shrink items-center" onClick={closeMobile}>
          <Image
            src="/TravelscoutLogo2Cropped.png"
            alt="TravelScout"
            width={200}
            height={60}
            priority
            className={`pointer-events-none h-[48px] w-auto select-none md:h-[72px] ${
              isOverlayNav ? "brightness-0 invert" : ""
            }`}
            sizes="(max-width: 768px) calc(100vw - 72px), 200px"
          />
          <span className="sr-only">TravelScout</span>
        </Link>

        <nav className="hidden items-center gap-5 lg:flex xl:gap-6">
          <Link href="/find-deals" className={linkClass}>
            Find Deals
          </Link>
          <Link href="/how-it-works" className={linkClass}>
            How it works
          </Link>
          {!isLoggedIn ? (
            <>
              <Link href="/auth/login?mode=signup" className={linkClass}>
                Sign up
              </Link>
              <Link
                href="/auth/login"
                className={`rounded-full px-4 py-2 font-[family-name:var(--font-sora)] text-sm font-semibold transition ${
                  isOverlayNav
                    ? "bg-white/15 text-white hover:bg-white/25"
                    : "bg-[var(--ts-ink)] text-white hover:bg-[var(--ts-teal)]"
                }`}
              >
                Log in
              </Link>
            </>
          ) : (
            <>
              <Link href="/account/profile" className={linkClass}>
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
            className={`rounded-full px-4 py-2 font-[family-name:var(--font-sora)] text-xs font-semibold uppercase tracking-[0.12em] transition ${
              isOverlayNav
                ? "bg-[var(--ts-lime)] text-[var(--ts-ink)] hover:brightness-105"
                : "bg-[var(--ts-lime)] text-[var(--ts-ink)] hover:brightness-105"
            }`}
          >
            For operators
          </a>
        </nav>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg lg:hidden"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Toggle menu"
          aria-expanded={mobileOpen}
          style={{
            color: navTextColor,
            background: isOverlayNav ? "rgba(16, 36, 28, 0.28)" : "transparent",
          }}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="absolute inset-x-0 top-full z-[1001] lg:hidden">
          <div className="container pb-4 pt-2">
            <div className="rounded-2xl border border-[var(--ts-ink)]/10 bg-white p-3 shadow-lg">
              <div className="flex flex-col gap-1 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-ink)]">
                <Link
                  href="/find-deals"
                  className="rounded-lg px-3 py-3 font-medium hover:bg-[var(--ts-mist)]"
                  onClick={closeMobile}
                >
                  Find Deals
                </Link>
                <Link
                  href="/how-it-works"
                  className="rounded-lg px-3 py-3 font-medium hover:bg-[var(--ts-mist)]"
                  onClick={closeMobile}
                >
                  How it works
                </Link>
                {!isLoggedIn ? (
                  <>
                    <Link
                      href="/auth/login?mode=signup"
                      className="rounded-lg px-3 py-3 font-medium hover:bg-[var(--ts-mist)]"
                      onClick={closeMobile}
                    >
                      Sign up
                    </Link>
                    <Link
                      href="/auth/login"
                      className="rounded-lg px-3 py-3 font-medium hover:bg-[var(--ts-mist)]"
                      onClick={closeMobile}
                    >
                      Log in
                    </Link>
                  </>
                ) : (
                  <>
                    <Link
                      href="/account/profile"
                      className="rounded-lg px-3 py-3 font-medium hover:bg-[var(--ts-mist)]"
                      onClick={closeMobile}
                    >
                      Account
                    </Link>
                    <button
                      type="button"
                      className="rounded-lg px-3 py-3 text-left font-medium hover:bg-red-50 hover:text-red-600"
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
