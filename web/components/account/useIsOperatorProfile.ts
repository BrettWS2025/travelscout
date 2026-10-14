"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { listMyOrganizations } from "@/lib/marketplace/client";

type OperatorProfileState = {
  /** True when this auth user is an operator (org member or operator signup). */
  isOperatorProfile: boolean;
  isLoading: boolean;
};

function metadataLooksLikeOperator(user: {
  user_metadata?: Record<string, unknown> | null;
} | null): boolean {
  const meta = user?.user_metadata ?? {};
  return (
    meta.account_type === "operator" ||
    meta.is_operator === true ||
    meta.role === "operator"
  );
}

/**
 * Operators are marketplace org members (and/or flagged at operator signup).
 * Regular traveler accounts must not see Inventory / Settings.
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

      // Fast path from signup metadata while orgs load.
      if (metadataLooksLikeOperator(user)) {
        if (!cancelled) {
          setIsOperatorProfile(true);
          setIsLoading(false);
        }
      } else if (!cancelled) {
        setIsLoading(true);
      }

      try {
        const { organizations } = await listMyOrganizations(
          session?.access_token
        );
        if (!cancelled) {
          setIsOperatorProfile(
            organizations.length > 0 || metadataLooksLikeOperator(user)
          );
          setIsLoading(false);
        }
      } catch (err) {
        console.error("Failed to resolve operator profile", err);
        if (!cancelled) {
          // Fail closed for inventory/settings: only trust explicit metadata.
          setIsOperatorProfile(metadataLooksLikeOperator(user));
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
