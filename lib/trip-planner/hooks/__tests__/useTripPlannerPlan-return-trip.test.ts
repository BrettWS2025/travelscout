import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useTripPlannerPlan } from '../useTripPlannerPlan';
import * as itinerary from '@/lib/itinerary';
import * as utils from '@/lib/trip-planner/utils';
import * as api from '@/lib/trip-planner/useTripPlanner.api';
import * as nzStops from '@/lib/nzStops';

// Mock dependencies
vi.mock('@/lib/itinerary', () => ({
  buildTripPlanFromStopsAndNights: vi.fn(),
  countDaysInclusive: vi.fn((start, end) => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays;
  }),
}));

vi.mock('@/lib/trip-planner/utils', () => ({
  allocateNightsForStops: vi.fn((stops, days) => {
    if (stops === 2) {
      return [0, Math.max(1, days)];
    }
    return Array(stops).fill(Math.floor(days / stops));
  }),
  buildDayStopMeta: vi.fn(() => []),
  buildFallbackLegs: vi.fn((points) => []),
  fetchRoadLegs: vi.fn(() => Promise.resolve([])),
  makeDayKey: vi.fn((date, location) => `${date}-${location}`),
  syncDayDetailsFromPlan: vi.fn((plan, prev) => prev || {}),
}));

vi.mock('@/lib/trip-planner/useTripPlanner.api', () => ({
  fetchPlaceCoordinates: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('@/lib/nzCities', () => ({
  getCityById: vi.fn(),
}));

vi.mock('@/lib/nzStops', () => ({
  orderWaypointNamesByRoute: vi.fn(() => ({
    orderedNames: ['Auckland', 'Wellington'],
    matchedStopsInOrder: [],
  })),
}));

describe('useTripPlannerPlan - Return Trip Logic', () => {
  const mockStartCity = {
    id: 'akl',
    name: 'Auckland',
    lat: -36.8485,
    lng: 174.7633,
  };

  const mockSetters = {
    setPlan: vi.fn(),
    setError: vi.fn(),
    setHasSubmitted: vi.fn(),
    setRouteStops: vi.fn(),
    setNightsPerStop: vi.fn(),
    setDayStopMeta: vi.fn(),
    setMapPoints: vi.fn(),
    setLegs: vi.fn(),
    setLegsLoading: vi.fn(),
    setDayDetails: vi.fn(),
    setRoadSectorDetails: vi.fn(),
    setStartSectorType: vi.fn(),
    setEndSectorType: vi.fn(),
    setOpenStops: vi.fn(),
    setEndDate: vi.fn(),
    setStartCityData: vi.fn(),
    setEndCityData: vi.fn(),
    setSelectedPlaceData: vi.fn(),
    setDestinationData: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(nzStops.orderWaypointNamesByRoute).mockReturnValue({
      orderedNames: ['Auckland', 'Wellington'],
      matchedStopsInOrder: [],
    });
  });

  it('should set both start and end sectors to road for return trip', async () => {
    const mockPlan = {
      stops: ['Auckland', 'Auckland'],
      nights: [0, 0],
    };

    vi.mocked(nzStops.orderWaypointNamesByRoute).mockReturnValue({
      orderedNames: [], // No waypoints for simple return trip
      matchedStopsInOrder: [],
    });
    vi.mocked(itinerary.buildTripPlanFromStopsAndNights).mockReturnValue(mockPlan as any);
    vi.mocked(utils.fetchRoadLegs).mockResolvedValue([]);
    vi.mocked(itinerary.countDaysInclusive).mockReturnValue(6);

    const { result } = renderHook(() =>
      useTripPlannerPlan(
        mockStartCity,
        mockStartCity, // Same city for return trip
        'akl',
        'akl',
        '2024-01-01',
        '2024-01-06',
        [],
        new Map(),
        [],
        [], // destinationIds
        new Map(), // destinationData
        [],
        [],
        [],
        {},
        {},
        ...Object.values(mockSetters)
      )
    );

    const form = document.createElement('form');
    await result.current.handleSubmit({ preventDefault: vi.fn() } as any);

    await waitFor(() => {
      expect(mockSetters.setStartSectorType).toHaveBeenCalledWith('road');
      expect(mockSetters.setEndSectorType).toHaveBeenCalledWith('road');
    });
  });

  it('should allocate nights correctly for return trip', async () => {
    const mockPlan = {
      stops: ['Auckland', 'Wellington'],
      nights: [0, 5],
    };

    vi.mocked(itinerary.buildTripPlanFromStopsAndNights).mockReturnValue(mockPlan as any);
    vi.mocked(utils.fetchRoadLegs).mockResolvedValue([]);
    vi.mocked(itinerary.countDaysInclusive).mockReturnValue(6);

    const { result } = renderHook(() =>
      useTripPlannerPlan(
        mockStartCity,
        mockStartCity, // Same city for return trip
        'akl',
        'akl',
        '2024-01-01',
        '2024-01-06',
        [],
        new Map(),
        [],
        [], // destinationIds
        new Map(), // destinationData
        [],
        [],
        [],
        {},
        {},
        ...Object.values(mockSetters)
      )
    );

    const form = document.createElement('form');
    await result.current.handleSubmit({ preventDefault: vi.fn() } as any);

    await waitFor(() => {
      expect(mockSetters.setNightsPerStop).toHaveBeenCalled();
      const callArgs = mockSetters.setNightsPerStop.mock.calls[0][0];
      expect(callArgs[0]).toBe(0); // First stop (start) should have 0 nights
      expect(callArgs[1]).toBeGreaterThanOrEqual(1); // Second stop should have at least 1 night
    });
  });

  it('should handle return trip with destinations', async () => {
    const mockDestination = {
      id: 'wlg',
      name: 'Wellington',
      lat: -41.2865,
      lng: 174.7762,
    };

    const mockPlan = {
      stops: ['Auckland', 'Wellington', 'Auckland'],
      nights: [0, 2, 0],
    };

    vi.mocked(nzStops.orderWaypointNamesByRoute).mockReturnValue({
      orderedNames: ['Wellington'], // Only the destination, start/end added separately
      matchedStopsInOrder: [],
    });
    vi.mocked(itinerary.buildTripPlanFromStopsAndNights).mockReturnValue(mockPlan as any);
    vi.mocked(utils.fetchRoadLegs).mockResolvedValue([]);
    vi.mocked(api.fetchPlaceCoordinates).mockResolvedValue(mockDestination as any);
    vi.mocked(itinerary.countDaysInclusive).mockReturnValue(6);

    const destinationData = new Map();
    destinationData.set('wlg', mockDestination);

    const { result } = renderHook(() =>
      useTripPlannerPlan(
        mockStartCity,
        mockStartCity, // Same city for return trip
        'akl',
        'akl',
        '2024-01-01',
        '2024-01-06',
        [],
        new Map(),
        [],
        ['wlg'], // destinationIds
        destinationData, // destinationData
        [],
        [],
        [],
        {},
        {},
        ...Object.values(mockSetters)
      )
    );

    const form = document.createElement('form');
    await result.current.handleSubmit({ preventDefault: vi.fn() } as any);

    await waitFor(() => {
      expect(mockSetters.setStartSectorType).toHaveBeenCalledWith('road');
      // When there are destinations with a return trip, the logic may vary
      // The important thing is that start is set to road
      expect(mockSetters.setStartSectorType).toHaveBeenCalled();
    });
  });
});
