import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTripPlanner } from '../useTripPlanner';
import * as hooks from '../hooks/useTripPlannerState';
import * as auth from '@/components/AuthProvider';

// Mock all hooks
vi.mock('../hooks/useTripPlannerState', () => ({
  useTripPlannerState: vi.fn(),
}));
vi.mock('../hooks/useTripPlannerUI', () => ({
  useTripPlannerUI: vi.fn(() => ({
    activePill: null,
    showWherePopover: false,
    showCalendar: false,
    mobileSheetOpen: false,
    mobileActive: 'where',
    whereStep: 'start',
    activePlacesThingsPill: null,
    showPlacesPopover: false,
    showThingsPopover: false,
    placesMobileSheetOpen: false,
    thingsMobileSheetOpen: false,
    setActivePill: vi.fn(),
    setShowWherePopover: vi.fn(),
    setShowCalendar: vi.fn(),
    setMobileSheetOpen: vi.fn(),
    setMobileActive: vi.fn(),
    setWhereStep: vi.fn(),
    setActivePlacesThingsPill: vi.fn(),
    setShowPlacesPopover: vi.fn(),
    setShowThingsPopover: vi.fn(),
    setPlacesMobileSheetOpen: vi.fn(),
    setThingsMobileSheetOpen: vi.fn(),
    whereRef: { current: null },
    whenRef: { current: null },
    placesRef: { current: null },
    thingsRef: { current: null },
  })),
}));
vi.mock('../hooks/useTripPlannerSearch', () => ({
  useTripPlannerSearch: vi.fn(() => ({
    startQuery: '',
    endQuery: '',
    placesQuery: '',
    thingsQuery: '',
    startResults: [],
    endResults: [],
    placesResults: [],
    thingsResults: [],
    setStartQuery: vi.fn(),
    setEndQuery: vi.fn(),
    setPlacesQuery: vi.fn(),
    setThingsQuery: vi.fn(),
  })),
}));
vi.mock('../hooks/useTripPlannerCitySelection', () => ({
  useTripPlannerCitySelection: vi.fn(() => ({
    selectStartCity: vi.fn(),
    selectEndCity: vi.fn(),
    selectReturnToStart: vi.fn(),
  })),
}));
vi.mock('../hooks/useTripPlannerPlaces', () => ({
  useTripPlannerPlaces: vi.fn(() => ({
    selectedPlaceIds: [],
    selectedThingIds: [],
    selectedPlaces: [],
    selectedThings: [],
    placesSummary: 'Add trip stops',
    thingsSummary: 'Add things to do',
    setSelectedPlaceIds: vi.fn(),
    setSelectedThingIds: vi.fn(),
    selectPlace: vi.fn(),
    removePlace: vi.fn(),
    selectThing: vi.fn(),
    removeThing: vi.fn(),
    selectedPlaceData: new Map(),
    setSelectedPlaceData: vi.fn(),
  })),
}));
vi.mock('../hooks/useTripPlannerHandlers', () => ({
  useTripPlannerHandlers: vi.fn(() => ({
    handleDateRangeChange: vi.fn(),
    openWhereDesktop: vi.fn(),
    openWhenDesktop: vi.fn(),
    openPlacesDesktop: vi.fn(),
    openThingsDesktop: vi.fn(),
    openMobileSheet: vi.fn(),
    closeMobileSheet: vi.fn(),
    closePlacesMobileSheet: vi.fn(),
    closeThingsMobileSheet: vi.fn(),
  })),
}));
vi.mock('../hooks/useTripPlannerPlan', () => ({
  useTripPlannerPlan: vi.fn(() => ({
    handleSubmit: vi.fn(),
    handleChangeNights: vi.fn(),
    handleRemoveStop: vi.fn(),
    handleReorderStops: vi.fn(),
    handleStartAddStop: vi.fn(),
    handleCancelAddStop: vi.fn(),
    handleConfirmAddStop: vi.fn(),
    toggleDayOpen: vi.fn(),
    updateDayNotes: vi.fn(),
    updateDayAccommodation: vi.fn(),
    toggleRoadSectorOpen: vi.fn(),
    updateRoadSectorActivities: vi.fn(),
    convertStartToItinerary: vi.fn(),
    convertStartToRoad: vi.fn(),
    convertEndToItinerary: vi.fn(),
    convertEndToRoad: vi.fn(),
    toggleStopOpen: vi.fn(),
    expandAllStops: vi.fn(),
    collapseAllStops: vi.fn(),
    totalTripDays: 0,
    whenLabel: 'Add dates',
    whereSummary: 'Select Start City',
    placesSummary: 'Add trip stops',
    thingsSummary: 'Add things to do',
  })),
}));
vi.mock('../hooks/useTripPlannerPersistence', () => ({
  useTripPlannerPersistence: vi.fn(() => ({
    saving: false,
    saveError: null,
    saveItinerary: vi.fn(),
    loadItinerary: vi.fn(),
    saveStateToLocalStorage: vi.fn(),
    restoreStateFromLocalStorage: vi.fn(),
    clearSavedState: vi.fn(),
  })),
}));
vi.mock('@/components/AuthProvider', () => ({
  useAuth: vi.fn(() => ({ user: null })),
}));

