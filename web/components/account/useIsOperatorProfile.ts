"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { listMyOrganizations } from "@/lib/marketplace/client";
import { listMyOperators } from "@/lib/marketplace/operator-deals-client";

type OperatorProfileState = {
  /**
   * True when this user belongs to a marketplace organization (legacy) or an
   * inventory operator (marketplace.operators + team_members).
   */
  isOperatorProfile: boolean;
  isLoading: boolean;
};

/**
 * Inventory / Settings require a real inventory operator membership. Nav also
 * treats legacy organisation membership as operator so existing accounts keep
 * access while both systems coexist. Operator signup writes business_* metadata
 * and a DB trigger creates org + operator at user insert; ensureOperatorAfterAuth
 * is the client safety net after email confirm.
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
        const [orgsResult, operatorsResult] = await Promise.allSettled([
          listMyOrganizations(token),
          listMyOperators(token),
        ]);

        const hasOrg =
          orgsResult.status === "fulfilled" &&
          (orgsResult.value.organizations?.length ?? 0) > 0;
        const hasOperator =
          operatorsResult.status === "fulfilled" &&
          (operatorsResult.value.operators?.length ?? 0) > 0;

        if (!cancelled) {
          setIsOperatorProfile(hasOrg || hasOperator);
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
