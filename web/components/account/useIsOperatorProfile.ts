"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { listMyOrganizations } from "@/lib/marketplace/client";

type OperatorProfileState = {
  /** True only when this user belongs to a marketplace organization. */
  isOperatorProfile: boolean;
  isLoading: boolean;
};

/**
 * Inventory / Settings require a real row in marketplace.organizations
 * (via organization_members). Operator signup writes business_* metadata and a
 * DB trigger creates the org at user insert; ensureOperatorOrganization is the
 * client safety net after email confirm. Metadata alone is not enough.
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
        const { organizations } = await listMyOrganizations(
          session?.access_token
        );
        if (!cancelled) {
          setIsOperatorProfile(organizations.length > 0);
          setIsLoading(false);
        }
      } catch (err) {
        console.error("Failed to resolve operator profile", err);
        if (!cancelled) {
          // Fail closed: no org list ⇒ not an operator for nav purposes.
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
