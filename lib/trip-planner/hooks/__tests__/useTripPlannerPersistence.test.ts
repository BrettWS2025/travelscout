import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useTripPlannerPersistence } from '../useTripPlannerPersistence';
import * as api from '@/lib/trip-planner/useTripPlanner.api';
import * as utils from '@/lib/trip-planner/utils';
import { NZ_CITIES } from '@/lib/nzCities';
import { NZ_STOPS } from '@/lib/nzStops';

// Mock dependencies
vi.mock('@/lib/trip-planner/useTripPlanner.api', () => ({
  saveItineraryToSupabase: vi.fn(),
}));

vi.mock('@/lib/trip-planner/utils', () => ({
  buildDayStopMeta: vi.fn(() => []),
  fromIsoDate: vi.fn((date: string) => (date ? new Date(date) : null)),
  syncDayDetailsFromPlan: vi.fn((plan, prev) => prev || {}),
  makeDayKey: vi.fn((date: string, location: string) => `${date}-${location}`),
}));

vi.mock('@/lib/nzCities', () => ({
  NZ_CITIES: [
    { id: 'akl', name: 'Auckland' },
    { id: 'wlg', name: 'Wellington' },
  ],
}));

vi.mock('@/lib/nzStops', () => ({
  NZ_STOPS: [
    { id: 'stop1', name: 'Waitomo Caves' },
  ],
}));

