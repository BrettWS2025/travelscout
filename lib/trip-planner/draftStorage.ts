/**
 * Trip planner draft lives in sessionStorage so it does not leak across tabs.
 *
 * - Journey ↔ Summary (soft navigation): draft stays.
 * - Full page reload: cleared via `clearTripPlannerDraftIfReload` in the
 *   trip-planner layout (sessionStorage survives refresh otherwise).
 * - Leaving `/trip-planner` for **home** (`/`): cleared in TripPlannerNavbar
 *   unless `tripPlanner_restore_after_auth` is set. Other routes (account, auth,
 *   profile) keep the draft so users can return to the planner.
 *
 * One-time migration: legacy localStorage draft is moved into sessionStorage.
 */
export const TRIP_PLANNER_DRAFT_KEY = "tripPlanner_draft";

export const TRIP_PLANNER_RESTORE_AFTER_AUTH_KEY = "tripPlanner_restore_after_auth";

/** True when this document load was triggered by the user reloading the page. */
export function isNavigationReload(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const entries = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
    if (entries.length > 0 && entries[0].type) {
      return entries[0].type === "reload";
    }
  } catch {
    // ignore
  }
  const legacy = (performance as unknown as { navigation?: { type: number } }).navigation;
  return legacy?.type === 1;
}

/** Call during trip-planner layout render on the client; clears draft after a refresh. */
export function clearTripPlannerDraftIfReload(): void {
  if (!isNavigationReload()) return;
  removeTripPlannerDraft();
}

/**
 * When the user leaves `/trip-planner` via client navigation, we only reset the
 * draft if they land on the marketing home page. Account and auth routes keep the draft.
 */
export function shouldClearTripPlannerDraftForPath(pathname: string | null | undefined): boolean {
  return pathname === "/";
}

function migrateLegacyLocalDraft(): void {
  try {
    const legacy = localStorage.getItem(TRIP_PLANNER_DRAFT_KEY);
    if (!legacy) return;
    if (!sessionStorage.getItem(TRIP_PLANNER_DRAFT_KEY)) {
      sessionStorage.setItem(TRIP_PLANNER_DRAFT_KEY, legacy);
    }
    localStorage.removeItem(TRIP_PLANNER_DRAFT_KEY);
  } catch {
    // ignore quota / private mode
  }
}

export function getTripPlannerDraft(): string | null {
  if (typeof window === "undefined") return null;
  try {
    migrateLegacyLocalDraft();
    return sessionStorage.getItem(TRIP_PLANNER_DRAFT_KEY);
  } catch {
    return null;
  }
}

export function setTripPlannerDraft(json: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(TRIP_PLANNER_DRAFT_KEY);
    sessionStorage.setItem(TRIP_PLANNER_DRAFT_KEY, json);
  } catch (err) {
    console.error("Failed to save trip planner draft:", err);
  }
}

export function removeTripPlannerDraft(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(TRIP_PLANNER_DRAFT_KEY);
    localStorage.removeItem(TRIP_PLANNER_DRAFT_KEY);
  } catch {
    // ignore
  }
}
