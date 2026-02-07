import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET, POST } from '../trips/route';
import type { TripWithDetails } from '@/lib/domain';

// Mock Supabase server functions
const mockGetServerUser = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  getServerUser: () => mockGetServerUser(),
}));

// Mock Supabase trips functions
const mockGetTripsForUser = vi.fn();
const mockSaveTrip = vi.fn();
vi.mock('@/lib/supabase/trips', () => ({
  getTripsForUser: (...args: any[]) => mockGetTripsForUser(...args),
  saveTrip: (...args: any[]) => mockSaveTrip(...args),
}));

describe('/api/trips', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/trips', () => {
    it('should return trips for authenticated user', async () => {
      const mockUser = { id: '123e4567-e89b-12d3-a456-426614174000' };
      const mockTrips: TripWithDetails[] = [];

      mockGetServerUser.mockResolvedValue(mockUser as any);
      mockGetTripsForUser.mockResolvedValue(mockTrips);

      const request = new Request('http://localhost/api/trips');
      const response = await GET(request);
      const text = await response.text();
      const data = JSON.parse(text);
      
      expect(data).toHaveProperty('trips');
      expect(Array.isArray(data.trips)).toBe(true);
      expect(mockGetTripsForUser).toHaveBeenCalledWith(mockUser.id);
    });

    it('should return empty array for anonymous users', async () => {
      mockGetServerUser.mockResolvedValue(null);

      const request = new Request('http://localhost/api/trips');
      const response = await GET(request);
      
      expect(response.status).toBe(200);
      const text = await response.text();
      const data = JSON.parse(text);
      expect(data.trips).toEqual([]);
    });
  });

  describe('POST /api/trips', () => {
    it('should create a new trip', async () => {
      const mockUser = { id: '123e4567-e89b-12d3-a456-426614174000' };
      const tripData: TripWithDetails = {
        trip: {
          id: 'test-trip-1',
          userId: mockUser.id,
          name: 'Test Trip',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          startDate: '2025-01-01',
          endDate: '2025-01-03',
          startCityId: 'akl',
          endCityId: 'wlg',
        },
        days: [],
        activities: [],
      };

      const savedTrip: TripWithDetails = {
        ...tripData,
        trip: {
          ...tripData.trip,
          userId: mockUser.id,
        },
      };

      mockGetServerUser.mockResolvedValue(mockUser as any);
      mockSaveTrip.mockResolvedValue(savedTrip);

      const request = new Request('http://localhost/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trip: tripData }),
      });

      const response = await POST(request);
      expect(response.status).toBe(201);
      
      const text = await response.text();
      const data = JSON.parse(text);
      
      expect(data).toHaveProperty('trip');
      expect(data.trip.trip.name).toBe('Test Trip');
      expect(mockSaveTrip).toHaveBeenCalledWith(mockUser.id, expect.any(Object));
    });

    it('should return 400 for invalid request body', async () => {
      const mockUser = { id: '123e4567-e89b-12d3-a456-426614174000' };
      mockGetServerUser.mockResolvedValue(mockUser as any);

      const request = new Request('http://localhost/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invalid: 'data' }),
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
    });

    it('should return 401 if not authenticated', async () => {
      mockGetServerUser.mockResolvedValue(null);

      const tripData: TripWithDetails = {
        trip: {
          id: 'test-trip-1',
          userId: 'user-1',
          name: 'Test Trip',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          startDate: '2025-01-01',
          endDate: '2025-01-03',
          startCityId: 'akl',
          endCityId: 'wlg',
        },
        days: [],
        activities: [],
      };

      const request = new Request('http://localhost/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trip: tripData }),
      });

      const response = await POST(request);
      
      expect(response.status).toBe(401);
      const text = await response.text();
      const data = JSON.parse(text);
      expect(data.error).toContain('Authentication required');
    });

    it('should generate an ID if not provided', async () => {
      const mockUser = { id: '123e4567-e89b-12d3-a456-426614174000' };
      const tripData: Partial<TripWithDetails> = {
        trip: {
          userId: mockUser.id,
          name: 'Trip Without ID',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          startDate: '2025-01-01',
          endDate: '2025-01-03',
          startCityId: 'akl',
          endCityId: 'wlg',
        } as any,
        days: [],
        activities: [],
      };

      const savedTrip: TripWithDetails = {
        trip: {
          id: 'generated-id-123',
          userId: mockUser.id,
          name: 'Trip Without ID',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          startDate: '2025-01-01',
          endDate: '2025-01-03',
          startCityId: 'akl',
          endCityId: 'wlg',
        },
        days: [],
        activities: [],
      };

      mockGetServerUser.mockResolvedValue(mockUser as any);
      mockSaveTrip.mockResolvedValue(savedTrip);

      const request = new Request('http://localhost/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trip: tripData }),
      });

      const response = await POST(request);
      const text = await response.text();
      const data = JSON.parse(text);

      expect(data.trip.trip.id).toBeDefined();
      expect(typeof data.trip.trip.id).toBe('string');
      // Verify that saveTrip was called with a trip that has an ID
      expect(mockSaveTrip).toHaveBeenCalled();
      const callArgs = mockSaveTrip.mock.calls[0];
      expect(callArgs[1].trip.id).toBeDefined();
    });

    it('should set userId to authenticated user ID regardless of input', async () => {
      const mockUser = { id: '123e4567-e89b-12d3-a456-426614174000' };
      const tripData = {
        trip: {
          id: 'test-trip-2',
          userId: 'different-user', // Should be overridden
          name: 'Test Trip',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          startDate: '2025-01-01',
          endDate: '2025-01-03',
          startCityId: 'akl',
          endCityId: 'wlg',
        },
        days: [],
        activities: [],
      };

      const savedTrip: TripWithDetails = {
        trip: {
          ...tripData.trip,
          userId: mockUser.id, // Overridden to authenticated user
        },
        days: [],
        activities: [],
      };

      mockGetServerUser.mockResolvedValue(mockUser as any);
      mockSaveTrip.mockResolvedValue(savedTrip);

      const request = new Request('http://localhost/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trip: tripData }),
      });

      const response = await POST(request);
      const text = await response.text();
      const data = JSON.parse(text);

      // The route normalizes and sets userId to authenticated user's ID
      expect(data.trip.trip.userId).toBe(mockUser.id);
      // Verify saveTrip was called with the correct user ID
      expect(mockSaveTrip).toHaveBeenCalledWith(mockUser.id, expect.objectContaining({
        trip: expect.objectContaining({ userId: mockUser.id })
      }));
    });
  });
});
