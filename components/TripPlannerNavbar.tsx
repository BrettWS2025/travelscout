"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { Edit3 } from "lucide-react";
import {
  getTripPlannerDraft,
  TRIP_PLANNER_DRAFT_KEY,
  removeTripPlannerDraft,
  TRIP_PLANNER_RESTORE_AFTER_AUTH_KEY,
  shouldClearTripPlannerDraftForPath,
} from "@/lib/trip-planner/draftStorage";

export function TripPlannerNavbar() {
  const pathname = usePathname();
  const isTripPlanner = pathname?.startsWith("/trip-planner");
  const [hasJourney, setHasJourney] = useState(false);
  const wasOnTripPlannerRef = useRef(false);

  // Clear draft only when leaving trip planner for the home page (fresh start from nav).
  // Account, auth, and profile routes keep the draft so users can return to the planner.
  // Skip when the user is mid auth redirect so the draft can be restored after login.
  useEffect(() => {
    const wasOnTripPlanner = wasOnTripPlannerRef.current;
    const isOnTripPlanner = Boolean(isTripPlanner);

    if (wasOnTripPlanner && !isOnTripPlanner) {
      try {
        const shouldRestoreAfterAuth =
          localStorage.getItem(TRIP_PLANNER_RESTORE_AFTER_AUTH_KEY) === "1";
        if (!shouldRestoreAfterAuth && shouldClearTripPlannerDraftForPath(pathname)) {
          removeTripPlannerDraft();
        }
      } catch (err) {
        console.error("Error clearing trip planner draft:", err);
      }
    }

    wasOnTripPlannerRef.current = isOnTripPlanner;
  }, [isTripPlanner, pathname]);

  // Check if a journey has been created by reading the session draft
  useEffect(() => {
    if (!isTripPlanner) {
      setHasJourney(false);
      return;
    }

    const checkForJourney = () => {
      try {
        const saved = getTripPlannerDraft();
        if (saved) {
          const state = JSON.parse(saved);
          // Check if there's a plan with days, or if hasSubmitted is true (journey was created)
          const hasPlan = state.plan && state.plan.days && Array.isArray(state.plan.days) && state.plan.days.length > 0;
          const hasSubmitted = state.hasSubmitted === true;
          
          if (hasPlan || hasSubmitted) {
            setHasJourney(true);
            return;
          }
        }
        setHasJourney(false);
      } catch (err) {
        console.error("Error checking for journey:", err);
        setHasJourney(false);
      }
    };

    // Check immediately
    checkForJourney();

    // Listen for custom event when plan is created
    const handlePlanCreated = () => {
      // Check immediately when event fires
      setTimeout(() => {
        checkForJourney();
      }, 100); // Small delay to ensure localStorage is updated
    };

    // Also listen for storage events (when plan is saved from another tab/window)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === TRIP_PLANNER_DRAFT_KEY) {
        checkForJourney();
      }
    };

    window.addEventListener("tripPlanCreated", handlePlanCreated);
    window.addEventListener("storage", handleStorageChange);

    // Poll for changes (since storage event doesn't fire in same tab)
    // Increased interval to 1000ms to reduce overhead
    const interval = setInterval(checkForJourney, 1000);

    return () => {
      window.removeEventListener("tripPlanCreated", handlePlanCreated);
      window.removeEventListener("storage", handleStorageChange);
      clearInterval(interval);
    };
  }, [isTripPlanner]);

  if (!isTripPlanner || !hasJourney) {
    return null;
  }

  return (
    <header
      className="relative z-[999] py-2 overflow-visible -mt-[1px]"
      style={{
        background: "rgba(255, 255, 255, 0.6)",
        WebkitBackdropFilter: "saturate(180%) blur(20px)",
        backdropFilter: "saturate(180%) blur(20px)",
        borderTop: "none",
        borderBottom: "1px solid rgba(148, 163, 184, 0.2)",
        color: "var(--text)",
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
      }}
    >
      <div className="container navbar-responsive">
        <div className="mx-auto max-w-5xl">
          <nav className="flex items-center justify-between pl-10 md:pl-12">
            <div className="flex items-center gap-6">
              <Link
                href="/trip-planner"
                className={`transition-colors hover:text-indigo-600 font-medium text-sm ${pathname !== "/trip-planner/summary" ? "text-indigo-600" : ""}`}
                style={pathname === "/trip-planner/summary" ? { color: "var(--text)" } : undefined}
              >
                Journey
              </Link>
              <Link
                href="/trip-planner/summary"
                className={`transition-colors hover:text-indigo-600 font-medium text-sm ${pathname === "/trip-planner/summary" ? "text-indigo-600" : ""}`}
                style={pathname !== "/trip-planner/summary" ? { color: "var(--text)" } : undefined}
              >
                Summary
              </Link>
            </div>
            <div className="pr-4 md:pr-6">
              <button
                type="button"
                onClick={() => {
                  // Toggle the planner form visibility from the secondary navbar.
                  if (typeof window !== "undefined") {
                    window.dispatchEvent(new CustomEvent("toggleTripPlannerForm"));
                  }
                }}
                className="inline-flex items-center gap-2 transition-colors hover:text-indigo-600 font-medium text-xs"
                style={{ color: "var(--text)" }}
              >
                <Edit3 className="w-4 h-4" />
                Edit your journey
              </button>
            </div>
          </nav>
        </div>
      </div>
    </header>
  );
}
