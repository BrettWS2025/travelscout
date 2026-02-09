import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTripPlannerHandlers } from '../useTripPlannerHandlers';
import { fromIsoDate, toIsoDate } from '@/lib/trip-planner/utils';

// Mock utils
vi.mock('@/lib/trip-planner/utils', () => ({
  fromIsoDate: vi.fn((date: string) => (date ? new Date(date) : null)),
  toIsoDate: vi.fn((date: Date) => date.toISOString().split('T')[0]),
}));

describe('useTripPlannerHandlers', () => {
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
    setDateRange: vi.fn(),
    setStartDate: vi.fn(),
    setEndDate: vi.fn(),
    setActivePill: vi.fn(),
    setShowWherePopover: vi.fn(),
    setShowCalendar: vi.fn(),
    setCalendarMonth: vi.fn(),
    setWhereStep: vi.fn(),
    setStartQuery: vi.fn(),
    setEndQuery: vi.fn(),
    setMobileSheetOpen: vi.fn(),
    setMobileActive: vi.fn(),
    setActivePlacesThingsPill: vi.fn(),
    setShowPlacesPopover: vi.fn(),
    setShowThingsPopover: vi.fn(),
    setPlacesMobileSheetOpen: vi.fn(),
    setThingsMobileSheetOpen: vi.fn(),
    setPlacesQuery: vi.fn(),
    setThingsQuery: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock window.innerWidth
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });
  });

  it('should handle date range change with both dates', () => {
    const { result } = renderHook(() =>
      useTripPlannerHandlers(
        mockStartCity as any,
        mockEndCity as any,
        '2025-01-01',
        mockSetters.setDateRange,
        mockSetters.setStartDate,
        mockSetters.setEndDate,
        mockSetters.setActivePill,
        mockSetters.setShowWherePopover,
        mockSetters.setShowCalendar,
        mockSetters.setCalendarMonth,
        mockSetters.setWhereStep,
        mockSetters.setStartQuery,
        mockSetters.setEndQuery,
        mockSetters.setMobileSheetOpen,
        mockSetters.setMobileActive,
        mockSetters.setActivePlacesThingsPill,
        mockSetters.setShowPlacesPopover,
        mockSetters.setShowThingsPopover,
        mockSetters.setPlacesMobileSheetOpen,
        mockSetters.setThingsMobileSheetOpen,
        mockSetters.setPlacesQuery,
        mockSetters.setThingsQuery
      )
    );

    const dateRange = {
      from: new Date('2025-01-01'),
      to: new Date('2025-01-05'),
    };

    result.current.handleDateRangeChange(dateRange);

    expect(mockSetters.setDateRange).toHaveBeenCalledWith(dateRange);
    expect(mockSetters.setStartDate).toHaveBeenCalled();
    expect(mockSetters.setEndDate).toHaveBeenCalled();
  });

  it('should handle date range change with only from date', () => {
    const { result } = renderHook(() =>
      useTripPlannerHandlers(
        mockStartCity as any,
        mockEndCity as any,
        '2025-01-01',
        mockSetters.setDateRange,
        mockSetters.setStartDate,
        mockSetters.setEndDate,
        mockSetters.setActivePill,
        mockSetters.setShowWherePopover,
        mockSetters.setShowCalendar,
        mockSetters.setCalendarMonth,
        mockSetters.setWhereStep,
        mockSetters.setStartQuery,
        mockSetters.setEndQuery,
        mockSetters.setMobileSheetOpen,
        mockSetters.setMobileActive,
        mockSetters.setActivePlacesThingsPill,
        mockSetters.setShowPlacesPopover,
        mockSetters.setShowThingsPopover,
        mockSetters.setPlacesMobileSheetOpen,
        mockSetters.setThingsMobileSheetOpen,
        mockSetters.setPlacesQuery,
        mockSetters.setThingsQuery
      )
    );

    const dateRange = {
      from: new Date('2025-01-01'),
      to: undefined,
    };

    result.current.handleDateRangeChange(dateRange);

    expect(mockSetters.setStartDate).toHaveBeenCalled();
    expect(mockSetters.setEndDate).toHaveBeenCalledWith('');
  });

  it('should clear dates when range is undefined', () => {
    const { result } = renderHook(() =>
      useTripPlannerHandlers(
        mockStartCity as any,
        mockEndCity as any,
        '2025-01-01',
        mockSetters.setDateRange,
        mockSetters.setStartDate,
        mockSetters.setEndDate,
        mockSetters.setActivePill,
        mockSetters.setShowWherePopover,
        mockSetters.setShowCalendar,
        mockSetters.setCalendarMonth,
        mockSetters.setWhereStep,
        mockSetters.setStartQuery,
        mockSetters.setEndQuery,
        mockSetters.setMobileSheetOpen,
        mockSetters.setMobileActive,
        mockSetters.setActivePlacesThingsPill,
        mockSetters.setShowPlacesPopover,
        mockSetters.setShowThingsPopover,
        mockSetters.setPlacesMobileSheetOpen,
        mockSetters.setThingsMobileSheetOpen,
        mockSetters.setPlacesQuery,
        mockSetters.setThingsQuery
      )
    );

    result.current.handleDateRangeChange(undefined);

    expect(mockSetters.setDateRange).toHaveBeenCalledWith(undefined);
    expect(mockSetters.setStartDate).toHaveBeenCalledWith('');
    expect(mockSetters.setEndDate).toHaveBeenCalledWith('');
  });

  it('should open where desktop popover', () => {
    const { result } = renderHook(() =>
      useTripPlannerHandlers(
        mockStartCity as any,
        mockEndCity as any,
        '2025-01-01',
        mockSetters.setDateRange,
        mockSetters.setStartDate,
        mockSetters.setEndDate,
        mockSetters.setActivePill,
        mockSetters.setShowWherePopover,
        mockSetters.setShowCalendar,
        mockSetters.setCalendarMonth,
        mockSetters.setWhereStep,
        mockSetters.setStartQuery,
        mockSetters.setEndQuery,
        mockSetters.setMobileSheetOpen,
        mockSetters.setMobileActive,
        mockSetters.setActivePlacesThingsPill,
        mockSetters.setShowPlacesPopover,
        mockSetters.setShowThingsPopover,
        mockSetters.setPlacesMobileSheetOpen,
        mockSetters.setThingsMobileSheetOpen,
        mockSetters.setPlacesQuery,
        mockSetters.setThingsQuery
      )
    );

    result.current.openWhereDesktop();

    expect(mockSetters.setActivePill).toHaveBeenCalledWith('where');
    expect(mockSetters.setShowWherePopover).toHaveBeenCalledWith(true);
    expect(mockSetters.setShowCalendar).toHaveBeenCalledWith(false);
    expect(mockSetters.setWhereStep).toHaveBeenCalledWith('start');
    expect(mockSetters.setStartQuery).toHaveBeenCalledWith('Auckland');
    expect(mockSetters.setEndQuery).toHaveBeenCalledWith('Wellington');
  });

  it('should open when desktop popover', () => {
    const { result } = renderHook(() =>
      useTripPlannerHandlers(
        mockStartCity as any,
        mockEndCity as any,
        '2025-01-01',
        mockSetters.setDateRange,
        mockSetters.setStartDate,
        mockSetters.setEndDate,
        mockSetters.setActivePill,
        mockSetters.setShowWherePopover,
        mockSetters.setShowCalendar,
        mockSetters.setCalendarMonth,
        mockSetters.setWhereStep,
        mockSetters.setStartQuery,
        mockSetters.setEndQuery,
        mockSetters.setMobileSheetOpen,
        mockSetters.setMobileActive,
        mockSetters.setActivePlacesThingsPill,
        mockSetters.setShowPlacesPopover,
        mockSetters.setShowThingsPopover,
        mockSetters.setPlacesMobileSheetOpen,
        mockSetters.setThingsMobileSheetOpen,
        mockSetters.setPlacesQuery,
        mockSetters.setThingsQuery
      )
    );

    result.current.openWhenDesktop();

    expect(mockSetters.setActivePill).toHaveBeenCalledWith('when');
    expect(mockSetters.setShowCalendar).toHaveBeenCalledWith(true);
    expect(mockSetters.setShowWherePopover).toHaveBeenCalledWith(false);
    expect(mockSetters.setCalendarMonth).toHaveBeenCalled();
  });

  it('should open places desktop on desktop', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });

    const { result } = renderHook(() =>
      useTripPlannerHandlers(
        mockStartCity as any,
        mockEndCity as any,
        '2025-01-01',
        mockSetters.setDateRange,
        mockSetters.setStartDate,
        mockSetters.setEndDate,
        mockSetters.setActivePill,
        mockSetters.setShowWherePopover,
        mockSetters.setShowCalendar,
        mockSetters.setCalendarMonth,
        mockSetters.setWhereStep,
        mockSetters.setStartQuery,
        mockSetters.setEndQuery,
        mockSetters.setMobileSheetOpen,
        mockSetters.setMobileActive,
        mockSetters.setActivePlacesThingsPill,
        mockSetters.setShowPlacesPopover,
        mockSetters.setShowThingsPopover,
        mockSetters.setPlacesMobileSheetOpen,
        mockSetters.setThingsMobileSheetOpen,
        mockSetters.setPlacesQuery,
        mockSetters.setThingsQuery
      )
    );

    result.current.openPlacesDesktop();

    expect(mockSetters.setActivePlacesThingsPill).toHaveBeenCalledWith('places');
    expect(mockSetters.setShowPlacesPopover).toHaveBeenCalledWith(true);
    expect(mockSetters.setShowThingsPopover).toHaveBeenCalledWith(false);
  });

  it('should open places mobile sheet on mobile', () => {
    Object.defineProperty(window, 'innerWidth', { value: 600, writable: true });

    const { result } = renderHook(() =>
      useTripPlannerHandlers(
        mockStartCity as any,
        mockEndCity as any,
        '2025-01-01',
        mockSetters.setDateRange,
        mockSetters.setStartDate,
        mockSetters.setEndDate,
        mockSetters.setActivePill,
        mockSetters.setShowWherePopover,
        mockSetters.setShowCalendar,
        mockSetters.setCalendarMonth,
        mockSetters.setWhereStep,
        mockSetters.setStartQuery,
        mockSetters.setEndQuery,
        mockSetters.setMobileSheetOpen,
        mockSetters.setMobileActive,
        mockSetters.setActivePlacesThingsPill,
        mockSetters.setShowPlacesPopover,
        mockSetters.setShowThingsPopover,
        mockSetters.setPlacesMobileSheetOpen,
        mockSetters.setThingsMobileSheetOpen,
        mockSetters.setPlacesQuery,
        mockSetters.setThingsQuery
      )
    );

    result.current.openPlacesDesktop();

    expect(mockSetters.setPlacesMobileSheetOpen).toHaveBeenCalledWith(true);
    expect(mockSetters.setPlacesQuery).toHaveBeenCalledWith('');
  });

  it('should open mobile sheet', () => {
    const { result } = renderHook(() =>
      useTripPlannerHandlers(
        mockStartCity as any,
        mockEndCity as any,
        '2025-01-01',
        mockSetters.setDateRange,
        mockSetters.setStartDate,
        mockSetters.setEndDate,
        mockSetters.setActivePill,
        mockSetters.setShowWherePopover,
        mockSetters.setShowCalendar,
        mockSetters.setCalendarMonth,
        mockSetters.setWhereStep,
        mockSetters.setStartQuery,
        mockSetters.setEndQuery,
        mockSetters.setMobileSheetOpen,
        mockSetters.setMobileActive,
        mockSetters.setActivePlacesThingsPill,
        mockSetters.setShowPlacesPopover,
        mockSetters.setShowThingsPopover,
        mockSetters.setPlacesMobileSheetOpen,
        mockSetters.setThingsMobileSheetOpen,
        mockSetters.setPlacesQuery,
        mockSetters.setThingsQuery
      )
    );

    result.current.openMobileSheet();

    expect(mockSetters.setMobileSheetOpen).toHaveBeenCalledWith(true);
    expect(mockSetters.setMobileActive).toHaveBeenCalledWith('where');
    expect(mockSetters.setWhereStep).toHaveBeenCalledWith('start');
  });

  it('should close mobile sheet', () => {
    const { result } = renderHook(() =>
      useTripPlannerHandlers(
        mockStartCity as any,
        mockEndCity as any,
        '2025-01-01',
        mockSetters.setDateRange,
        mockSetters.setStartDate,
        mockSetters.setEndDate,
        mockSetters.setActivePill,
        mockSetters.setShowWherePopover,
        mockSetters.setShowCalendar,
        mockSetters.setCalendarMonth,
        mockSetters.setWhereStep,
        mockSetters.setStartQuery,
        mockSetters.setEndQuery,
        mockSetters.setMobileSheetOpen,
        mockSetters.setMobileActive,
        mockSetters.setActivePlacesThingsPill,
        mockSetters.setShowPlacesPopover,
        mockSetters.setShowThingsPopover,
        mockSetters.setPlacesMobileSheetOpen,
        mockSetters.setThingsMobileSheetOpen,
        mockSetters.setPlacesQuery,
        mockSetters.setThingsQuery
      )
    );

    result.current.closeMobileSheet();

    expect(mockSetters.setMobileSheetOpen).toHaveBeenCalledWith(false);
  });
});
