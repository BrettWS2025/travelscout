"use client";

import { useEffect, useRef, useState } from "react";
import type { ActivePill } from "@/lib/trip-planner/useTripPlanner.types";

/**
 * UI state management for trip planner
 * Manages popovers, sheets, active pills, and refs
 */
export function useTripPlannerUI() {
  // Desktop popovers
  const [activePill, setActivePill] = useState<ActivePill>(null);
  const [showWherePopover, setShowWherePopover] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);

  // Mobile sheet
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [mobileActive, setMobileActive] = useState<ActivePill>("where");

  // Where typing state
  const [whereStep, setWhereStep] = useState<"start" | "end">("start");

  // Refs for outside click detection
  const whereRef = useRef<HTMLDivElement | null>(null);
  const whenRef = useRef<HTMLDivElement | null>(null);
  const placesRef = useRef<HTMLDivElement | null>(null);
  const thingsRef = useRef<HTMLDivElement | null>(null);

  // Places/Things UI state
  const [activePlacesThingsPill, setActivePlacesThingsPill] = useState<"places" | "things" | null>(null);
  const [showPlacesPopover, setShowPlacesPopover] = useState(false);
  const [showThingsPopover, setShowThingsPopover] = useState(false);
  const [placesMobileSheetOpen, setPlacesMobileSheetOpen] = useState(false);
  const [thingsMobileSheetOpen, setThingsMobileSheetOpen] = useState(false);

  // Close desktop popovers on outside click
  useEffect(() => {
    function onDocMouseDown(e: MouseEvent | TouchEvent) {
      const t = e.target as Node | null;
      if (!t) return;

      // Check if clicking on a button or interactive element - don't close if so
      const target = e.target as HTMLElement;
      if (target.tagName === "BUTTON" || target.closest("button") || target.closest("input")) {
        return;
      }

      const inWhere = whereRef.current?.contains(t);
      const inWhen = whenRef.current?.contains(t);
      const inPlaces = placesRef.current?.contains(t);
      const inThings = thingsRef.current?.contains(t);

      if (!inWhere) {
        setShowWherePopover(false);
        if (activePill === "where") setActivePill(null);
      }
      if (!inWhen) {
        setShowCalendar(false);
        if (activePill === "when") setActivePill(null);
      }
      if (!inPlaces) {
        setShowPlacesPopover(false);
        if (activePlacesThingsPill === "places") setActivePlacesThingsPill(null);
      }
      if (!inThings) {
        setShowThingsPopover(false);
        if (activePlacesThingsPill === "things") setActivePlacesThingsPill(null);
      }
    }

    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("touchstart", onDocMouseDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("touchstart", onDocMouseDown);
    };
  }, [activePill, activePlacesThingsPill]);

  // Lock body scroll when mobile sheet open
  useEffect(() => {
    if (!mobileSheetOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileSheetOpen]);

  return {
    // Refs
    whereRef,
    whenRef,
    placesRef,
    thingsRef,

    // Desktop popovers
    activePill,
    setActivePill,
    showWherePopover,
    setShowWherePopover,
    showCalendar,
    setShowCalendar,

    // Mobile sheet
    mobileSheetOpen,
    setMobileSheetOpen,
    mobileActive,
    setMobileActive,

    // Where step
    whereStep,
    setWhereStep,

    // Places/Things UI
    activePlacesThingsPill,
    setActivePlacesThingsPill,
    showPlacesPopover,
    setShowPlacesPopover,
    showThingsPopover,
    setShowThingsPopover,
    placesMobileSheetOpen,
    setPlacesMobileSheetOpen,
    thingsMobileSheetOpen,
    setThingsMobileSheetOpen,
  };
}