describe('useTripPlannerPersistence', () => {
  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
  } as any;

  const mockPlan = {
    days: [
      { dayNumber: 1, date: '2025-01-01', location: 'Auckland' },
    ],
  };

  const mockStartCity = {
    id: 'akl',
    name: 'Auckland',
    lat: -36.8485,
    lng: 174.7633,
  };

  const mockEndCity = {
    id: 'wlg',
    name: 'Wellington',
    lat: -41.2865,
    lng: 174.7762,
  };

  const mockSetters = {
    setStartCityId: vi.fn(),
    setEndCityId: vi.fn(),
    setStartDate: vi.fn(),
    setEndDate: vi.fn(),
    setDateRange: vi.fn(),
    setCalendarMonth: vi.fn(),
    setSelectedPlaceIds: vi.fn(),
    setSelectedThingIds: vi.fn(),
    setRouteStops: vi.fn(),
    setNightsPerStop: vi.fn(),
    setDayStopMeta: vi.fn(),
    setPlan: vi.fn(),
    setDayDetails: vi.fn((arg: any) => {
      // Handle both function and direct value updates
      if (typeof arg === 'function') {
        return arg({});
      }
      return arg;
    }),
    setMapPoints: vi.fn(),
    setLegs: vi.fn(),
    setHasSubmitted: vi.fn(),
    setError: vi.fn(),
    setStartSectorType: vi.fn(),
    setEndSectorType: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear localStorage
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('saveItinerary', () => {
    it('should return error if user is not logged in', async () => {
      const { result } = renderHook(() =>
        useTripPlannerPersistence(
          null,
          mockPlan as any,
          mockStartCity as any,
          mockEndCity as any,
          'akl',
          'wlg',
          '2025-01-01',
          '2025-01-05',
          [],
          [],
          [],
          [],
          [],
          [],
          [],
          {},
          [],
          [],
          'itinerary',
          'itinerary',
          mockSetters.setStartCityId,
          mockSetters.setEndCityId,
          mockSetters.setStartDate,
          mockSetters.setEndDate,
          mockSetters.setDateRange,
          mockSetters.setCalendarMonth,
          mockSetters.setSelectedPlaceIds,
          mockSetters.setSelectedThingIds,
          mockSetters.setRouteStops,
          mockSetters.setNightsPerStop,
          mockSetters.setDayStopMeta,
          mockSetters.setPlan,
          mockSetters.setDayDetails,
          mockSetters.setMapPoints,
          mockSetters.setLegs,
          mockSetters.setHasSubmitted,
          mockSetters.setError,
          mockSetters.setStartSectorType,
          mockSetters.setEndSectorType
        )
      );

      const response = await result.current.saveItinerary('Test Trip');

      expect(response.success).toBe(false);
      expect(response.error).toBe('You must be logged in to save an itinerary');
    });

    it('should return error if no plan', async () => {
      const { result } = renderHook(() =>
        useTripPlannerPersistence(
          mockUser,
          null,
          mockStartCity as any,
          mockEndCity as any,
          'akl',
          'wlg',
          '2025-01-01',
          '2025-01-05',
          [],
          [],
          [],
          [],
          [],
          [],
          [],
          {},
          [],
          [],
          'itinerary',
          'itinerary',
          mockSetters.setStartCityId,
          mockSetters.setEndCityId,
          mockSetters.setStartDate,
          mockSetters.setEndDate,
          mockSetters.setDateRange,
          mockSetters.setCalendarMonth,
          mockSetters.setSelectedPlaceIds,
          mockSetters.setSelectedThingIds,
          mockSetters.setRouteStops,
          mockSetters.setNightsPerStop,
          mockSetters.setDayStopMeta,
          mockSetters.setPlan,
          mockSetters.setDayDetails,
          mockSetters.setMapPoints,
          mockSetters.setLegs,
          mockSetters.setHasSubmitted,
          mockSetters.setError,
          mockSetters.setStartSectorType,
          mockSetters.setEndSectorType
        )
      );

      const response = await result.current.saveItinerary('Test Trip');

      expect(response.success).toBe(false);
      expect(response.error).toBe('No itinerary to save');
    });

    it('should save itinerary successfully', async () => {
      vi.mocked(api.saveItineraryToSupabase).mockResolvedValue({ success: true });

      const { result } = renderHook(() =>
        useTripPlannerPersistence(
          mockUser,
          mockPlan as any,
          mockStartCity as any,
          mockEndCity as any,
          'akl',
          'wlg',
          '2025-01-01',
          '2025-01-05',
          [],
          [],
          [],
          [],
          [],
          [],
          [],
          {},
          [],
          [],
          'itinerary',
          'itinerary',
          mockSetters.setStartCityId,
          mockSetters.setEndCityId,
          mockSetters.setStartDate,
          mockSetters.setEndDate,
          mockSetters.setDateRange,
          mockSetters.setCalendarMonth,
          mockSetters.setSelectedPlaceIds,
          mockSetters.setSelectedThingIds,
          mockSetters.setRouteStops,
          mockSetters.setNightsPerStop,
          mockSetters.setDayStopMeta,
          mockSetters.setPlan,
          mockSetters.setDayDetails,
          mockSetters.setMapPoints,
          mockSetters.setLegs,
          mockSetters.setHasSubmitted,
          mockSetters.setError,
          mockSetters.setStartSectorType,
          mockSetters.setEndSectorType
        )
      );

      const response = await result.current.saveItinerary('Test Trip');

      expect(response.success).toBe(true);
      expect(api.saveItineraryToSupabase).toHaveBeenCalled();
    });
  });

  describe('loadItinerary', () => {
    it('should return error for invalid data', () => {
      const { result } = renderHook(() =>
        useTripPlannerPersistence(
          mockUser,
          mockPlan as any,
          mockStartCity as any,
          mockEndCity as any,
          'akl',
          'wlg',
          '2025-01-01',
          '2025-01-05',
          [],
          [],
          [],
          [],
          [],
          [],
          [],
          {},
          [],
          [],
          'itinerary',
          'itinerary',
          mockSetters.setStartCityId,
          mockSetters.setEndCityId,
          mockSetters.setStartDate,
          mockSetters.setEndDate,
          mockSetters.setDateRange,
          mockSetters.setCalendarMonth,
          mockSetters.setSelectedPlaceIds,
          mockSetters.setSelectedThingIds,
          mockSetters.setRouteStops,
          mockSetters.setNightsPerStop,
          mockSetters.setDayStopMeta,
          mockSetters.setPlan,
          mockSetters.setDayDetails,
          mockSetters.setMapPoints,
          mockSetters.setLegs,
          mockSetters.setHasSubmitted,
          mockSetters.setError,
          mockSetters.setStartSectorType,
          mockSetters.setEndSectorType
        )
      );

      const response = result.current.loadItinerary(null as any, null as any);

      expect(response.success).toBe(false);
      expect(response.error).toBe('Invalid itinerary data');
    });

    it('should load itinerary successfully', () => {
      const tripInput = {
        startCity: { ...mockStartCity, id: 'akl' },
        endCity: { ...mockEndCity, id: 'wlg' },
        startDate: '2025-01-01',
        endDate: '2025-01-05',
        waypoints: [],
      };

      const tripPlan = {
        days: [{ dayNumber: 1, date: '2025-01-01', location: 'Auckland' }],
        routeStops: ['Auckland', 'Wellington'],
        nightsPerStop: [1, 1],
      };

      const { result } = renderHook(() =>
        useTripPlannerPersistence(
          mockUser,
          mockPlan as any,
          mockStartCity as any,
          mockEndCity as any,
          'akl',
          'wlg',
          '2025-01-01',
          '2025-01-05',
          [],
          [],
          [],
          [],
          [],
          [],
          [],
          {},
          [],
          [],
          'itinerary',
          'itinerary',
          mockSetters.setStartCityId,
          mockSetters.setEndCityId,
          mockSetters.setStartDate,
          mockSetters.setEndDate,
          mockSetters.setDateRange,
          mockSetters.setCalendarMonth,
          mockSetters.setSelectedPlaceIds,
          mockSetters.setSelectedThingIds,
          mockSetters.setRouteStops,
          mockSetters.setNightsPerStop,
          mockSetters.setDayStopMeta,
          mockSetters.setPlan,
          mockSetters.setDayDetails,
          mockSetters.setMapPoints,
          mockSetters.setLegs,
          mockSetters.setHasSubmitted,
          mockSetters.setError,
          mockSetters.setStartSectorType,
          mockSetters.setEndSectorType
        )
      );

      const response = result.current.loadItinerary(tripInput as any, tripPlan);

      // Debug: log the response to see what's happening
      if (!response.success) {
        console.log('loadItinerary failed:', response.error);
      }

      // loadItinerary should return success: true
      expect(response.success).toBe(true);
      
      // Verify setters were called (they're called synchronously)
      expect(mockSetters.setStartCityId).toHaveBeenCalledWith('akl');
      expect(mockSetters.setEndCityId).toHaveBeenCalledWith('wlg');
      expect(mockSetters.setStartDate).toHaveBeenCalledWith('2025-01-01');
      expect(mockSetters.setEndDate).toHaveBeenCalledWith('2025-01-05');
    });
  });

  describe('localStorage persistence', () => {
    it('should save state to localStorage', () => {
      const { result } = renderHook(() =>
        useTripPlannerPersistence(
          mockUser,
          mockPlan as any,
          mockStartCity as any,
          mockEndCity as any,
          'akl',
          'wlg',
          '2025-01-01',
          '2025-01-05',
          [],
          [],
          [],
          [],
          [],
          [],
          [],
          {},
          [],
          [],
          'itinerary',
          'itinerary',
          mockSetters.setStartCityId,
          mockSetters.setEndCityId,
          mockSetters.setStartDate,
          mockSetters.setEndDate,
          mockSetters.setDateRange,
          mockSetters.setCalendarMonth,
          mockSetters.setSelectedPlaceIds,
          mockSetters.setSelectedThingIds,
          mockSetters.setRouteStops,
          mockSetters.setNightsPerStop,
          mockSetters.setDayStopMeta,
          mockSetters.setPlan,
          mockSetters.setDayDetails,
          mockSetters.setMapPoints,
          mockSetters.setLegs,
          mockSetters.setHasSubmitted,
          mockSetters.setError,
          mockSetters.setStartSectorType,
          mockSetters.setEndSectorType
        )
      );

      result.current.saveStateToLocalStorage();

      const saved = localStorage.getItem('tripPlanner_draft');
      expect(saved).toBeTruthy();

      const parsed = JSON.parse(saved!);
      expect(parsed.startCityId).toBe('akl');
      expect(parsed.endCityId).toBe('wlg');
      expect(parsed.startDate).toBe('2025-01-01');
      expect(parsed.endDate).toBe('2025-01-05');
    });

    it('should not save incomplete state', () => {
      const { result } = renderHook(() =>
        useTripPlannerPersistence(
          mockUser,
          mockPlan as any,
          undefined,
          mockEndCity as any,
          '',
          'wlg',
          '',
          '2025-01-05',
          [],
          [],
          [],
          [],
          [],
          [],
          [],
          {},
          [],
          [],
          'itinerary',
          'itinerary',
          mockSetters.setStartCityId,
          mockSetters.setEndCityId,
          mockSetters.setStartDate,
          mockSetters.setEndDate,
          mockSetters.setDateRange,
          mockSetters.setCalendarMonth,
          mockSetters.setSelectedPlaceIds,
          mockSetters.setSelectedThingIds,
          mockSetters.setRouteStops,
          mockSetters.setNightsPerStop,
          mockSetters.setDayStopMeta,
          mockSetters.setPlan,
          mockSetters.setDayDetails,
          mockSetters.setMapPoints,
          mockSetters.setLegs,
          mockSetters.setHasSubmitted,
          mockSetters.setError,
          mockSetters.setStartSectorType,
          mockSetters.setEndSectorType
        )
      );

      result.current.saveStateToLocalStorage();

      const saved = localStorage.getItem('tripPlanner_draft');
      expect(saved).toBeNull();
    });

    it('should restore state from localStorage', () => {
      const state = {
        startCityId: 'akl',
        endCityId: 'wlg',
        startDate: '2025-01-01',
        endDate: '2025-01-05',
        selectedPlaceIds: [],
        selectedThingIds: [],
        routeStops: ['Auckland', 'Wellington'],
        nightsPerStop: [1, 1],
        plan: null,
      };

      localStorage.setItem('tripPlanner_draft', JSON.stringify(state));

      const { result } = renderHook(() =>
        useTripPlannerPersistence(
          mockUser,
          mockPlan as any,
          mockStartCity as any,
          mockEndCity as any,
          'akl',
          'wlg',
          '2025-01-01',
          '2025-01-05',
          [],
          [],
          [],
          [],
          [],
          [],
          [],
          {},
          [],
          [],
          'itinerary',
          'itinerary',
          mockSetters.setStartCityId,
          mockSetters.setEndCityId,
          mockSetters.setStartDate,
          mockSetters.setEndDate,
          mockSetters.setDateRange,
          mockSetters.setCalendarMonth,
          mockSetters.setSelectedPlaceIds,
          mockSetters.setSelectedThingIds,
          mockSetters.setRouteStops,
          mockSetters.setNightsPerStop,
          mockSetters.setDayStopMeta,
          mockSetters.setPlan,
          mockSetters.setDayDetails,
          mockSetters.setMapPoints,
          mockSetters.setLegs,
          mockSetters.setHasSubmitted,
          mockSetters.setError,
          mockSetters.setStartSectorType,
          mockSetters.setEndSectorType
        )
      );

      const restored = result.current.restoreStateFromLocalStorage();

      expect(restored).toBe(true);
      expect(mockSetters.setStartCityId).toHaveBeenCalledWith('akl');
      expect(mockSetters.setEndCityId).toHaveBeenCalledWith('wlg');
      expect(mockSetters.setStartDate).toHaveBeenCalledWith('2025-01-01');
      expect(mockSetters.setEndDate).toHaveBeenCalledWith('2025-01-05');
    });

    it('should return false for invalid localStorage data', () => {
      localStorage.setItem('tripPlanner_draft', 'invalid-json');

      const { result } = renderHook(() =>
        useTripPlannerPersistence(
          mockUser,
          mockPlan as any,
          mockStartCity as any,
          mockEndCity as any,
          'akl',
          'wlg',
          '2025-01-01',
          '2025-01-05',
          [],
          [],
          [],
          [],
          [],
          [],
          [],
          {},
          [],
          [],
          'itinerary',
          'itinerary',
          mockSetters.setStartCityId,
          mockSetters.setEndCityId,
          mockSetters.setStartDate,
          mockSetters.setEndDate,
          mockSetters.setDateRange,
          mockSetters.setCalendarMonth,
          mockSetters.setSelectedPlaceIds,
          mockSetters.setSelectedThingIds,
          mockSetters.setRouteStops,
          mockSetters.setNightsPerStop,
          mockSetters.setDayStopMeta,
          mockSetters.setPlan,
          mockSetters.setDayDetails,
          mockSetters.setMapPoints,
          mockSetters.setLegs,
          mockSetters.setHasSubmitted,
          mockSetters.setError,
          mockSetters.setStartSectorType,
          mockSetters.setEndSectorType
        )
      );

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const restored = result.current.restoreStateFromLocalStorage();

      expect(restored).toBe(false);
      consoleSpy.mockRestore();
    });

    it('should clear saved state', () => {
      localStorage.setItem('tripPlanner_draft', JSON.stringify({ test: 'data' }));

      const { result } = renderHook(() =>
        useTripPlannerPersistence(
          mockUser,
          mockPlan as any,
          mockStartCity as any,
          mockEndCity as any,
          'akl',
          'wlg',
          '2025-01-01',
          '2025-01-05',
          [],
          [],
          [],
          [],
          [],
          [],
          [],
          {},
          [],
          [],
          'itinerary',
          'itinerary',
          mockSetters.setStartCityId,
          mockSetters.setEndCityId,
          mockSetters.setStartDate,
          mockSetters.setEndDate,
          mockSetters.setDateRange,
          mockSetters.setCalendarMonth,
          mockSetters.setSelectedPlaceIds,
          mockSetters.setSelectedThingIds,
          mockSetters.setRouteStops,
          mockSetters.setNightsPerStop,
          mockSetters.setDayStopMeta,
          mockSetters.setPlan,
          mockSetters.setDayDetails,
          mockSetters.setMapPoints,
          mockSetters.setLegs,
          mockSetters.setHasSubmitted,
          mockSetters.setError,
          mockSetters.setStartSectorType,
          mockSetters.setEndSectorType
        )
      );

      result.current.clearSavedState();

      const saved = localStorage.getItem('tripPlanner_draft');
      expect(saved).toBeNull();
    });
  });
});
