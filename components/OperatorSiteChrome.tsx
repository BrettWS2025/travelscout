"use client";

import Link from "next/link";
import Image from "next/image";
import { LogOut } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthProvider";
export function OperatorSiteChrome() {
  const { user } = useAuth();

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Error signing out", err);
    }
  };

  const mainSite =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://travelscout.co.nz";

  return (
    <header className="border-b border-slate-200 bg-white/80 backdrop-blur-md">
      <div className="container flex flex-wrap items-center justify-between gap-3 py-3">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/TravelscoutLogo2Cropped.png"
            alt="TravelScout"
            width={160}
            height={48}
            className="h-10 w-auto"
          />
          <span className="text-sm font-semibold text-indigo-600">Operators</span>
        </Link>
        <nav className="flex flex-wrap items-center gap-3 text-sm">
          <a
            href={mainSite}
            className="text-slate-600 hover:text-indigo-600 transition-colors"
          >
            Traveler site
          </a>
          {user ? (
            <button
              type="button"
              onClick={signOut}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          ) : (
            <Link
              href="/auth/login"
              className="rounded-lg px-3 py-1.5 text-white"
              style={{
                background: "linear-gradient(to right, #3b82f6, #6366f1)",
              }}
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
