import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useTripPlannerCitySelection } from '../useTripPlannerCitySelection';
import * as nzCities from '@/lib/nzCities';
import * as api from '@/lib/trip-planner/useTripPlanner.api';
import * as utils from '@/lib/trip-planner/useTripPlanner.utils';

// Mock dependencies
vi.mock('@/lib/nzCities', () => ({
  getCityById: vi.fn(),
  searchPlacesByName: vi.fn(),
}));

vi.mock('@/lib/trip-planner/useTripPlanner.api', () => ({
  fetchPlaceCoordinates: vi.fn(),
}));

vi.mock('@/lib/trip-planner/useTripPlanner.utils', () => ({
  pushRecent: vi.fn((city, recent) => [city, ...recent.filter((r: any) => r.id !== city.id)].slice(0, 5)),
}));

describe('useTripPlannerCitySelection', () => {
  const mockStartSearchResults = [
    { id: 'akl', name: 'Auckland', cityName: 'Auckland', district: '' },
  ];
  const mockEndSearchResults = [
    { id: 'wlg', name: 'Wellington', cityName: 'Wellington', district: '' },
  ];
  const mockRecent: any[] = [];
  const mockSetRecent = vi.fn();
  const mockSetStartCityId = vi.fn();
  const mockSetEndCityId = vi.fn();
  const mockSetStartCityData = vi.fn();
  const mockSetEndCityData = vi.fn();
  const mockSetStartQuery = vi.fn();
  const mockSetEndQuery = vi.fn();
  const mockSetWhereStep = vi.fn();
  const mockStartCity = {
    id: 'akl',
    name: 'Auckland',
    lat: -36.8485,
    lng: 174.7633,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should select start city from cache', async () => {
    const mockCity = {
      id: 'akl',
      name: 'Auckland',
      display_name: 'Auckland, Auckland',
      lat: -36.8485,
      lng: 174.7633,
    };

    vi.mocked(nzCities.getCityById).mockReturnValue(mockCity as any);

    const { result } = renderHook(() =>
      useTripPlannerCitySelection(
        mockStartSearchResults,
        mockEndSearchResults,
        mockRecent,
        mockSetRecent,
        mockSetStartCityId,
        mockSetEndCityId,
        mockSetStartCityData,
        mockSetEndCityData,
        mockSetStartQuery,
        mockSetEndQuery,
        mockSetWhereStep,
        mockStartCity as any
      )
    );

    await result.current.selectStartCity('akl');

    expect(mockSetStartCityId).toHaveBeenCalledWith('akl');
    expect(mockSetStartCityData).toHaveBeenCalledWith(mockCity);
    expect(mockSetStartQuery).toHaveBeenCalledWith('Auckland, Auckland');
    expect(mockSetWhereStep).toHaveBeenCalledWith('end');
  });

  it('should fetch start city from database if not in cache', async () => {
    const mockCity = {
      id: 'akl',
      name: 'Auckland',
      display_name: 'Auckland, Auckland',
      lat: -36.8485,
      lng: 174.7633,
    };

    vi.mocked(nzCities.getCityById).mockReturnValue(undefined);
    vi.mocked(api.fetchPlaceCoordinates).mockResolvedValue(mockCity);

    const { result } = renderHook(() =>
      useTripPlannerCitySelection(
        mockStartSearchResults,
        mockEndSearchResults,
        mockRecent,
        mockSetRecent,
        mockSetStartCityId,
        mockSetEndCityId,
        mockSetStartCityData,
        mockSetEndCityData,
        mockSetStartQuery,
        mockSetEndQuery,
        mockSetWhereStep,
        mockStartCity as any
      )
    );

    await result.current.selectStartCity('akl');

    expect(api.fetchPlaceCoordinates).toHaveBeenCalledWith('akl');
    expect(mockSetStartCityId).toHaveBeenCalledWith('akl');
  });

  it('should select end city', async () => {
    const mockCity = {
      id: 'wlg',
      name: 'Wellington',
      display_name: 'Wellington, Wellington',
      lat: -41.2865,
      lng: 174.7762,
    };

    vi.mocked(nzCities.getCityById).mockReturnValue(mockCity as any);

    const { result } = renderHook(() =>
      useTripPlannerCitySelection(
        mockStartSearchResults,
        mockEndSearchResults,
        mockRecent,
        mockSetRecent,
        mockSetStartCityId,
        mockSetEndCityId,
        mockSetStartCityData,
        mockSetEndCityData,
        mockSetStartQuery,
        mockSetEndQuery,
        mockSetWhereStep,
        mockStartCity as any
      )
    );

    await result.current.selectEndCity('wlg');

    expect(mockSetEndCityId).toHaveBeenCalledWith('wlg');
    expect(mockSetEndCityData).toHaveBeenCalledWith(mockCity);
    expect(mockSetEndQuery).toHaveBeenCalledWith('Wellington, Wellington');
  });

  it('should select return to start', () => {
    const { result } = renderHook(() =>
      useTripPlannerCitySelection(
        mockStartSearchResults,
        mockEndSearchResults,
        mockRecent,
        mockSetRecent,
        mockSetStartCityId,
        mockSetEndCityId,
        mockSetStartCityData,
        mockSetEndCityData,
        mockSetStartQuery,
        mockSetEndQuery,
        mockSetWhereStep,
        mockStartCity as any
      )
    );

    result.current.selectReturnToStart();

    expect(mockSetEndCityId).toHaveBeenCalledWith('akl');
    expect(mockSetEndQuery).toHaveBeenCalledWith('Return to start city');
  });

  it('should not select return to start if no start city', () => {
    const { result } = renderHook(() =>
      useTripPlannerCitySelection(
        mockStartSearchResults,
        mockEndSearchResults,
        mockRecent,
        mockSetRecent,
        mockSetStartCityId,
        mockSetEndCityId,
        mockSetStartCityData,
        mockSetEndCityData,
        mockSetStartQuery,
        mockSetEndQuery,
        mockSetWhereStep,
        undefined
      )
    );

    result.current.selectReturnToStart();

    expect(mockSetEndCityId).not.toHaveBeenCalled();
  });

  it('should handle city not found error', async () => {
    vi.mocked(nzCities.getCityById).mockReturnValue(undefined);
    vi.mocked(api.fetchPlaceCoordinates).mockResolvedValue(null);
    vi.mocked(nzCities.searchPlacesByName).mockResolvedValue([]);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() =>
      useTripPlannerCitySelection(
        mockStartSearchResults,
        mockEndSearchResults,
        mockRecent,
        mockSetRecent,
        mockSetStartCityId,
        mockSetEndCityId,
        mockSetStartCityData,
        mockSetEndCityData,
        mockSetStartQuery,
        mockSetEndQuery,
        mockSetWhereStep,
        mockStartCity as any
      )
    );

    await result.current.selectStartCity('invalid-id');

    expect(consoleSpy).toHaveBeenCalled();
    expect(mockSetStartCityId).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
