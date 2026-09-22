"use client";

import { usePathname } from "next/navigation";
import { getConfiguredOperatorHost, isOperatorHost, operatorHref } from "@/lib/hosts";

/** True when the app is served on the configured operator subdomain. */
export function useOnOperatorHost(): boolean {
  const pathname = usePathname();
  if (typeof window !== "undefined" && getConfiguredOperatorHost()) {
    return isOperatorHost(window.location.hostname);
  }
  return pathname?.startsWith("/operator") ?? false;
}

export function useOperatorHref(path: string): string {
  const onOperator = useOnOperatorHost();
  return operatorHref(path, onOperator);
}
