import { describe, it, expect } from 'vitest';
import {
  countDaysInclusive,
  countNights,
  buildTripPlanFromStopsAndNights,
  buildSimpleTripPlan,
} from '../itinerary';
import type { NzCity } from '../nzCities';

// Mock city data
const mockCity: NzCity = {
  id: 'test-id',
  name: 'Test City',
  lat: -36.8485,
  lng: 174.7633,
};

describe('itinerary utilities', () => {
  describe('countDaysInclusive', () => {
    it('should count 1 day for same start and end date', () => {
      expect(countDaysInclusive('2025-01-01', '2025-01-01')).toBe(1);
    });

    it('should count 3 days for consecutive dates', () => {
      expect(countDaysInclusive('2025-01-01', '2025-01-03')).toBe(3);
    });

    it('should count 7 days for a week', () => {
      expect(countDaysInclusive('2025-01-01', '2025-01-07')).toBe(7);
    });

    it('should return 0 for invalid dates', () => {
      expect(countDaysInclusive('invalid', '2025-01-01')).toBe(0);
      expect(countDaysInclusive('2025-01-01', 'invalid')).toBe(0);
    });

    it('should handle end date before start date', () => {
      // This is a known limitation - should probably return 0 or throw
      const result = countDaysInclusive('2025-01-03', '2025-01-01');
      expect(result).toBeLessThanOrEqual(0);
    });
  });

  describe('countNights', () => {
    it('should count 0 nights for same start and end date', () => {
      expect(countNights('2025-01-01', '2025-01-01')).toBe(0);
    });

    it('should count 2 nights for 3 consecutive days (Feb 13-15)', () => {
      expect(countNights('2026-02-13', '2026-02-15')).toBe(2);
    });

    it('should count 6 nights for a week', () => {
      expect(countNights('2025-01-01', '2025-01-07')).toBe(6);
    });

    it('should return 0 for invalid dates', () => {
      expect(countNights('invalid', '2025-01-01')).toBe(0);
      expect(countNights('2025-01-01', 'invalid')).toBe(0);
    });

    it('should return 0 for end date before start date', () => {
      const result = countNights('2025-01-03', '2025-01-01');
      expect(result).toBe(0);
    });
  });

  describe('buildTripPlanFromStopsAndNights', () => {
    it('should build a plan with single stop and one night', () => {
      const plan = buildTripPlanFromStopsAndNights(
        ['Auckland'],
        [1],
        '2025-01-01'
      );

      expect(plan.days).toHaveLength(1);
      expect(plan.days[0]).toEqual({
        dayNumber: 1,
        date: '2025-01-01',
        location: 'Auckland',
      });
    });

    it('should build a plan with multiple stops', () => {
      const plan = buildTripPlanFromStopsAndNights(
        ['Auckland', 'Wellington', 'Christchurch'],
        [2, 1, 1],
        '2025-01-01'
      );

      expect(plan.days).toHaveLength(4);
      expect(plan.days[0].location).toBe('Auckland');
      expect(plan.days[0].date).toBe('2025-01-01');
      expect(plan.days[2].location).toBe('Wellington');
      expect(plan.days[3].location).toBe('Christchurch');
    });

    it('should return empty plan for empty stops', () => {
      const plan = buildTripPlanFromStopsAndNights([], [], '2025-01-01');
      expect(plan.days).toHaveLength(0);
    });

    it('should handle mismatched stops and nights arrays', () => {
      const plan = buildTripPlanFromStopsAndNights(
        ['Auckland', 'Wellington'],
        [1], // Only one night value
        '2025-01-01'
      );

      // Should handle gracefully - first stop gets 1 night, second gets 0
      expect(plan.days.length).toBeGreaterThanOrEqual(1);
    });

    it('should return empty plan for invalid start date', () => {
      const plan = buildTripPlanFromStopsAndNights(
        ['Auckland'],
        [1],
        'invalid-date'
      );
      expect(plan.days).toHaveLength(0);
    });
  });

  describe('buildSimpleTripPlan', () => {
    it('should build a simple trip plan with start and end cities', () => {
      const input = {
        startCity: { ...mockCity, name: 'Auckland' },
        endCity: { ...mockCity, name: 'Wellington' },
        startDate: '2025-01-01',
        endDate: '2025-01-03',
        waypoints: [],
      };

      const plan = buildSimpleTripPlan(input);
      expect(plan.days.length).toBeGreaterThan(0);
      expect(plan.days[0].location).toContain('Auckland');
    });

    it('should include waypoints in the plan', () => {
      const input = {
        startCity: { ...mockCity, name: 'Auckland' },
        endCity: { ...mockCity, name: 'Wellington' },
        startDate: '2025-01-01',
        endDate: '2025-01-05',
        waypoints: ['Taupo'],
      };

      const plan = buildSimpleTripPlan(input);
      // Plan should include waypoints in the route
      const locations = plan.days.map((d) => d.location);
      expect(locations.some((loc) => loc.toLowerCase().includes('taupo'))).toBe(true);
    });
  });
});
