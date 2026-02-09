import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useTripPlannerPlaces } from '../useTripPlannerPlaces';
import * as nzCities from '@/lib/nzCities';
import * as api from '@/lib/trip-planner/useTripPlanner.api';
import * as utils from '@/lib/trip-planner/useTripPlanner.utils';
import { NZ_STOPS } from '@/lib/nzStops';

// Mock dependencies
vi.mock('@/lib/nzCities', () => ({
  getCityById: vi.fn(),
}));

vi.mock('@/lib/trip-planner/useTripPlanner.api', () => ({
  fetchPlaceCoordinates: vi.fn(),
}));

vi.mock('@/lib/trip-planner/useTripPlanner.utils', () => ({
  pushRecent: vi.fn((city, recent) => [city, ...recent.filter((r: any) => r.id !== city.id)].slice(0, 5)),
}));

vi.mock('@/lib/nzStops', () => ({
  NZ_STOPS: [
    { id: 'stop1', name: 'Waitomo Caves', lat: -38.26, lng: 175.1 },
    { id: 'stop2', name: 'Rotorua', lat: -38.14, lng: 176.25 },
  ],
}));

describe('useTripPlannerPlaces', () => {
  const mockRecent: any[] = [];
  const mockSetRecent = vi.fn();
  const mockPlacesSearchResults = [
    { id: 'akl', name: 'Auckland', cityName: 'Auckland', district: '' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with empty selections', () => {
    const { result } = renderHook(() =>
      useTripPlannerPlaces(mockRecent, mockSetRecent, mockPlacesSearchResults)
    );

    expect(result.current.selectedPlaceIds).toEqual([]);
    expect(result.current.selectedThingIds).toEqual([]);
    expect(result.current.selectedPlaces).toEqual([]);
    expect(result.current.selectedThings).toEqual([]);
    expect(result.current.placesSummary).toBe('Add trip stops');
    expect(result.current.thingsSummary).toBe('Add things to do');
  });

  it('should select a place', async () => {
    const mockPlace = {
      id: 'akl',
      name: 'Auckland',
      display_name: 'Auckland, Auckland',
      lat: -36.8485,
      lng: 174.7633,
    };

    vi.mocked(nzCities.getCityById).mockReturnValue(mockPlace as any);

    const { result } = renderHook(() =>
      useTripPlannerPlaces(mockRecent, mockSetRecent, mockPlacesSearchResults)
    );

    await act(async () => {
      await result.current.selectPlace('akl');
    });

    await waitFor(() => {
      expect(result.current.selectedPlaceIds).toContain('akl');
      expect(result.current.selectedPlaceIds).toHaveLength(1);
    });
  });

  it('should not add duplicate places', async () => {
    const mockPlace = {
      id: 'akl',
      name: 'Auckland',
      lat: -36.8485,
      lng: 174.7633,
    };

    vi.mocked(nzCities.getCityById).mockReturnValue(mockPlace as any);

    const { result } = renderHook(() =>
      useTripPlannerPlaces(mockRecent, mockSetRecent, mockPlacesSearchResults)
    );

    await act(async () => {
      await result.current.selectPlace('akl');
      await result.current.selectPlace('akl'); // Try to add again
    });

    await waitFor(() => {
      expect(result.current.selectedPlaceIds).toHaveLength(1);
    });
  });

  it('should remove a place', async () => {
    const mockPlace = {
      id: 'akl',
      name: 'Auckland',
      lat: -36.8485,
      lng: 174.7633,
    };

    vi.mocked(nzCities.getCityById).mockReturnValue(mockPlace as any);

    const { result } = renderHook(() =>
      useTripPlannerPlaces(mockRecent, mockSetRecent, mockPlacesSearchResults)
    );

    await act(async () => {
      await result.current.selectPlace('akl');
    });

    await waitFor(() => {
      expect(result.current.selectedPlaceIds).toContain('akl');
    });

    act(() => {
      result.current.removePlace('akl');
    });

    await waitFor(() => {
      expect(result.current.selectedPlaceIds).not.toContain('akl');
    });
  });

  it('should select a thing', async () => {
    const { result } = renderHook(() =>
      useTripPlannerPlaces(mockRecent, mockSetRecent, mockPlacesSearchResults)
    );

    act(() => {
      result.current.selectThing('stop1');
    });

    await waitFor(() => {
      expect(result.current.selectedThingIds).toContain('stop1');
      expect(result.current.selectedThings.length).toBe(1);
      expect(result.current.selectedThings[0].name).toBe('Waitomo Caves');
    });
  });

  it('should not add duplicate things', async () => {
    const { result } = renderHook(() =>
      useTripPlannerPlaces(mockRecent, mockSetRecent, mockPlacesSearchResults)
    );

    act(() => {
      result.current.selectThing('stop1');
      result.current.selectThing('stop1'); // Try to add again
    });

    await waitFor(() => {
      expect(result.current.selectedThingIds).toHaveLength(1);
    });
  });

  it('should remove a thing', async () => {
    const { result } = renderHook(() =>
      useTripPlannerPlaces(mockRecent, mockSetRecent, mockPlacesSearchResults)
    );

    act(() => {
      result.current.selectThing('stop1');
    });

    await waitFor(() => {
      expect(result.current.selectedThingIds).toContain('stop1');
    });

    act(() => {
      result.current.removeThing('stop1');
    });

    await waitFor(() => {
      expect(result.current.selectedThingIds).not.toContain('stop1');
    });
  });

  it('should update places summary', async () => {
    const mockPlace = {
      id: 'akl',
      name: 'Auckland',
      lat: -36.8485,
      lng: 174.7633,
    };

    vi.mocked(nzCities.getCityById).mockReturnValue(mockPlace as any);

    const { result } = renderHook(() =>
      useTripPlannerPlaces(mockRecent, mockSetRecent, mockPlacesSearchResults)
    );

    await act(async () => {
      await result.current.selectPlace('akl');
    });

    await waitFor(() => {
      expect(result.current.placesSummary).toBe('1 place selected');
    });

    // Add another place
    const mockPlace2 = {
      id: 'wlg',
      name: 'Wellington',
      lat: -41.2865,
      lng: 174.7762,
    };
    vi.mocked(nzCities.getCityById).mockReturnValue(mockPlace2 as any);
    
    await act(async () => {
      await result.current.selectPlace('wlg');
    });

    await waitFor(() => {
      expect(result.current.placesSummary).toBe('2 places selected');
    });
  });

  it('should update things summary', async () => {
    const { result } = renderHook(() =>
      useTripPlannerPlaces(mockRecent, mockSetRecent, mockPlacesSearchResults)
    );

    act(() => {
      result.current.selectThing('stop1');
    });

    await waitFor(() => {
      expect(result.current.thingsSummary).toBe('1 thing selected');
    });

    act(() => {
      result.current.selectThing('stop2');
    });

    await waitFor(() => {
      expect(result.current.thingsSummary).toBe('2 things selected');
    });
  });

  it('should fetch place from database if not in cache', async () => {
    const mockPlace = {
      id: 'akl',
      name: 'Auckland',
      lat: -36.8485,
      lng: 174.7633,
    };

    vi.mocked(nzCities.getCityById).mockReturnValue(undefined);
    vi.mocked(api.fetchPlaceCoordinates).mockResolvedValue(mockPlace);

    const { result } = renderHook(() =>
      useTripPlannerPlaces(mockRecent, mockSetRecent, mockPlacesSearchResults)
    );

    await act(async () => {
      await result.current.selectPlace('akl');
    });

    expect(api.fetchPlaceCoordinates).toHaveBeenCalled();
    
    await waitFor(() => {
      expect(result.current.selectedPlaceIds).toContain('akl');
    });
  });
});
