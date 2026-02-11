import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useTripPlannerPlan } from '../useTripPlannerPlan';
import * as itinerary from '@/lib/itinerary';
import * as utils from '@/lib/trip-planner/utils';
import * as api from '@/lib/trip-planner/useTripPlanner.api';
import { NZ_STOPS } from '@/lib/nzStops';

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
  allocateNightsForStops: vi.fn((stops, days) => Array(stops).fill(Math.floor(days / stops))),
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
  searchPlacesByName: vi.fn(),
  NZ_CITIES: [
    { id: 'akl', name: 'Auckland', lat: -36.8485, lng: 174.7633 },
  ],
}));

vi.mock('@/lib/nzStops', () => ({
  NZ_STOPS: [
    { id: 'stop1', name: 'Waitomo Caves', lat: -38.26, lng: 175.1 },
  ],
  orderWaypointNamesByRoute: vi.fn(() => ({
    orderedNames: [],
    matchedStopsInOrder: [],
  })),
}));

describe('useTripPlannerPlan', () => {
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
    setPlan: vi.fn(),
    setError: vi.fn(),
    setHasSubmitted: vi.fn(),
    setRouteStops: vi.fn(),
    setNightsPerStop: vi.fn(),
    setDayStopMeta: vi.fn(),
    setMapPoints: vi.fn(),
    setLegs: vi.fn(),
    setLegsLoading: vi.fn(),
    setDayDetails: vi.fn((fn) => fn({})),
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
  });

  it('should handle submit with valid input', async () => {
    const mockPlan = {
      days: [
        { dayNumber: 1, date: '2025-01-01', location: 'Auckland' },
      ],
    };

    vi.mocked(itinerary.buildTripPlanFromStopsAndNights).mockReturnValue(mockPlan as any);
    vi.mocked(utils.fetchRoadLegs).mockResolvedValue([]);

    const { result } = renderHook(() =>
      useTripPlannerPlan(
        mockStartCity as any,
        mockEndCity as any,
        'akl',
        'wlg',
        '2025-01-01',
        '2025-01-05',
        [],
        new Map(),
        [],
        [],
        new Map(),
        [],
        [],
        [],
        {},
        {},
        mockSetters.setPlan,
        mockSetters.setError,
        mockSetters.setHasSubmitted,
        mockSetters.setRouteStops,
        mockSetters.setNightsPerStop,
        mockSetters.setDayStopMeta,
        mockSetters.setMapPoints,
        mockSetters.setLegs,
        mockSetters.setLegsLoading,
        mockSetters.setDayDetails,
        mockSetters.setRoadSectorDetails,
        mockSetters.setStartSectorType,
        mockSetters.setEndSectorType,
        mockSetters.setOpenStops,
        mockSetters.setEndDate,
        mockSetters.setStartCityData,
        mockSetters.setEndCityData,
        mockSetters.setSelectedPlaceData,
        mockSetters.setDestinationData
      )
    );

    const mockEvent = {
      preventDefault: vi.fn(),
    } as any;

    await result.current.handleSubmit(mockEvent);

    expect(mockEvent.preventDefault).toHaveBeenCalled();
    expect(mockSetters.setHasSubmitted).toHaveBeenCalledWith(true);
    expect(mockSetters.setError).toHaveBeenCalledWith(null);
  });

  it('should return error if start city is missing', async () => {
    const { result } = renderHook(() =>
      useTripPlannerPlan(
        undefined,
        mockEndCity as any,
        'akl',
        'wlg',
        '2025-01-01',
        '2025-01-05',
        [],
        new Map(),
        [],
        [],
        new Map(),
        [],
        [],
        [],
        {},
        {},
        mockSetters.setPlan,
        mockSetters.setError,
        mockSetters.setHasSubmitted,
        mockSetters.setRouteStops,
        mockSetters.setNightsPerStop,
        mockSetters.setDayStopMeta,
        mockSetters.setMapPoints,
        mockSetters.setLegs,
        mockSetters.setLegsLoading,
        mockSetters.setDayDetails,
        mockSetters.setRoadSectorDetails,
        mockSetters.setStartSectorType,
        mockSetters.setEndSectorType,
        mockSetters.setOpenStops,
        mockSetters.setEndDate,
        mockSetters.setStartCityData,
        mockSetters.setEndCityData,
        mockSetters.setSelectedPlaceData,
        mockSetters.setDestinationData
      )
    );

    const mockEvent = {
      preventDefault: vi.fn(),
    } as any;

    await result.current.handleSubmit(mockEvent);

    expect(mockSetters.setError).toHaveBeenCalledWith(
      'Please select a start city.'
    );
    expect(mockSetters.setPlan).toHaveBeenCalledWith(null);
  });

  it('should return error if dates are missing', async () => {
    const { result } = renderHook(() =>
      useTripPlannerPlan(
        mockStartCity as any,
        mockEndCity as any,
        'akl',
        'wlg',
        '',
        '',
        [],
        new Map(),
        [],
        [],
        new Map(),
        [],
        [],
        [],
        {},
        {},
        mockSetters.setPlan,
        mockSetters.setError,
        mockSetters.setHasSubmitted,
        mockSetters.setRouteStops,
        mockSetters.setNightsPerStop,
        mockSetters.setDayStopMeta,
        mockSetters.setMapPoints,
        mockSetters.setLegs,
        mockSetters.setLegsLoading,
        mockSetters.setDayDetails,
        mockSetters.setRoadSectorDetails,
        mockSetters.setStartSectorType,
        mockSetters.setEndSectorType,
        mockSetters.setOpenStops,
        mockSetters.setEndDate,
        mockSetters.setStartCityData,
        mockSetters.setEndCityData,
        mockSetters.setSelectedPlaceData,
        mockSetters.setDestinationData
      )
    );

    const mockEvent = {
      preventDefault: vi.fn(),
    } as any;

    await result.current.handleSubmit(mockEvent);

    expect(mockSetters.setError).toHaveBeenCalledWith(
      'Please select your trip dates.'
    );
  });

  it('should handle change nights', () => {
    const mockPlan = {
      days: [
        { dayNumber: 1, date: '2025-01-01', location: 'Auckland' },
        { dayNumber: 2, date: '2025-01-02', location: 'Auckland' },
      ],
    };

    vi.mocked(itinerary.buildTripPlanFromStopsAndNights).mockReturnValue(mockPlan as any);

    const { result } = renderHook(() =>
      useTripPlannerPlan(
        mockStartCity as any,
        mockEndCity as any,
        'akl',
        'wlg',
        '2025-01-01',
        '2025-01-05',
        [],
        new Map(),
        [],
        [], // destinationIds
        new Map(), // destinationData
        ['Auckland', 'Wellington'], // routeStops
        [1, 1], // nightsPerStop
        [],
        {},
        {},
        mockSetters.setPlan,
        mockSetters.setError,
        mockSetters.setHasSubmitted,
        mockSetters.setRouteStops,
        mockSetters.setNightsPerStop,
        mockSetters.setDayStopMeta,
        mockSetters.setMapPoints,
        mockSetters.setLegs,
        mockSetters.setLegsLoading,
        mockSetters.setDayDetails,
        mockSetters.setRoadSectorDetails,
        mockSetters.setStartSectorType,
        mockSetters.setEndSectorType,
        mockSetters.setOpenStops,
        mockSetters.setEndDate,
        mockSetters.setStartCityData,
        mockSetters.setEndCityData,
        mockSetters.setSelectedPlaceData,
        mockSetters.setDestinationData
      )
    );

    result.current.handleChangeNights(0, 3);

    expect(mockSetters.setNightsPerStop).toHaveBeenCalled();
    expect(mockSetters.setPlan).toHaveBeenCalled();
    expect(mockSetters.setEndDate).toHaveBeenCalled();
  });

  it('should not change nights if no route stops', () => {
    const { result } = renderHook(() =>
      useTripPlannerPlan(
        mockStartCity as any,
        mockEndCity as any,
        'akl',
        'wlg',
        '2025-01-01',
        '2025-01-05',
        [],
        new Map(),
        [],
        [],
        new Map(),
        [],
        [],
        [],
        {},
        {},
        mockSetters.setPlan,
        mockSetters.setError,
        mockSetters.setHasSubmitted,
        mockSetters.setRouteStops,
        mockSetters.setNightsPerStop,
        mockSetters.setDayStopMeta,
        mockSetters.setMapPoints,
        mockSetters.setLegs,
        mockSetters.setLegsLoading,
        mockSetters.setDayDetails,
        mockSetters.setRoadSectorDetails,
        mockSetters.setStartSectorType,
        mockSetters.setEndSectorType,
        mockSetters.setOpenStops,
        mockSetters.setEndDate,
        mockSetters.setStartCityData,
        mockSetters.setEndCityData,
        mockSetters.setSelectedPlaceData,
        mockSetters.setDestinationData
      )
    );

    result.current.handleChangeNights(0, 3);

    expect(mockSetters.setNightsPerStop).not.toHaveBeenCalled();
  });

  it('should toggle day open', () => {
    const { result } = renderHook(() =>
      useTripPlannerPlan(
        mockStartCity as any,
        mockEndCity as any,
        'akl',
        'wlg',
        '2025-01-01',
        '2025-01-05',
        [],
        new Map(),
        [],
        [],
        new Map(),
        [],
        [],
        [],
        {},
        {},
        mockSetters.setPlan,
        mockSetters.setError,
        mockSetters.setHasSubmitted,
        mockSetters.setRouteStops,
        mockSetters.setNightsPerStop,
        mockSetters.setDayStopMeta,
        mockSetters.setMapPoints,
        mockSetters.setLegs,
        mockSetters.setLegsLoading,
        mockSetters.setDayDetails,
        mockSetters.setRoadSectorDetails,
        mockSetters.setStartSectorType,
        mockSetters.setEndSectorType,
        mockSetters.setOpenStops,
        mockSetters.setEndDate,
        mockSetters.setStartCityData,
        mockSetters.setEndCityData,
        mockSetters.setSelectedPlaceData,
        mockSetters.setDestinationData
      )
    );

    result.current.toggleDayOpen('2025-01-01', 'Auckland');

    expect(mockSetters.setDayDetails).toHaveBeenCalled();
  });

  it('should update day notes', () => {
    const { result } = renderHook(() =>
      useTripPlannerPlan(
        mockStartCity as any,
        mockEndCity as any,
        'akl',
        'wlg',
        '2025-01-01',
        '2025-01-05',
        [],
        new Map(),
        [],
        [],
        new Map(),
        [],
        [],
        [],
        {},
        {},
        mockSetters.setPlan,
        mockSetters.setError,
        mockSetters.setHasSubmitted,
        mockSetters.setRouteStops,
        mockSetters.setNightsPerStop,
        mockSetters.setDayStopMeta,
        mockSetters.setMapPoints,
        mockSetters.setLegs,
        mockSetters.setLegsLoading,
        mockSetters.setDayDetails,
        mockSetters.setRoadSectorDetails,
        mockSetters.setStartSectorType,
        mockSetters.setEndSectorType,
        mockSetters.setOpenStops,
        mockSetters.setEndDate,
        mockSetters.setStartCityData,
        mockSetters.setEndCityData,
        mockSetters.setSelectedPlaceData,
        mockSetters.setDestinationData
      )
    );

    result.current.updateDayNotes('2025-01-01', 'Auckland', 'Test notes');

    expect(mockSetters.setDayDetails).toHaveBeenCalled();
  });

  it('should toggle stop open', () => {
    const { result } = renderHook(() =>
      useTripPlannerPlan(
        mockStartCity as any,
        mockEndCity as any,
        'akl',
        'wlg',
        '2025-01-01',
        '2025-01-05',
        [],
        new Map(),
        [],
        [], // destinationIds
        new Map(), // destinationData
        ['Auckland', 'Wellington'], // routeStops
        [1, 1], // nightsPerStop
        [],
        {},
        { 0: false },
        mockSetters.setPlan,
        mockSetters.setError,
        mockSetters.setHasSubmitted,
        mockSetters.setRouteStops,
        mockSetters.setNightsPerStop,
        mockSetters.setDayStopMeta,
        mockSetters.setMapPoints,
        mockSetters.setLegs,
        mockSetters.setLegsLoading,
        mockSetters.setDayDetails,
        mockSetters.setRoadSectorDetails,
        mockSetters.setStartSectorType,
        mockSetters.setEndSectorType,
        mockSetters.setOpenStops,
        mockSetters.setEndDate,
        mockSetters.setStartCityData,
        mockSetters.setEndCityData,
        mockSetters.setSelectedPlaceData,
        mockSetters.setDestinationData
      )
    );

    result.current.toggleStopOpen(0);

    expect(mockSetters.setOpenStops).toHaveBeenCalled();
  });

  it('should expand all stops', () => {
    const { result } = renderHook(() =>
      useTripPlannerPlan(
        mockStartCity as any,
        mockEndCity as any,
        'akl',
        'wlg',
        '2025-01-01',
        '2025-01-05',
        [],
        new Map(),
        [],
        [], // destinationIds
        new Map(), // destinationData
        ['Auckland', 'Wellington'], // routeStops
        [1, 1], // nightsPerStop
        [],
        {},
        {},
        mockSetters.setPlan,
        mockSetters.setError,
        mockSetters.setHasSubmitted,
        mockSetters.setRouteStops,
        mockSetters.setNightsPerStop,
        mockSetters.setDayStopMeta,
        mockSetters.setMapPoints,
        mockSetters.setLegs,
        mockSetters.setLegsLoading,
        mockSetters.setDayDetails,
        mockSetters.setRoadSectorDetails,
        mockSetters.setStartSectorType,
        mockSetters.setEndSectorType,
        mockSetters.setOpenStops,
        mockSetters.setEndDate,
        mockSetters.setStartCityData,
        mockSetters.setEndCityData,
        mockSetters.setSelectedPlaceData,
        mockSetters.setDestinationData
      )
    );

    result.current.expandAllStops();

    expect(mockSetters.setOpenStops).toHaveBeenCalledWith({ 0: true, 1: true });
  });

  it('should collapse all stops', () => {
    const { result } = renderHook(() =>
      useTripPlannerPlan(
        mockStartCity as any,
        mockEndCity as any,
        'akl',
        'wlg',
        '2025-01-01',
        '2025-01-05',
        [],
        new Map(),
        [],
        [],
        new Map(),
        [],
        [],
        [],
        {},
        {},
        mockSetters.setPlan,
        mockSetters.setError,
        mockSetters.setHasSubmitted,
        mockSetters.setRouteStops,
        mockSetters.setNightsPerStop,
        mockSetters.setDayStopMeta,
        mockSetters.setMapPoints,
        mockSetters.setLegs,
        mockSetters.setLegsLoading,
        mockSetters.setDayDetails,
        mockSetters.setRoadSectorDetails,
        mockSetters.setStartSectorType,
        mockSetters.setEndSectorType,
        mockSetters.setOpenStops,
        mockSetters.setEndDate,
        mockSetters.setStartCityData,
        mockSetters.setEndCityData,
        mockSetters.setSelectedPlaceData,
        mockSetters.setDestinationData
      )
    );

    result.current.collapseAllStops();

    expect(mockSetters.setOpenStops).toHaveBeenCalledWith({});
  });
});
