"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { SiteSurface } from "@/lib/hosts";

const SiteSurfaceContext = createContext<SiteSurface>("main");

export function SiteSurfaceProvider({
  surface,
  children,
}: {
  surface: SiteSurface;
  children: ReactNode;
}) {
  return (
    <SiteSurfaceContext.Provider value={surface}>
      {children}
    </SiteSurfaceContext.Provider>
  );
}

/** Server-detected site surface: "operator" portal vs main traveler site. */
export function useSiteSurface(): SiteSurface {
  return useContext(SiteSurfaceContext);
}

export function useIsOperatorSurface(): boolean {
  return useSiteSurface() === "operator";
}
