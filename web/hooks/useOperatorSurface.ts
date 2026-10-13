"use client";

import { getConfiguredOperatorHost, isOperatorHost, operatorHref } from "@/lib/hosts";

/**
 * True only when the browser is on the configured operator subdomain
 * (e.g. operators.travelscout.co.nz).
 *
 * When the operator portal is served under /operator on the same host
 * (Dev/preview with no subdomain), this is false so links keep the
 * /operator prefix — otherwise Sign up becomes /signup and 404s.
 */
export function useOnOperatorHost(): boolean {
  if (typeof window === "undefined") return false;
  if (!getConfiguredOperatorHost()) return false;
  return isOperatorHost(window.location.hostname);
}

export function useOperatorHref(path: string): string {
  const onOperator = useOnOperatorHost();
  return operatorHref(path, onOperator);
}
