"use client";

import type { ReactNode } from "react";
import { clearTripPlannerDraftIfReload } from "@/lib/trip-planner/draftStorage";

/**
 * Runs before child pages render. On full reload, clears the session draft
 * (sessionStorage otherwise survives refresh). Soft navigation keeps the draft.
 */
export default function TripPlannerLayout({ children }: { children: ReactNode }) {
  if (typeof window !== "undefined") {
    clearTripPlannerDraftIfReload();
  }
  return <>{children}</>;
}
