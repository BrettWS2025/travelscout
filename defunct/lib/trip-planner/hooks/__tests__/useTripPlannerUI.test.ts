import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useTripPlannerUI } from '../useTripPlannerUI';

describe('useTripPlannerUI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset body overflow
    document.body.style.overflow = '';
  });

  it('should initialize with default values', () => {
    const { result } = renderHook(() => useTripPlannerUI());

    expect(result.current.activePill).toBeNull();
    expect(result.current.showWherePopover).toBe(false);
    expect(result.current.showCalendar).toBe(false);
    expect(result.current.mobileSheetOpen).toBe(false);
    expect(result.current.mobileActive).toBe('where');
    expect(result.current.whereStep).toBe('start');
    expect(result.current.activePlacesThingsPill).toBeNull();
    expect(result.current.showPlacesPopover).toBe(false);
    expect(result.current.showThingsPopover).toBe(false);
  });

  it('should update activePill', async () => {
    const { result } = renderHook(() => useTripPlannerUI());

    act(() => {
      result.current.setActivePill('where');
    });

    await waitFor(() => {
      expect(result.current.activePill).toBe('where');
    });

    act(() => {
      result.current.setActivePill('when');
    });

    await waitFor(() => {
      expect(result.current.activePill).toBe('when');
    });

    act(() => {
      result.current.setActivePill(null);
    });

    await waitFor(() => {
      expect(result.current.activePill).toBeNull();
    });
  });

  it('should update showWherePopover', async () => {
    const { result } = renderHook(() => useTripPlannerUI());

    act(() => {
      result.current.setShowWherePopover(true);
    });

    await waitFor(() => {
      expect(result.current.showWherePopover).toBe(true);
    });

    act(() => {
      result.current.setShowWherePopover(false);
    });

    await waitFor(() => {
      expect(result.current.showWherePopover).toBe(false);
    });
  });

  it('should update showCalendar', async () => {
    const { result } = renderHook(() => useTripPlannerUI());

    act(() => {
      result.current.setShowCalendar(true);
    });

    await waitFor(() => {
      expect(result.current.showCalendar).toBe(true);
    });
  });

  it('should update mobileSheetOpen', async () => {
    const { result } = renderHook(() => useTripPlannerUI());

    act(() => {
      result.current.setMobileSheetOpen(true);
    });

    await waitFor(() => {
      expect(result.current.mobileSheetOpen).toBe(true);
    });
  });

  it('should update mobileActive', async () => {
    const { result } = renderHook(() => useTripPlannerUI());

    act(() => {
      result.current.setMobileActive('when');
    });

    await waitFor(() => {
      expect(result.current.mobileActive).toBe('when');
    });
  });

  it('should update whereStep', async () => {
    const { result } = renderHook(() => useTripPlannerUI());

    act(() => {
      result.current.setWhereStep('end');
    });

    await waitFor(() => {
      expect(result.current.whereStep).toBe('end');
    });

    act(() => {
      result.current.setWhereStep('start');
    });

    await waitFor(() => {
      expect(result.current.whereStep).toBe('start');
    });
  });

  it('should update activePlacesThingsPill', async () => {
    const { result } = renderHook(() => useTripPlannerUI());

    act(() => {
      result.current.setActivePlacesThingsPill('places');
    });

    await waitFor(() => {
      expect(result.current.activePlacesThingsPill).toBe('places');
    });

    act(() => {
      result.current.setActivePlacesThingsPill('things');
    });

    await waitFor(() => {
      expect(result.current.activePlacesThingsPill).toBe('things');
    });

    act(() => {
      result.current.setActivePlacesThingsPill(null);
    });

    await waitFor(() => {
      expect(result.current.activePlacesThingsPill).toBeNull();
    });
  });

  it('should lock body scroll when mobile sheet is open', async () => {
    const { result, rerender } = renderHook(() => useTripPlannerUI());

    result.current.setMobileSheetOpen(true);
    rerender();

    await waitFor(() => {
      expect(document.body.style.overflow).toBe('hidden');
    });

    result.current.setMobileSheetOpen(false);
    rerender();

    await waitFor(() => {
      expect(document.body.style.overflow).toBe('');
    });
  });

  it('should provide refs', () => {
    const { result } = renderHook(() => useTripPlannerUI());

    expect(result.current.whereRef).toBeDefined();
    expect(result.current.whenRef).toBeDefined();
    expect(result.current.placesRef).toBeDefined();
    expect(result.current.thingsRef).toBeDefined();
  });
});
