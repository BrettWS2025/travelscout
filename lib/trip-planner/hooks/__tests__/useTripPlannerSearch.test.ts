import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useTripPlannerSearch } from '../useTripPlannerSearch';
import * as nzCities from '@/lib/nzCities';
import * as utils from '@/lib/trip-planner/utils';
import { NZ_STOPS } from '@/lib/nzStops';

// Mock dependencies
vi.mock('@/lib/nzCities', () => ({
  searchPlacesByName: vi.fn(),
}));

vi.mock('@/lib/trip-planner/utils', () => ({
  normalize: vi.fn((str: string) => str.toLowerCase().trim()),
  parseDisplayName: vi.fn((name: string) => ({
    cityName: name.split(',')[0],
    district: name.split(',')[1] || '',
  })),
}));

vi.mock('@/lib/nzStops', () => ({
  NZ_STOPS: [
    { id: 'stop1', name: 'Waitomo Caves', aliases: ['Waitomo'] },
    { id: 'stop2', name: 'Rotorua', aliases: [] },
  ],
}));

describe('useTripPlannerSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should initialize with empty queries and results', () => {
    const { result } = renderHook(() => useTripPlannerSearch());

    expect(result.current.startQuery).toBe('');
    expect(result.current.endQuery).toBe('');
    expect(result.current.placesQuery).toBe('');
    expect(result.current.thingsQuery).toBe('');
    expect(result.current.startResults).toEqual([]);
    expect(result.current.endResults).toEqual([]);
    expect(result.current.placesResults).toEqual([]);
    expect(result.current.thingsResults).toEqual([]);
  });

  it('should debounce search queries', async () => {
    const mockResults = [
      { id: '1', name: 'Auckland', display_name: 'Auckland, Auckland' },
    ];

    vi.mocked(nzCities.searchPlacesByName).mockResolvedValue(mockResults as any);

    const { result } = renderHook(() => useTripPlannerSearch());

    act(() => {
      result.current.setStartQuery('Auckland');
    });

    // Should not search immediately
    expect(nzCities.searchPlacesByName).not.toHaveBeenCalled();

    // Fast-forward past debounce delay
    await act(async () => {
      vi.advanceTimersByTime(300);
      await vi.runOnlyPendingTimersAsync();
    });

    await waitFor(() => {
      expect(nzCities.searchPlacesByName).toHaveBeenCalledWith('Auckland', 20);
    }, { timeout: 2000 });
  });

  it('should clear results when query is empty', async () => {
    const { result } = renderHook(() => useTripPlannerSearch());

    act(() => {
      result.current.setStartQuery('Auckland');
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
      await vi.runOnlyPendingTimersAsync();
    });

    act(() => {
      result.current.setStartQuery('');
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
      await vi.runOnlyPendingTimersAsync();
    });

    await waitFor(() => {
      expect(result.current.startResults).toEqual([]);
    }, { timeout: 2000 });
  });

  it('should search for places', async () => {
    const mockResults = [
      { id: '1', name: 'Wellington', display_name: 'Wellington, Wellington' },
    ];

    vi.mocked(nzCities.searchPlacesByName).mockResolvedValue(mockResults as any);

    const { result } = renderHook(() => useTripPlannerSearch());

    act(() => {
      result.current.setPlacesQuery('Wellington');
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
      await vi.runOnlyPendingTimersAsync();
    });

    await waitFor(() => {
      expect(result.current.placesResults.length).toBeGreaterThan(0);
    }, { timeout: 2000 });
  });

  it('should filter things by query', () => {
    const { result } = renderHook(() => useTripPlannerSearch());

    act(() => {
      result.current.setThingsQuery('waitomo');
    });

    // thingsResults is computed synchronously via useMemo
    expect(result.current.thingsResults.length).toBeGreaterThan(0);
    expect(result.current.thingsResults[0].name).toContain('Waitomo');
  });

  it('should return empty things results for empty query', () => {
    const { result } = renderHook(() => useTripPlannerSearch());

    result.current.setThingsQuery('');

    expect(result.current.thingsResults).toEqual([]);
  });

  it('should limit search results to 8', async () => {
    const mockResults = Array.from({ length: 20 }, (_, i) => ({
      id: `id-${i}`,
      name: `City ${i}`,
      display_name: `City ${i}, Region`,
    }));

    vi.mocked(nzCities.searchPlacesByName).mockResolvedValue(mockResults as any);

    const { result } = renderHook(() => useTripPlannerSearch());

    act(() => {
      result.current.setStartQuery('City');
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
      await vi.runOnlyPendingTimersAsync();
    });

    await waitFor(() => {
      expect(result.current.startResults.length).toBe(8);
    }, { timeout: 2000 });
  });

  it('should handle search errors gracefully', async () => {
    vi.mocked(nzCities.searchPlacesByName).mockRejectedValue(new Error('Search failed'));

    const { result } = renderHook(() => useTripPlannerSearch());

    act(() => {
      result.current.setStartQuery('Auckland');
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
      await vi.runOnlyPendingTimersAsync();
    });

    await waitFor(() => {
      expect(result.current.startResults).toEqual([]);
    }, { timeout: 2000 });
  });
});
