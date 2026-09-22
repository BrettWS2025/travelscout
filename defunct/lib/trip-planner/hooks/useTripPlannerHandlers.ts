"use client";

import type { DateRange } from "react-day-picker";
import { fromIsoDate, toIsoDate } from "@/lib/trip-planner/utils";
import type { Place } from "@/lib/nzCities";
import type { ActivePill } from "@/lib/trip-planner/useTripPlanner.types";

/**
 * UI action handlers for trip planner
 */
export function useTripPlannerHandlers(
  startCity: Place | undefined,
  endCity: Place | undefined,
  startDate: string,
  setDateRange: (range: DateRange | undefined) => void,
  setStartDate: (date: string) => void,
  setEndDate: (date: string) => void,
  setActivePill: (pill: ActivePill) => void,
  setShowWherePopover: (show: boolean) => void,
  setShowCalendar: (show: boolean) => void,
  setCalendarMonth: (month: Date) => void,
  setWhereStep: (step: "start" | "end") => void,
  setStartQuery: (query: string) => void,
  setEndQuery: (query: string) => void,
  setMobileSheetOpen: (open: boolean) => void,
  setMobileActive: (active: ActivePill) => void,
  setActivePlacesThingsPill: (pill: "places" | "things" | null) => void,
  setShowPlacesPopover: (show: boolean) => void,
  setShowThingsPopover: (show: boolean) => void,
  setPlacesMobileSheetOpen: (open: boolean) => void,
  setThingsMobileSheetOpen: (open: boolean) => void,
  setPlacesQuery: (query: string) => void,
  setThingsQuery: (query: string) => void
) {
  function handleDateRangeChange(range: DateRange | undefined) {
    setDateRange(range);

    if (!range?.from) {
      setStartDate("");
      setEndDate("");
      return;
    }

    if (!range.to) {
      setStartDate(toIsoDate(range.from));
      setEndDate("");
      return;
    }

    let from = range.from;
    let to = range.to;
    if (to < from) [from, to] = [to, from];

    setStartDate(toIsoDate(from));
    setEndDate(toIsoDate(to));
  }

  function openWhereDesktop() {
    setActivePill("where");
    setShowWherePopover(true);
    setShowCalendar(false);
    setWhereStep("start");
    setStartQuery(startCity?.name ?? "");
    setEndQuery(endCity?.name ?? "");
  }

  function openWhenDesktop() {
    setActivePill("when");
    setShowCalendar(true);
    setShowWherePopover(false);

    const anchor = fromIsoDate(startDate) ?? new Date();
    setCalendarMonth(anchor);
  }

  function openPlacesDesktop() {
    // Check if mobile (screen width < 768px)
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setPlacesMobileSheetOpen(true);
      setPlacesQuery("");
    } else {
      setActivePlacesThingsPill("places");
      setShowPlacesPopover(true);
      setShowThingsPopover(false);
      setPlacesQuery("");
    }
  }

  function openThingsDesktop() {
    // Check if mobile (screen width < 768px)
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setThingsMobileSheetOpen(true);
      setThingsQuery("");
    } else {
      setActivePlacesThingsPill("things");
      setShowThingsPopover(true);
      setShowPlacesPopover(false);
      setThingsQuery("");
    }
  }

  function openMobileSheet() {
    setMobileSheetOpen(true);
    setMobileActive("where");
    setWhereStep("start");
    setStartQuery(startCity?.name ?? "");
    setEndQuery(endCity?.name ?? "");

    const anchor = fromIsoDate(startDate) ?? new Date();
    setCalendarMonth(anchor);
  }

  function closeMobileSheet() {
    setMobileSheetOpen(false);
  }

  function closePlacesMobileSheet() {
    setPlacesMobileSheetOpen(false);
  }

  function closeThingsMobileSheet() {
    setThingsMobileSheetOpen(false);
  }

  return {
    handleDateRangeChange,
    openWhereDesktop,
    openWhenDesktop,
    openPlacesDesktop,
    openThingsDesktop,
    openMobileSheet,
    closeMobileSheet,
    closePlacesMobileSheet,
    closeThingsMobileSheet,
  };
}
