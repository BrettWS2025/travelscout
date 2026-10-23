"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { listMyOperators } from "@/lib/marketplace/operator-deals-client";

type OperatorProfileState = {
  /**
   * True when this user belongs to an inventory operator
   * (marketplace.operators + accepted team_members).
   */
  isOperatorProfile: boolean;
  isLoading: boolean;
};

/**
 * Inventory / Settings require a real inventory operator membership.
 * Operator signup writes business_* metadata and a DB trigger creates the
 * operator at user insert; ensureOperatorAfterAuth is the client safety net
 * after email confirm. Legacy organisations are not used for this check.
 */
export function useIsOperatorProfile(): OperatorProfileState {
  const { user, session, isLoading: authLoading } = useAuth();
  const [isOperatorProfile, setIsOperatorProfile] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (authLoading) return;

      if (!user) {
        if (!cancelled) {
          setIsOperatorProfile(false);
          setIsLoading(false);
        }
        return;
      }

      if (!cancelled) setIsLoading(true);

      try {
        const token = session?.access_token;
        const listed = await listMyOperators(token);
        const hasOperator = (listed.operators?.length ?? 0) > 0;

        if (!cancelled) {
          setIsOperatorProfile(hasOperator);
          setIsLoading(false);
        }
      } catch (err) {
        console.error("Failed to resolve operator profile", err);
        if (!cancelled) {
          setIsOperatorProfile(false);
          setIsLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [user, session?.access_token, authLoading]);

  return { isOperatorProfile, isLoading: authLoading || isLoading };
}
