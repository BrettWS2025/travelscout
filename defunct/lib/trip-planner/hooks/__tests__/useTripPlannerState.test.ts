import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useTripPlannerState } from '../useTripPlannerState';
import * as nzCities from '@/lib/nzCities';
import * as utils from '@/lib/trip-planner/utils';

// Mock dependencies
vi.mock('@/lib/nzCities', () => ({
  getCityById: vi.fn(),
  getAllPlaces: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/lib/trip-planner/utils', () => ({
  pickSuggestedCities: vi.fn(() => []),
  safeReadRecent: vi.fn(() => []),
}));

describe('useTripPlannerState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with default values', () => {
    const { result } = renderHook(() => useTripPlannerState());

    expect(result.current.startCityId).toBe('');
    expect(result.current.endCityId).toBe('');
    expect(result.current.startDate).toBe('');
    expect(result.current.endDate).toBe('');
    expect(result.current.plan).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.hasSubmitted).toBe(false);
    expect(result.current.routeStops).toEqual([]);
    expect(result.current.nightsPerStop).toEqual([]);
    expect(result.current.mapPoints).toEqual([]);
    expect(result.current.legs).toEqual([]);
    expect(result.current.legsLoading).toBe(false);
  });

  it('should update startCityId', async () => {
    const { result } = renderHook(() => useTripPlannerState());

    act(() => {
      result.current.setStartCityId('akl');
    });

    await waitFor(() => {
      expect(result.current.startCityId).toBe('akl');
    });
  });

  it('should update endCityId', async () => {
    const { result } = renderHook(() => useTripPlannerState());

    act(() => {
      result.current.setEndCityId('wlg');
    });

    await waitFor(() => {
      expect(result.current.endCityId).toBe('wlg');
    });
  });

  it('should update dates', async () => {
    const { result } = renderHook(() => useTripPlannerState());

    act(() => {
      result.current.setStartDate('2025-01-01');
      result.current.setEndDate('2025-01-05');
    });

    await waitFor(() => {
      expect(result.current.startDate).toBe('2025-01-01');
      expect(result.current.endDate).toBe('2025-01-05');
    });
  });

  it('should update dateRange', async () => {
    const { result } = renderHook(() => useTripPlannerState());

    const dateRange = {
      from: new Date('2025-01-01'),
      to: new Date('2025-01-05'),
    };

    act(() => {
      result.current.setDateRange(dateRange);
    });

    await waitFor(() => {
      expect(result.current.dateRange).toEqual(dateRange);
    });
  });

  it('should update plan', async () => {
    const { result } = renderHook(() => useTripPlannerState());

    const mockPlan = {
      days: [
        { dayNumber: 1, date: '2025-01-01', location: 'Auckland' },
      ],
    };

    act(() => {
      result.current.setPlan(mockPlan as any);
    });

    await waitFor(() => {
      expect(result.current.plan).toEqual(mockPlan);
    });
  });

  it('should update error', async () => {
    const { result } = renderHook(() => useTripPlannerState());

    act(() => {
      result.current.setError('Test error');
    });

    await waitFor(() => {
      expect(result.current.error).toBe('Test error');
    });

    act(() => {
      result.current.setError(null);
    });

    await waitFor(() => {
      expect(result.current.error).toBeNull();
    });
  });

  it('should update routeStops', async () => {
    const { result } = renderHook(() => useTripPlannerState());

    const stops = ['Auckland', 'Wellington', 'Christchurch'];
    
    act(() => {
      result.current.setRouteStops(stops);
    });

    await waitFor(() => {
      expect(result.current.routeStops).toEqual(stops);
    });
  });

  it('should update nightsPerStop', async () => {
    const { result } = renderHook(() => useTripPlannerState());

    const nights = [2, 1, 1];
    
    act(() => {
      result.current.setNightsPerStop(nights);
    });

    await waitFor(() => {
      expect(result.current.nightsPerStop).toEqual(nights);
    });
  });

  it('should update mapPoints', async () => {
    const { result } = renderHook(() => useTripPlannerState());

    const points = [
      { lat: -36.8485, lng: 174.7633, name: 'Auckland' },
      { lat: -41.2865, lng: 174.7762, name: 'Wellington' },
    ];

    act(() => {
      result.current.setMapPoints(points);
    });

    await waitFor(() => {
      expect(result.current.mapPoints).toEqual(points);
    });
  });

  it('should update legsLoading', async () => {
    const { result } = renderHook(() => useTripPlannerState());

    act(() => {
      result.current.setLegsLoading(true);
    });

    await waitFor(() => {
      expect(result.current.legsLoading).toBe(true);
    });

    act(() => {
      result.current.setLegsLoading(false);
    });

    await waitFor(() => {
      expect(result.current.legsLoading).toBe(false);
    });
  });

  it('should update openStops', async () => {
    const { result } = renderHook(() => useTripPlannerState());

    act(() => {
      result.current.setOpenStops({ 0: true, 1: false });
    });

    await waitFor(() => {
      expect(result.current.openStops).toEqual({ 0: true, 1: false });
    });
  });

  it('should load recent cities on mount', () => {
    const mockRecent = [
      { id: 'akl', name: 'Auckland' },
      { id: 'wlg', name: 'Wellington' },
    ];

    vi.mocked(utils.safeReadRecent).mockReturnValue(mockRecent);

    const { result } = renderHook(() => useTripPlannerState());

    expect(result.current.recent).toEqual(mockRecent);
  });
});