describe('useTripPlanner (composed hook)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock all sub-hooks to return basic structure
    vi.mocked(hooks.useTripPlannerState).mockReturnValue({
      startCityId: '',
      setStartCityId: vi.fn(),
      endCityId: '',
      setEndCityId: vi.fn(),
      startCityData: null,
      setStartCityData: vi.fn(),
      endCityData: null,
      setEndCityData: vi.fn(),
      startCity: undefined,
      endCity: undefined,
      startDate: '',
      setStartDate: vi.fn(),
      endDate: '',
      setEndDate: vi.fn(),
      dateRange: undefined,
      setDateRange: vi.fn(),
      calendarMonth: new Date(),
      setCalendarMonth: vi.fn(),
      plan: null,
      setPlan: vi.fn(),
      error: null,
      setError: vi.fn(),
      hasSubmitted: false,
      setHasSubmitted: vi.fn(),
      routeStops: [],
      setRouteStops: vi.fn(),
      nightsPerStop: [],
      setNightsPerStop: vi.fn(),
      dayStopMeta: [],
      setDayStopMeta: vi.fn(),
      mapPoints: [],
      setMapPoints: vi.fn(),
      legs: [],
      setLegs: vi.fn(),
      legsLoading: false,
      setLegsLoading: vi.fn(),
      dayDetails: {},
      setDayDetails: vi.fn(),
      roadSectorDetails: {},
      setRoadSectorDetails: vi.fn(),
      startSectorType: 'road',
      setStartSectorType: vi.fn(),
      endSectorType: 'road',
      setEndSectorType: vi.fn(),
      addingStopAfterIndex: null,
      setAddingStopAfterIndex: vi.fn(),
      newStopCityId: null,
      setNewStopCityId: vi.fn(),
      openStops: {},
      setOpenStops: vi.fn(),
      recent: [],
      setRecent: vi.fn(),
      suggested: [],
      setSuggested: vi.fn(),
    } as any);
  });

  it('should compose all hooks and return unified interface', () => {
    const { result } = renderHook(() => useTripPlanner());

    // Check that all expected properties exist
    expect(result.current).toHaveProperty('startCityId');
    expect(result.current).toHaveProperty('endCityId');
    expect(result.current).toHaveProperty('startCity');
    expect(result.current).toHaveProperty('endCity');
    expect(result.current).toHaveProperty('startDate');
    expect(result.current).toHaveProperty('endDate');
    expect(result.current).toHaveProperty('plan');
    expect(result.current).toHaveProperty('error');
    expect(result.current).toHaveProperty('handleSubmit');
    expect(result.current).toHaveProperty('selectStartCity');
    expect(result.current).toHaveProperty('selectEndCity');
    expect(result.current).toHaveProperty('saveItinerary');
    expect(result.current).toHaveProperty('loadItinerary');
  });

  it('should calculate derived values', () => {
    const { result } = renderHook(() => useTripPlanner());

    expect(result.current).toHaveProperty('totalTripDays');
    expect(result.current).toHaveProperty('whenLabel');
    expect(result.current).toHaveProperty('whereSummary');
    expect(result.current).toHaveProperty('placesSummary');
    expect(result.current).toHaveProperty('thingsSummary');
  });

  it('should provide all refs', () => {
    const { result } = renderHook(() => useTripPlanner());

    expect(result.current).toHaveProperty('whereRef');
    expect(result.current).toHaveProperty('whenRef');
    expect(result.current).toHaveProperty('placesRef');
    expect(result.current).toHaveProperty('thingsRef');
  });

  it('should provide all handlers', () => {
    const { result } = renderHook(() => useTripPlanner());

    expect(result.current).toHaveProperty('handleSubmit');
    expect(result.current).toHaveProperty('handleDateRangeChange');
    expect(result.current).toHaveProperty('openWhereDesktop');
    expect(result.current).toHaveProperty('openWhenDesktop');
    expect(result.current).toHaveProperty('selectStartCity');
    expect(result.current).toHaveProperty('selectEndCity');
    expect(result.current).toHaveProperty('handleChangeNights');
    expect(result.current).toHaveProperty('handleRemoveStop');
    expect(result.current).toHaveProperty('saveItinerary');
  });
});
