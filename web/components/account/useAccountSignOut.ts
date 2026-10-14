"use client";

import { supabase } from "@/lib/supabase/client";
import { mainSiteUrl } from "@/lib/hosts";
import { useIsOperatorSurface } from "@/components/SiteSurfaceContext";

/**
 * Hard-navigate after sign-out so auth UI cannot stick on a stale client session.
 * Operators return to the operator login; travelers return to the main site home.
 */
export function useAccountSignOut() {
  const isOperatorSurface = useIsOperatorSurface();

  return async () => {
    try {
      await supabase.auth.signOut({ scope: "global" });
    } catch (err) {
      console.error("Error signing out", err);
      // Still leave the page — local session may already be cleared.
    }

    if (typeof window !== "undefined") {
      window.location.assign(
        isOperatorSurface ? "/auth/login" : mainSiteUrl("/")
      );
    }
  };
}
