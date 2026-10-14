"use client";

import { supabase } from "@/lib/supabase/client";
import { mainSiteUrl } from "@/lib/hosts";
import { useIsOperatorSurface } from "@/components/SiteSurfaceContext";

function clearSupabaseAuthStorage() {
  if (typeof window === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && (key.startsWith("sb-") || key.includes("supabase"))) {
        keys.push(key);
      }
    }
    for (const key of keys) {
      window.localStorage.removeItem(key);
    }
  } catch (err) {
    console.error("Failed to clear auth storage", err);
  }
}

/**
 * Hard-clear the local Supabase session and navigate away.
 * Main site and operators.* each have their own localStorage origin, so logout
 * must succeed on the host the user is currently on.
 */
export function useAccountSignOut() {
  const isOperatorSurface = useIsOperatorSurface();

  return async () => {
    try {
      // Local first — always clears this origin's persisted session.
      await supabase.auth.signOut({ scope: "local" });
    } catch (err) {
      console.error("Error signing out locally", err);
    }

    try {
      await supabase.auth.signOut({ scope: "global" });
    } catch (err) {
      console.error("Error signing out globally", err);
    }

    clearSupabaseAuthStorage();

    if (typeof window !== "undefined") {
      // Bounce through main site login when leaving the operator portal so the
      // traveler-site session can be cleared next if they still look logged in.
      const next = isOperatorSurface
        ? `${mainSiteUrl("/auth/login")}?signedOut=1`
        : "/";
      window.location.assign(next);
    }
  };
}
