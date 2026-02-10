"use client";

import { useMemo } from "react";
import { useAuth } from "@/components/AuthProvider";
import { countDaysInclusive } from "@/lib/itinerary";
import { formatShortRangeDate } from "@/lib/trip-planner/utils";
import { useTripPlannerState } from "./hooks/useTripPlannerState";
import { useTripPlannerUI } from "./hooks/useTripPlannerUI";
import { useTripPlannerSearch } from "./hooks/useTripPlannerSearch";
import { useTripPlannerCitySelection } from "./hooks/useTripPlannerCitySelection";
import { useTripPlannerPlaces } from "./hooks/useTripPlannerPlaces";
import { useTripPlannerHandlers } from "./hooks/useTripPlannerHandlers";
import { useTripPlannerPlan } from "./hooks/useTripPlannerPlan";
import { useTripPlannerPersistence } from "./hooks/useTripPlannerPersistence";

/**
 * Main trip planner hook - composes all sub-hooks
 * This is a composition layer that maintains backward compatibility
 */
export function useTripPlanner() {
  const { user } = useAuth();

  // Core state management
  const state = useTripPlannerState();

  // UI state management
  const ui = useTripPlannerUI();

  // Search functionality
  const search = useTripPlannerSearch();

  // Places/Things selection
  const places = useTripPlannerPlaces(
    state.recent,
    state.setRecent,
    search.placesResults
  );

  // City selection
  const citySelection = useTripPlannerCitySelection(
    search.startResults,
    search.endResults,
    state.recent,
    state.setRecent,
    state.setStartCityId,
    state.setEndCityId,
    state.setStartCityData,
    state.setEndCityData,
    search.setStartQuery,
    search.setEndQuery,
    ui.setWhereStep,
    state.startCity
  );

  // UI handlers
  const handlers = useTripPlannerHandlers(
    state.startCity,
    state.endCity,
    state.startDate,
    state.setDateRange,
    state.setStartDate,
    state.setEndDate,
    ui.setActivePill,
    ui.setShowWherePopover,
    ui.setShowCalendar,
    state.setCalendarMonth,
    ui.setWhereStep,
    search.setStartQuery,
    search.setEndQuery,
    ui.setMobileSheetOpen,
    ui.setMobileActive,
    ui.setActivePlacesThingsPill,
    ui.setShowPlacesPopover,
    ui.setShowThingsPopover,
    ui.setPlacesMobileSheetOpen,
    ui.setThingsMobileSheetOpen,
    search.setPlacesQuery,
    search.setThingsQuery
  );

  // Plan generation and modification
  const plan = useTripPlannerPlan(
    state.startCity,
    state.endCity,
    state.startCityId,
    state.endCityId,
    state.startDate,
    state.endDate,
    places.selectedPlaceIds,
    places.selectedPlaceData,
    places.selectedThingIds,
    state.destinationIds,
    state.destinationData,
    state.routeStops,
    state.nightsPerStop,
    state.mapPoints,
    state.roadSectorDetails,
    state.openStops,
    state.setPlan,
    state.setError,
    state.setHasSubmitted,
    state.setRouteStops,
    state.setNightsPerStop,
    state.setDayStopMeta,
    state.setMapPoints,
    state.setLegs,
    state.setLegsLoading,
    state.setDayDetails,
    state.setRoadSectorDetails,
    state.setStartSectorType,
    state.setEndSectorType,
    state.setOpenStops,
    state.setEndDate,
    state.setStartCityData,
    state.setEndCityData,
    places.setSelectedPlaceData,
    state.setDestinationData
  );

  // Persistence
  const persistence = useTripPlannerPersistence(
    user,
    state.plan,
    state.startCity,
    state.endCity,
    state.startCityId,
    state.endCityId,
    state.startDate,
    state.endDate,
    places.selectedPlaceIds,
    places.selectedThingIds,
    places.selectedPlaces,
    places.selectedThings,
    state.routeStops,
    state.nightsPerStop,
    state.dayStopMeta,
    state.dayDetails,
    state.mapPoints,
    state.legs,
    state.setStartCityId,
    state.setEndCityId,
    state.setStartDate,
    state.setEndDate,
    state.setDateRange,
    state.setCalendarMonth,
    places.setSelectedPlaceIds,
    places.setSelectedThingIds,
    state.setRouteStops,
    state.setNightsPerStop,
    state.setDayStopMeta,
    state.setPlan,
    state.setDayDetails,
    state.setMapPoints,
    state.setLegs,
    state.setHasSubmitted,
    state.setError
  );

  // Derived values
  const totalTripDays = state.startDate && state.endDate 
    ? countDaysInclusive(state.startDate, state.endDate) 
    : 0;

  const whenLabel = state.startDate && state.endDate
    ? `${formatShortRangeDate(state.startDate)} – ${formatShortRangeDate(state.endDate)}`
    : state.startDate && !state.endDate
    ? `${formatShortRangeDate(state.startDate)} – Add end date`
    : "Add dates";

  const whereSummary = state.startCity && state.endCity 
    ? `${state.startCity.name} → ${state.endCity.name}` 
    : state.startCity 
    ? "Select End City"
    : "Select Start City";

  // Wrapper for handleConfirmAddStop to pass the required parameters
  const handleConfirmAddStop = () => {
    plan.handleConfirmAddStop(
      state.addingStopAfterIndex,
      state.newStopCityId,
      state.setAddingStopAfterIndex
    );
  };

  // Wrapper for handleStartAddStop
  const handleStartAddStop = (afterIndex: number) => {
    state.setAddingStopAfterIndex(afterIndex);
  };

  // Wrapper for handleCancelAddStop
  const handleCancelAddStop = () => {
    state.setAddingStopAfterIndex(null);
  };

  return {
    // refs
    whereRef: ui.whereRef,
    whenRef: ui.whenRef,
    placesRef: ui.placesRef,
    thingsRef: ui.thingsRef,

    // main state
    startCityId: state.startCityId,
    endCityId: state.endCityId,
    startCity: state.startCity,
    endCity: state.endCity,
    startDate: state.startDate,
    endDate: state.endDate,
    dateRange: state.dateRange,
    calendarMonth: state.calendarMonth,

    activePill: ui.activePill,
    showWherePopover: ui.showWherePopover,
    showCalendar: ui.showCalendar,

    mobileSheetOpen: ui.mobileSheetOpen,
    mobileActive: ui.mobileActive,

    whereStep: ui.whereStep,
    startQuery: search.startQuery,
    endQuery: search.endQuery,
    recent: state.recent,
    suggested: state.suggested,

    // places/things state
    activePlacesThingsPill: ui.activePlacesThingsPill,
    showPlacesPopover: ui.showPlacesPopover,
    showThingsPopover: ui.showThingsPopover,
    placesMobileSheetOpen: ui.placesMobileSheetOpen,
    thingsMobileSheetOpen: ui.thingsMobileSheetOpen,
    placesQuery: search.placesQuery,
    thingsQuery: search.thingsQuery,
    selectedPlaceIds: places.selectedPlaceIds,
    selectedThingIds: places.selectedThingIds,
    selectedPlaces: places.selectedPlaces,
    selectedThings: places.selectedThings,

    plan: state.plan,
    error: state.error,
    hasSubmitted: state.hasSubmitted,
    saving: persistence.saving,
    saveError: persistence.saveError,
    routeStops: state.routeStops,
    nightsPerStop: state.nightsPerStop,
    dayStopMeta: state.dayStopMeta,
    mapPoints: state.mapPoints,
    legs: state.legs,
    legsLoading: state.legsLoading,
    dayDetails: state.dayDetails,
    roadSectorDetails: state.roadSectorDetails,
    addingStopAfterIndex: state.addingStopAfterIndex,
    newStopCityId: state.newStopCityId,
    openStops: state.openStops,

    // derived labels
    totalTripDays,
    whenLabel,
    whereSummary,
    placesSummary: places.placesSummary,
    thingsSummary: places.thingsSummary,

    // setters
    setCalendarMonth: state.setCalendarMonth,
    setDateRange: state.setDateRange,
    setStartDate: state.setStartDate,
    setEndDate: state.setEndDate,
    setActivePill: ui.setActivePill,
    setShowWherePopover: ui.setShowWherePopover,
    setShowCalendar: ui.setShowCalendar,
    setMobileActive: ui.setMobileActive,
    setMobileSheetOpen: ui.setMobileSheetOpen,
    setWhereStep: ui.setWhereStep,
    setStartQuery: search.setStartQuery,
    setEndQuery: search.setEndQuery,
    setPlacesQuery: search.setPlacesQuery,
    setThingsQuery: search.setThingsQuery,
    setActivePlacesThingsPill: ui.setActivePlacesThingsPill,
    setShowPlacesPopover: ui.setShowPlacesPopover,
    setShowThingsPopover: ui.setShowThingsPopover,
    setSelectedPlaceIds: places.setSelectedPlaceIds,
    setSelectedThingIds: places.setSelectedThingIds,
    setNewStopCityId: state.setNewStopCityId,
    setOpenStops: state.setOpenStops,

    // handlers
    handleDateRangeChange: handlers.handleDateRangeChange,
    handleSubmit: plan.handleSubmit,
    openWhereDesktop: handlers.openWhereDesktop,
    openWhenDesktop: handlers.openWhenDesktop,
    openPlacesDesktop: handlers.openPlacesDesktop,
    openThingsDesktop: handlers.openThingsDesktop,
    openMobileSheet: handlers.openMobileSheet,
    closeMobileSheet: handlers.closeMobileSheet,
    closePlacesMobileSheet: handlers.closePlacesMobileSheet,
    closeThingsMobileSheet: handlers.closeThingsMobileSheet,
    selectStartCity: citySelection.selectStartCity,
    selectEndCity: citySelection.selectEndCity,
    selectReturnToStart: citySelection.selectReturnToStart,
    selectPlace: places.selectPlace,
    selectThing: places.selectThing,
    removePlace: places.removePlace,
    removeThing: places.removeThing,
    handleChangeNights: plan.handleChangeNights,
    handleRemoveStop: plan.handleRemoveStop,
    handleReorderStops: plan.handleReorderStops,
    handleStartAddStop,
    handleCancelAddStop,
    handleConfirmAddStop,
    toggleDayOpen: plan.toggleDayOpen,
    updateDayNotes: plan.updateDayNotes,
    updateDayAccommodation: plan.updateDayAccommodation,
    toggleRoadSectorOpen: plan.toggleRoadSectorOpen,
    updateRoadSectorActivities: plan.updateRoadSectorActivities,
    startSectorType: state.startSectorType,
    endSectorType: state.endSectorType,
    convertStartToItinerary: plan.convertStartToItinerary,
    convertStartToRoad: plan.convertStartToRoad,
    convertEndToItinerary: plan.convertEndToItinerary,
    convertEndToRoad: plan.convertEndToRoad,
    toggleStopOpen: plan.toggleStopOpen,
    expandAllStops: plan.expandAllStops,
    collapseAllStops: plan.collapseAllStops,
    saveItinerary: persistence.saveItinerary,
    loadItinerary: persistence.loadItinerary,
    saveStateToLocalStorage: persistence.saveStateToLocalStorage,
    restoreStateFromLocalStorage: persistence.restoreStateFromLocalStorage,
    clearSavedState: persistence.clearSavedState,

    // results
    startResults: search.startResults,
    endResults: search.endResults,
    placesResults: search.placesResults,
    thingsResults: search.thingsResults,
  };
}
