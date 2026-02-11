import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useGeolocation } from '../useGeolocation';
import * as places from '@/lib/places';

// Mock the places module
vi.mock('@/lib/places', () => ({
  findPlacesNearby: vi.fn(),
}));

describe('useGeolocation', () => {
  const mockGetCurrentPosition = vi.fn();
  const mockGeolocation = {
    getCurrentPosition: mockGetCurrentPosition,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock navigator.geolocation
    Object.defineProperty(global.navigator, 'geolocation', {
      value: mockGeolocation,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return error if geolocation is not supported', () => {
    Object.defineProperty(global.navigator, 'geolocation', {
      value: undefined,
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useGeolocation());

    expect(result.current.error).toBe('Geolocation is not supported by your browser');
    expect(result.current.isLoading).toBe(false);
  });

  it('should detect location outside New Zealand', async () => {
    // Location in Australia (outside NZ bounds)
    const position = {
      coords: {
        latitude: -37.8136,
        longitude: 144.9631, // Melbourne, Australia
      },
    };

    mockGetCurrentPosition.mockImplementation((success) => {
      success(position);
    });

    const { result } = renderHook(() => useGeolocation());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isOutsideNZ).toBe(true);
    expect(result.current.error).toBe('Location is outside New Zealand');
    expect(result.current.nearestPlace).toBeNull();
  });

  it('should find nearest place when location is in NZ', async () => {
    // Location in Christchurch, NZ
    const position = {
      coords: {
        latitude: -43.5321,
        longitude: 172.6362,
      },
    };

    const mockPlace = {
      id: 'test-id',
      name: 'Christchurch',
      lat: -43.5321,
      lng: 172.6362,
    };

    vi.mocked(places.findPlacesNearby).mockResolvedValue([mockPlace] as any);

    mockGetCurrentPosition.mockImplementation((success) => {
      success(position);
    });

    const { result } = renderHook(() => useGeolocation());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.nearestPlace).toEqual(mockPlace);
    expect(result.current.isOutsideNZ).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.userLocation).toEqual({ lat: -43.5321, lng: 172.6362 });
  });

  it('should expand search radius if no places found within 10km', async () => {
    const position = {
      coords: {
        latitude: -43.5321,
        longitude: 172.6362,
      },
    };

    const mockPlace = {
      id: 'test-id',
      name: 'Auckland',
      lat: -36.8485,
      lng: 174.7633,
    };

    // First call returns empty, second call returns a place
    vi.mocked(places.findPlacesNearby)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([mockPlace] as any);

    mockGetCurrentPosition.mockImplementation((success) => {
      success(position);
    });

    const { result } = renderHook(() => useGeolocation());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(places.findPlacesNearby).toHaveBeenCalledTimes(2);
    expect(places.findPlacesNearby).toHaveBeenNthCalledWith(1, -43.5321, 172.6362, 10);
    expect(places.findPlacesNearby).toHaveBeenNthCalledWith(2, -43.5321, 172.6362, 50);
    expect(result.current.nearestPlace).toEqual(mockPlace);
  });

  it('should handle geolocation permission denied', async () => {
    const error = {
      code: 1,
      message: 'User denied geolocation',
    };

    mockGetCurrentPosition.mockImplementation((success, errorCallback) => {
      errorCallback(error);
    });

    const { result } = renderHook(() => useGeolocation());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('Location permission denied');
    expect(result.current.nearestPlace).toBeNull();
  });

  it('should handle geolocation unavailable', async () => {
    const error = {
      code: 2,
      message: 'Location unavailable',
    };

    mockGetCurrentPosition.mockImplementation((success, errorCallback) => {
      errorCallback(error);
    });

    const { result } = renderHook(() => useGeolocation());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('Location unavailable');
  });

  it('should handle geolocation timeout', async () => {
    const error = {
      code: 3,
      message: 'Timeout',
    };

    mockGetCurrentPosition.mockImplementation((success, errorCallback) => {
      errorCallback(error);
    });

    const { result } = renderHook(() => useGeolocation());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('Location request timeout');
  });

  it('should handle error when finding nearby places fails', async () => {
    const position = {
      coords: {
        latitude: -43.5321,
        longitude: 172.6362,
      },
    };

    vi.mocked(places.findPlacesNearby).mockRejectedValue(new Error('Network error'));

    mockGetCurrentPosition.mockImplementation((success) => {
      success(position);
    });

    const { result } = renderHook(() => useGeolocation());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('Could not find nearby places');
    expect(result.current.nearestPlace).toBeNull();
  });

  it('should handle case when no nearby places are found', async () => {
    const position = {
      coords: {
        latitude: -43.5321,
        longitude: 172.6362,
      },
    };

    vi.mocked(places.findPlacesNearby)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    mockGetCurrentPosition.mockImplementation((success) => {
      success(position);
    });

    const { result } = renderHook(() => useGeolocation());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('No nearby places found');
    expect(result.current.nearestPlace).toBeNull();
  });

  it('should check NZ bounds correctly', async () => {
    // Test location at NZ boundary (should be valid)
    const position = {
      coords: {
        latitude: -34.0, // Northern boundary
        longitude: 166.0, // Western boundary
      },
    };

    const mockPlace = {
      id: 'test-id',
      name: 'Test Place',
      lat: -34.0,
      lng: 166.0,
    };

    vi.mocked(places.findPlacesNearby).mockResolvedValue([mockPlace] as any);

    mockGetCurrentPosition.mockImplementation((success) => {
      success(position);
    });

    const { result } = renderHook(() => useGeolocation());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isOutsideNZ).toBe(false);
  });
});
